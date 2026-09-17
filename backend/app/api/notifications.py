from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, user_complex_id
from app.db.session import get_db
from app.models.entities import AppNotification, User
from app.schemas.notifications import NotificationRead

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[AppNotification]:
    return list(
        db.scalars(
            select(AppNotification)
            .where(
                AppNotification.user_id == user.id,
                AppNotification.complex_id == user_complex_id(user),
                AppNotification.is_deleted.is_(False),
            )
            .order_by(AppNotification.created_at.desc())
            .limit(30)
        )
    )


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, int]:
    count = db.scalar(
        select(func.count(AppNotification.id)).where(
            AppNotification.user_id == user.id,
            AppNotification.is_read.is_(False),
            AppNotification.is_deleted.is_(False),
        )
    ) or 0
    return {"count": count}


@router.patch("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AppNotification:
    item = db.scalar(
        select(AppNotification).where(
            AppNotification.id == notification_id,
            AppNotification.user_id == user.id,
            AppNotification.is_deleted.is_(False),
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Notification not found")
    if item and not item.is_read:
        item.is_read = True
        item.read_at = datetime.utcnow()
        db.commit()
        db.refresh(item)
    return item


@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, str]:
    rows = db.scalars(
        select(AppNotification).where(
            AppNotification.user_id == user.id,
            AppNotification.is_read.is_(False),
            AppNotification.is_deleted.is_(False),
        )
    ).all()
    now = datetime.utcnow()
    for row in rows:
        row.is_read = True
        row.read_at = now
    db.commit()
    return {"message": "Notifications marked as read"}
