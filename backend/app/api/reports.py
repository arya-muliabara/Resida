from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import (
    AttachmentSource,
    News,
    NewsMedia,
    NotificationType,
    Report,
    ReportAttachment,
    ReportFollowUp,
    ReportStatus,
    User,
    UserRole,
)
from app.schemas.reports import ReportCreate, ReportFollowUpCreate, ReportRead, ReportUpdate
from app.services.notifications import notify_users, users_by_roles

router = APIRouter(prefix="/reports", tags=["reports"])


STAFF_ROLES = [UserRole.administrator, UserRole.security]


def serialize_report(db: Session, report: Report) -> ReportRead:
    reporter = db.get(User, report.reporter_id)
    attachments = db.scalars(
        select(ReportAttachment)
        .where(ReportAttachment.report_id == report.id, ReportAttachment.is_deleted.is_(False))
        .order_by(ReportAttachment.id.asc())
    ).all()
    followups = db.scalars(
        select(ReportFollowUp)
        .where(ReportFollowUp.report_id == report.id, ReportFollowUp.is_deleted.is_(False))
        .order_by(ReportFollowUp.created_at.asc())
    ).all()
    followup_rows = []
    for followup in followups:
        handler = db.get(User, followup.user_id)
        followup_data = followup.__dict__.copy()
        followup_data["handler_name"] = handler.full_name if handler else None
        followup_data["attachments"] = [
            item for item in attachments if item.source == AttachmentSource.administrator and item.created_at >= followup.created_at
        ]
        followup_rows.append(followup_data)
    data = ReportRead.model_validate(report).model_dump()
    data.update({"reporter_name": reporter.full_name if reporter else None, "attachments": attachments, "followups": followup_rows})
    return ReportRead(**data)


def add_attachments(db: Session, report: Report, urls: list[str], user: User, source: AttachmentSource) -> None:
    for url in urls:
        clean_url = str(url).strip()
        if clean_url:
            db.add(
                ReportAttachment(
                    report_id=report.id,
                    uploaded_by=user.id,
                    source=source,
                    file_url=clean_url,
                    file_name=clean_url.rsplit("/", 1)[-1],
                )
            )


@router.get("", response_model=list[ReportRead])
def list_reports(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[ReportRead]:
    complex_id = user_complex_id(user)
    query = select(Report).where(Report.complex_id == complex_id, Report.is_deleted.is_(False))
    if user.role == UserRole.penghuni:
        query = query.where(Report.reporter_id == user.id)
    elif user.role not in STAFF_ROLES and user.role != UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Insufficient permission")
    rows = db.scalars(query.order_by(Report.created_at.desc())).all()
    return [serialize_report(db, row) for row in rows]


@router.post("", response_model=ReportRead, status_code=status.HTTP_201_CREATED)
def create_report(payload: ReportCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.penghuni))) -> ReportRead:
    report = Report(
        complex_id=user_complex_id(user),
        reporter_id=user.id,
        category=payload.category,
        title=payload.title,
        description=payload.description,
        location=payload.location,
        priority=payload.priority,
    )
    db.add(report)
    db.flush()
    add_attachments(db, report, payload.media_urls, user, AttachmentSource.penghuni)
    notify_users(
        db,
        users_by_roles(db, report.complex_id, STAFF_ROLES),
        NotificationType.report_created,
        "Laporan warga baru",
        f"{user.full_name} membuat laporan: {report.title}",
        "report",
        report.id,
    )
    db.commit()
    db.refresh(report)
    return serialize_report(db, report)


@router.patch("/{report_id}", response_model=ReportRead)
def update_report(report_id: int, payload: ReportUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> ReportRead:
    report = db.scalar(select(Report).where(Report.id == report_id, Report.is_deleted.is_(False)))
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_complex_access(db, user, report.complex_id)
    if user.role == UserRole.penghuni and report.reporter_id != user.id:
        raise HTTPException(status_code=403, detail="No access to this report")
    if user.role == UserRole.penghuni and report.status != ReportStatus.open:
        raise HTTPException(status_code=400, detail="Closed report cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if user.role == UserRole.penghuni:
        data.pop("status", None)
    for key, value in data.items():
        setattr(report, key, value)
    if report.status == ReportStatus.closed and not report.closed_at:
        report.closed_at = datetime.utcnow()
    db.commit()
    db.refresh(report)
    return serialize_report(db, report)


@router.post("/{report_id}/followups", response_model=ReportRead)
def add_followup(
    report_id: int,
    payload: ReportFollowUpCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator, UserRole.security)),
) -> ReportRead:
    report = db.scalar(select(Report).where(Report.id == report_id, Report.is_deleted.is_(False)))
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_complex_access(db, user, report.complex_id)
    report.status = payload.status_after
    report.handled_by = user.id
    if payload.status_after == ReportStatus.closed:
        report.closed_at = datetime.utcnow()
    db.add(ReportFollowUp(report_id=report.id, user_id=user.id, note=payload.note, status_after=payload.status_after))
    add_attachments(db, report, payload.media_urls, user, AttachmentSource.administrator)
    reporter = db.get(User, report.reporter_id)
    if reporter:
        notify_users(
            db,
            [reporter],
            NotificationType.report_updated,
            "Update laporan",
            f"{user.full_name} memperbarui laporan: {report.title}",
            "report",
            report.id,
        )
    db.commit()
    db.refresh(report)
    return serialize_report(db, report)


@router.post("/{report_id}/publish", response_model=ReportRead)
def publish_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.administrator))) -> ReportRead:
    report = db.scalar(select(Report).where(Report.id == report_id, Report.is_deleted.is_(False)))
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_complex_access(db, user, report.complex_id)
    first_image = db.scalar(
        select(ReportAttachment.file_url)
        .where(ReportAttachment.report_id == report.id, ReportAttachment.is_deleted.is_(False))
        .order_by(ReportAttachment.id.asc())
    )
    if report.published_news_id:
        news = db.get(News, report.published_news_id)
        if news:
            news.is_active = True
            news.title = report.title
            news.content = report.description
            news.cover_image_url = first_image
    else:
        news = News(
            complex_id=report.complex_id,
            author_id=user.id,
            title=report.title,
            content=report.description,
            cover_image_url=first_image,
            source_report_id=report.id,
            is_active=True,
        )
        db.add(news)
        db.flush()
        report.published_news_id = news.id
        if first_image:
            db.add(NewsMedia(news_id=news.id, file_url=first_image, file_name=first_image.rsplit("/", 1)[-1]))
    db.commit()
    db.refresh(report)
    return serialize_report(db, report)


@router.post("/{report_id}/unpublish", response_model=ReportRead)
def unpublish_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.administrator))) -> ReportRead:
    report = db.scalar(select(Report).where(Report.id == report_id, Report.is_deleted.is_(False)))
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_complex_access(db, user, report.complex_id)
    if report.published_news_id:
        news = db.get(News, report.published_news_id)
        if news:
            news.is_active = False
    db.commit()
    db.refresh(report)
    return serialize_report(db, report)
