from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import AppNotification, NotificationType, User, UserRole


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
