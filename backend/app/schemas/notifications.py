from datetime import datetime

from app.models.entities import NotificationType
from app.schemas.common_base import ORMModel


class NotificationRead(ORMModel):
    id: int
    complex_id: int
    user_id: int
    type: NotificationType
    title: str
    message: str
    link_type: str | None = None
    link_id: int | None = None
    is_read: bool = False
    created_at: datetime | None = None
