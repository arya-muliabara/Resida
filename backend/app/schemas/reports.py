from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import AttachmentSource, ReportStatus
from app.schemas.common_base import ORMModel


class ReportCreate(BaseModel):
    category: str = Field(max_length=80)
    title: str = Field(max_length=200)
    description: str
    location: str | None = Field(default=None, max_length=200)
    priority: str = Field(default="normal", pattern="^(low|normal|high|urgent)$")
    media_urls: list[str] = []


class ReportFollowUpCreate(BaseModel):
    note: str
    status_after: ReportStatus = ReportStatus.open
    media_urls: list[str] = []


class ReportUpdate(BaseModel):
    category: str | None = Field(default=None, max_length=80)
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    priority: str | None = Field(default=None, pattern="^(low|normal|high|urgent)$")
    status: ReportStatus | None = None


class ReportAttachmentRead(ORMModel):
    id: int
    report_id: int
    uploaded_by: int
    source: AttachmentSource
    file_url: str
    file_name: str | None = None


class ReportFollowUpRead(ORMModel):
    id: int
    report_id: int
    user_id: int
    note: str
    status_after: ReportStatus
    created_at: datetime | None = None
    handler_name: str | None = None
    attachments: list[ReportAttachmentRead] = []


class ReportRead(ORMModel):
    id: int
    complex_id: int
    reporter_id: int
    category: str
    title: str
    description: str
    location: str | None = None
    priority: str = "normal"
    status: ReportStatus
    handled_by: int | None = None
    closed_at: datetime | None = None
    published_news_id: int | None = None
    created_at: datetime | None = None
    reporter_name: str | None = None
    attachments: list[ReportAttachmentRead] = []
    followups: list[ReportFollowUpRead] = []
