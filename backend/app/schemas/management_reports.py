from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.entities import ManagementReportStatus, ManagementReportType
from app.schemas.common_base import ORMModel


class ManagementReportCreate(BaseModel):
    report_type: ManagementReportType
    report_date: date
    report_time: str = Field(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    shift_incoming_user_id: int | None = None
    shift_outgoing_user_id: int | None = None
    resident_guest_count: int = Field(default=0, ge=0)
    ojol_guest_count: int = Field(default=0, ge=0)
    electricity_token: float | None = Field(default=None, ge=0)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    situation: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(default=None, max_length=4000)
    image_urls: list[str] = Field(default_factory=list, max_length=10)


class ManagementReportReview(BaseModel):
    status: ManagementReportStatus
    rejection_reason: str | None = Field(default=None, max_length=2000)


class ManagementReportImageRead(ORMModel):
    id: int
    image_url: str
    sort_order: int


class ManagementReportRead(ORMModel):
    id: int
    complex_id: int
    reporter_id: int
    report_type: ManagementReportType
    report_date: date
    report_time: str
    shift_incoming_user_id: int | None = None
    shift_outgoing_user_id: int | None = None
    resident_guest_count: int
    ojol_guest_count: int
    electricity_token: float | None = None
    latitude: float | None = None
    longitude: float | None = None
    situation: str
    notes: str | None = None
    status: ManagementReportStatus
    rejection_reason: str | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    reporter_name: str | None = None
    reviewer_name: str | None = None
    shift_incoming_user_name: str | None = None
    shift_outgoing_user_name: str | None = None
    images: list[ManagementReportImageRead] = []
    image_urls: list[str] = []


class ManagementReportStaffRead(ORMModel):
    id: int
    full_name: str
    role: str
