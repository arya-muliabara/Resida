import json
import re
from urllib.request import Request, urlopen

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import AppNotification, NotificationType, User, UserNotificationPreference, UserRole, WhatsAppGatewayConfig


def _whatsapp_number(phone: str | None) -> str | None:
    digits = re.sub(r"\D", "", phone or "")
    if digits.startswith("0"):
        digits = "62" + digits[1:]
    return digits if len(digits) >= 10 else None


def _send_whatsapp(db: Session, user: User, type_: NotificationType, title: str, message: str, link_id: int | None) -> None:
    config = db.get(WhatsAppGatewayConfig, 1)
    number = _whatsapp_number(user.phone)
    preference = db.scalar(select(UserNotificationPreference).where(UserNotificationPreference.user_id == user.id, UserNotificationPreference.type == type_))
    if not (config and config.is_enabled and config.base_url and config.api_key and config.sender_id and number and preference and preference.whatsapp_enabled):
        return
    payload = json.dumps({"sender_id": config.sender_id, "to": number, "message": f"{title}\n\n{message}", "reference_id": f"resida-{type_.value}-{link_id or user.id}", "idempotency_key": f"resida-{type_.value}-{link_id or user.id}-{user.id}"}).encode()
    request = Request(f"{config.base_url.rstrip('/')}/api/v1/messages", data=payload, method="POST", headers={"Authorization": f"Bearer {config.api_key}", "Content-Type": "application/json"})
    try:
        with urlopen(request, timeout=6):
            pass
    except Exception:
        pass


def notify_users(
    db: Session,
    users: list[User],
    type_: NotificationType,
    title: str,
    message: str,
    link_type: str | None = None,
    link_id: int | None = None,
) -> None:
    seen: set[int] = set()
    for user in users:
        if user.id in seen:
            continue
        seen.add(user.id)
        if not user.complex_id:
            continue
        db.add(
            AppNotification(
                complex_id=user.complex_id,
                user_id=user.id,
                type=type_,
                title=title,
                message=message,
                link_type=link_type,
                link_id=link_id,
            )
        )
        _send_whatsapp(db, user, type_, title, message, link_id)


def users_by_roles(db: Session, complex_id: int, roles: list[UserRole]) -> list[User]:
    return list(
        db.scalars(
            select(User).where(
                User.complex_id == complex_id,
                User.role.in_(roles),
                User.is_active.is_(True),
                User.is_deleted.is_(False),
            )
        )
    )
