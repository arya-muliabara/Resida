from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import (
    COMPLEX_ADMIN_ROLES,
    MarketplaceComment,
    MarketplaceImage,
    MarketplaceLike,
    MarketplacePost,
    MarketplaceStatus,
    User,
    UserRole,
)
from app.schemas.marketplace import (
    MarketplaceCommentCreate,
    MarketplaceCommentRead,
    MarketplacePostCreate,
    MarketplacePostRead,
    MarketplacePostUpdate,
    MarketplaceReview,
)

router = APIRouter(prefix="/marketplace", tags=["marketplace"])


def get_post(db: Session, post_id: int) -> MarketplacePost:
    post = db.scalar(select(MarketplacePost).where(MarketplacePost.id == post_id, MarketplacePost.is_deleted.is_(False)))
    if not post:
        raise HTTPException(status_code=404, detail="Marketplace post not found")
    return post


def serialize_post(db: Session, post: MarketplacePost, user: User) -> MarketplacePostRead:
    images = list(
        db.scalars(
            select(MarketplaceImage.image_url)
            .where(MarketplaceImage.marketplace_post_id == post.id, MarketplaceImage.is_deleted.is_(False))
            .order_by(MarketplaceImage.sort_order, MarketplaceImage.id)
        )
    )
    likes_count = db.scalar(select(func.count(MarketplaceLike.id)).where(MarketplaceLike.marketplace_post_id == post.id)) or 0
    comments_count = db.scalar(
        select(func.count(MarketplaceComment.id)).where(
            MarketplaceComment.marketplace_post_id == post.id,
            MarketplaceComment.is_deleted.is_(False),
        )
    ) or 0
    author = db.get(User, post.author_id)
    reviewer = db.get(User, post.reviewed_by) if post.reviewed_by else None
    data = MarketplacePostRead.model_validate(post).model_dump()
    data.update(
        {
            "author_name": author.full_name if author else "Penghuni",
            "reviewer_name": reviewer.full_name if reviewer else None,
            "image_urls": images,
            "likes_count": likes_count,
            "comments_count": comments_count,
            "liked_by_me": bool(
                db.scalar(
                    select(MarketplaceLike.id).where(
                        MarketplaceLike.marketplace_post_id == post.id,
                        MarketplaceLike.user_id == user.id,
                    )
                )
            ),
        }
    )
    return MarketplacePostRead(**data)


def replace_images(db: Session, post_id: int, image_urls: list[str]) -> None:
    for image in db.scalars(
        select(MarketplaceImage).where(MarketplaceImage.marketplace_post_id == post_id, MarketplaceImage.is_deleted.is_(False))
    ):
        image.soft_delete()
    for position, image_url in enumerate(image_urls):
        db.add(MarketplaceImage(marketplace_post_id=post_id, image_url=image_url, sort_order=position))


