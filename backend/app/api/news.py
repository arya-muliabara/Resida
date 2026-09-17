from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import News, NewsComment, NewsLike, NewsMedia, User, UserRole
from app.models.entities import NotificationType
from app.schemas.news import CommentCreate, CommentRead, NewsCreate, NewsRead, NewsUpdate
from app.services.notifications import notify_users, users_by_roles

router = APIRouter(prefix="/news", tags=["news"])


def serialize_news(db: Session, news: News, user: User) -> NewsRead:
    likes_count = db.scalar(select(func.count(NewsLike.id)).where(NewsLike.news_id == news.id)) or 0
    comments_count = db.scalar(
        select(func.count(NewsComment.id)).where(NewsComment.news_id == news.id, NewsComment.is_deleted.is_(False))
    ) or 0
    liked_by_me = bool(
        db.scalar(select(NewsLike.id).where(NewsLike.news_id == news.id, NewsLike.user_id == user.id))
    )
    media = db.scalars(
        select(NewsMedia)
        .where(NewsMedia.news_id == news.id, NewsMedia.is_deleted.is_(False))
        .order_by(NewsMedia.id.asc())
    ).all()
    data = NewsRead.model_validate(news).model_dump()
    data.update({"likes_count": likes_count, "comments_count": comments_count, "liked_by_me": liked_by_me, "media": media})
    return NewsRead(**data)


def sync_news_media(db: Session, news: News, media_urls: list[str]) -> None:
    for item in db.scalars(select(NewsMedia).where(NewsMedia.news_id == news.id, NewsMedia.is_deleted.is_(False))):
        item.soft_delete()
    for url in media_urls:
        clean_url = str(url).strip()
        if clean_url:
            db.add(NewsMedia(news_id=news.id, file_url=clean_url, file_name=clean_url.rsplit("/", 1)[-1]))


def serialize_comment(db: Session, comment: NewsComment) -> CommentRead:
    author = db.get(User, comment.user_id)
    data = CommentRead.model_validate(comment).model_dump()
    data["author_name"] = author.full_name if author else None
    return CommentRead(**data)


@router.get("", response_model=list[NewsRead])
def list_news(
    q: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[NewsRead]:
    complex_id = user_complex_id(user)
    query = select(News).where(News.complex_id == complex_id, News.is_deleted.is_(False))
    if user.role != UserRole.administrator:
        query = query.where(News.is_active.is_(True))
    if q:
        query = query.where(News.title.ilike(f"%{q}%") | News.content.ilike(f"%{q}%"))
    items = db.scalars(query.order_by(News.updated_at.desc(), News.id.desc())).all()
    return [serialize_news(db, item, user) for item in items]


@router.get("/contributions/mine", response_model=list[NewsRead])
def list_my_contributions(db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.penghuni))) -> list[NewsRead]:
    rows = db.scalars(
        select(News)
        .where(News.complex_id == user_complex_id(user), News.author_id == user.id, News.is_deleted.is_(False))
        .order_by(News.updated_at.desc(), News.id.desc())
    ).all()
    return [serialize_news(db, item, user) for item in rows]


