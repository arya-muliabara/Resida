from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import AttachmentSource, LetterStatus
from app.schemas.common_base import ORMModel


class LetterTypeCreate(BaseModel):
    name: str = Field(max_length=150)
    description: str | None = None
    is_active: bool = True


class LetterTypeUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    description: str | None = None
    is_active: bool | None = None


class LetterTypeRead(ORMModel):
    id: int
    complex_id: int
    name: str
    description: str | None = None
    is_active: bool


class LetterRequestCreate(BaseModel):
    letter_type_id: int
    description: str


class LetterRequestUpdate(BaseModel):
    letter_type_id: int | None = None
    description: str | None = None
    status: LetterStatus | None = None


class LetterReplyCreate(BaseModel):
    note: str
    status_after: LetterStatus


class LetterAttachmentCreate(BaseModel):
    file_url: str = Field(max_length=255)
    file_name: str = Field(max_length=150)
    source: AttachmentSource | None = None
    replace: bool = False


class LetterReplyRead(ORMModel):
    id: int
    letter_request_id: int
    user_id: int
    note: str
    status_after: LetterStatus
    created_at: datetime | None = None


class LetterAttachmentRead(ORMModel):
    id: int
    letter_request_id: int
    uploaded_by: int
    source: AttachmentSource
    file_url: str
    file_name: str


class LetterRequestRead(ORMModel):
    id: int
    complex_id: int
    letter_type_id: int
    requester_id: int
    description: str
    status: LetterStatus
    submitted_at: datetime | None = None
    cancelled_at: datetime | None = None
    completed_at: datetime | None = None
    handled_by: int | None = None
    letter_type_name: str | None = None
    requester_name: str | None = None
    replies: list[LetterReplyRead] = []
    attachments: list[LetterAttachmentRead] = []