@router.get("", response_model=list[MarketplacePostRead])
def list_marketplace(q: str | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[MarketplacePostRead]:
    complex_id = user_complex_id(user)
    query = select(MarketplacePost).where(
        MarketplacePost.complex_id == complex_id,
        MarketplacePost.status == MarketplaceStatus.approved,
        MarketplacePost.is_deleted.is_(False),
    )
    if q:
        query = query.where(MarketplacePost.title.ilike(f"%{q}%") | MarketplacePost.description.ilike(f"%{q}%"))
    posts = db.scalars(query.order_by(MarketplacePost.published_at.desc(), MarketplacePost.created_at.desc())).all()
    return [serialize_post(db, post, user) for post in posts]


@router.get("/mine", response_model=list[MarketplacePostRead])
def list_my_posts(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> list[MarketplacePostRead]:
    posts = db.scalars(
        select(MarketplacePost)
        .where(MarketplacePost.author_id == user.id, MarketplacePost.is_deleted.is_(False))
        .order_by(MarketplacePost.updated_at.desc(), MarketplacePost.created_at.desc())
    ).all()
    return [serialize_post(db, post, user) for post in posts]


@router.get("/requests", response_model=list[MarketplacePostRead])
def list_requests(
    review_status: MarketplaceStatus | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> list[MarketplacePostRead]:
    query = select(MarketplacePost).where(
        MarketplacePost.complex_id == user_complex_id(user),
        MarketplacePost.is_deleted.is_(False),
    )
    if review_status:
        query = query.where(MarketplacePost.status == review_status)
    posts = db.scalars(query.order_by(MarketplacePost.updated_at.desc(), MarketplacePost.created_at.desc())).all()
    return [serialize_post(db, post, user) for post in posts]


@router.post("", response_model=MarketplacePostRead, status_code=status.HTTP_201_CREATED)
def create_post(
    payload: MarketplacePostCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> MarketplacePostRead:
    values = payload.model_dump(exclude={"image_urls"})
    post = MarketplacePost(complex_id=user_complex_id(user), author_id=user.id, **values)
    db.add(post)
    db.flush()
    replace_images(db, post.id, payload.image_urls)
    db.commit()
    db.refresh(post)
    return serialize_post(db, post, user)


@router.patch("/{post_id}", response_model=MarketplacePostRead)
def update_post(
    post_id: int,
    payload: MarketplacePostUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> MarketplacePostRead:
    post = get_post(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="Anda hanya dapat mengubah posting sendiri")
    values = payload.model_dump(exclude_unset=True, exclude={"image_urls"})
    for key, value in values.items():
        setattr(post, key, value)
    if payload.image_urls is not None:
        replace_images(db, post.id, payload.image_urls)
    post.status = MarketplaceStatus.pending
    post.rejection_reason = None
    post.reviewed_by = None
    post.reviewed_at = None
    post.published_at = None
    db.commit()
    db.refresh(post)
    return serialize_post(db, post, user)


@router.delete("/{post_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(
    post_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> None:
    post = get_post(db, post_id)
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="Anda hanya dapat menghapus posting sendiri")
    post.soft_delete()
    db.commit()


@router.patch("/{post_id}/review", response_model=MarketplacePostRead)
def review_post(
    post_id: int,
    payload: MarketplaceReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> MarketplacePostRead:
    post = get_post(db, post_id)
    ensure_complex_access(db, user, post.complex_id)
    if payload.status not in {MarketplaceStatus.approved, MarketplaceStatus.rejected}:
        raise HTTPException(status_code=400, detail="Status review harus approved atau rejected")
    if payload.status == MarketplaceStatus.rejected and not (payload.rejection_reason or "").strip():
        raise HTTPException(status_code=400, detail="Alasan reject wajib diisi")
    post.status = payload.status
    post.rejection_reason = payload.rejection_reason.strip() if payload.status == MarketplaceStatus.rejected else None
    post.reviewed_by = user.id
    post.reviewed_at = datetime.utcnow()
    post.published_at = datetime.utcnow() if payload.status == MarketplaceStatus.approved else None
    db.commit()
    db.refresh(post)
    return serialize_post(db, post, user)


@router.post("/{post_id}/like")
def toggle_like(post_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, bool]:
    post = get_post(db, post_id)
    ensure_complex_access(db, user, post.complex_id)
    if post.status != MarketplaceStatus.approved:
        raise HTTPException(status_code=404, detail="Marketplace post not found")
    like = db.scalar(
        select(MarketplaceLike).where(MarketplaceLike.marketplace_post_id == post.id, MarketplaceLike.user_id == user.id)
    )
    if like:
        db.execute(delete(MarketplaceLike).where(MarketplaceLike.id == like.id))
        liked = False
    else:
        db.add(MarketplaceLike(marketplace_post_id=post.id, user_id=user.id))
        liked = True
    db.commit()
    return {"liked": liked}


@router.get("/{post_id}/comments", response_model=list[MarketplaceCommentRead])
def list_comments(post_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[MarketplaceCommentRead]:
    post = get_post(db, post_id)
    ensure_complex_access(db, user, post.complex_id)
    if post.status != MarketplaceStatus.approved:
        raise HTTPException(status_code=404, detail="Marketplace post not found")
    comments = db.scalars(
        select(MarketplaceComment)
        .where(MarketplaceComment.marketplace_post_id == post.id, MarketplaceComment.is_deleted.is_(False))
        .order_by(MarketplaceComment.created_at.asc())
    ).all()
    result = []
    for comment in comments:
        data = MarketplaceCommentRead.model_validate(comment).model_dump()
        author = db.get(User, comment.user_id)
        data["user_name"] = author.full_name if author else "Penghuni"
        result.append(MarketplaceCommentRead(**data))
    return result


@router.post("/{post_id}/comments", response_model=MarketplaceCommentRead, status_code=status.HTTP_201_CREATED)
def add_comment(
    post_id: int,
    payload: MarketplaceCommentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MarketplaceCommentRead:
    post = get_post(db, post_id)
    ensure_complex_access(db, user, post.complex_id)
    if post.status != MarketplaceStatus.approved:
        raise HTTPException(status_code=404, detail="Marketplace post not found")
    comment = MarketplaceComment(marketplace_post_id=post.id, user_id=user.id, comment=payload.comment)
    db.add(comment)
    db.commit()
    db.refresh(comment)
    data = MarketplaceCommentRead.model_validate(comment).model_dump()
    data["user_name"] = user.full_name
    return MarketplaceCommentRead(**data)