@router.post("/contributions", response_model=NewsRead, status_code=status.HTTP_201_CREATED)
def create_news_contribution(
    payload: NewsCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> NewsRead:
    complex_id = user_complex_id(user)
    data = payload.model_dump()
    media_urls = data.pop("media_urls", [])
    if media_urls and not data.get("cover_image_url"):
        data["cover_image_url"] = media_urls[0]
    data["is_active"] = False
    news = News(complex_id=complex_id, author_id=user.id, **data)
    db.add(news)
    db.flush()
    sync_news_media(db, news, media_urls)
    notify_users(
        db,
        users_by_roles(db, complex_id, [UserRole.administrator]),
        NotificationType.news_contribution,
        "Kontribusi berita baru",
        f"{user.full_name} mengirim berita: {news.title}",
        "news",
        news.id,
    )
    db.commit()
    db.refresh(news)
    return serialize_news(db, news, user)


@router.post("", response_model=NewsRead, status_code=status.HTTP_201_CREATED)
def create_news(
    payload: NewsCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> NewsRead:
    complex_id = user_complex_id(user)
    data = payload.model_dump()
    media_urls = data.pop("media_urls", [])
    if media_urls and not data.get("cover_image_url"):
        data["cover_image_url"] = media_urls[0]
    news = News(complex_id=complex_id, author_id=user.id, **data)
    db.add(news)
    db.commit()
    db.refresh(news)
    sync_news_media(db, news, media_urls)
    db.commit()
    db.refresh(news)
    if news.is_active:
        notify_users(
            db,
            users_by_roles(db, complex_id, [UserRole.penghuni, UserRole.security, UserRole.supports]),
            NotificationType.news_published,
            "Update komplek terbaru",
            news.title,
            "news",
            news.id,
        )
        db.commit()
    return serialize_news(db, news, user)


@router.get("/{news_id}", response_model=NewsRead)
def get_news(news_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> NewsRead:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    return serialize_news(db, news, user)


@router.patch("/{news_id}", response_model=NewsRead)
def update_news(
    news_id: int,
    payload: NewsUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> NewsRead:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    data = payload.model_dump(exclude_unset=True)
    media_urls = data.pop("media_urls", None)
    if media_urls:
        data["cover_image_url"] = media_urls[0]
    for key, value in data.items():
        setattr(news, key, value)
    if media_urls is not None:
        sync_news_media(db, news, media_urls)
    if data.get("is_active") is True:
        notify_users(
            db,
            users_by_roles(db, news.complex_id, [UserRole.penghuni, UserRole.security, UserRole.supports]),
            NotificationType.news_published,
            "Update komplek terbaru",
            news.title,
            "news",
            news.id,
        )
    db.commit()
    db.refresh(news)
    return serialize_news(db, news, user)


@router.delete("/{news_id}")
def delete_news(
    news_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> dict[str, str]:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    news.soft_delete()
    db.commit()
    return {"message": "News deleted"}


@router.post("/{news_id}/like")
def toggle_like(news_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, bool]:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    like = db.scalar(select(NewsLike).where(NewsLike.news_id == news_id, NewsLike.user_id == user.id))
    if like:
        db.execute(delete(NewsLike).where(NewsLike.id == like.id))
        liked = False
    else:
        db.add(NewsLike(news_id=news_id, user_id=user.id))
        liked = True
    db.commit()
    return {"liked": liked}


@router.get("/{news_id}/comments", response_model=list[CommentRead])
def list_comments(news_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[CommentRead]:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    rows = db.scalars(
        select(NewsComment)
        .where(NewsComment.news_id == news_id, NewsComment.is_deleted.is_(False))
        .order_by(NewsComment.created_at.asc())
    ).all()
    return [serialize_comment(db, row) for row in rows]


@router.post("/{news_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
def add_comment(
    news_id: int,
    payload: CommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CommentRead:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    comment = NewsComment(news_id=news_id, user_id=user.id, comment=payload.comment)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return serialize_comment(db, comment)


@router.delete("/{news_id}/comments/{comment_id}")
def delete_comment(
    news_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    news = db.scalar(select(News).where(News.id == news_id, News.is_deleted.is_(False)))
    if not news:
        raise HTTPException(status_code=404, detail="News not found")
    ensure_complex_access(db, user, news.complex_id)
    comment = db.scalar(
        select(NewsComment).where(
            NewsComment.id == comment_id,
            NewsComment.news_id == news_id,
            NewsComment.is_deleted.is_(False),
        )
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.user_id != user.id:
        raise HTTPException(status_code=403, detail="Tidak bisa menghapus komentar orang lain")
    comment.soft_delete()
    db.commit()
    return {"message": "Comment deleted"}
