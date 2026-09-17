from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.entities import BookingStatus
from app.schemas.common_base import ORMModel


class FacilityCreate(BaseModel):
    name: str = Field(max_length=100)
    color_hex: str = Field(default="#2f6690", pattern=r"^#[0-9A-Fa-f]{6}$")
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=255)
    media_urls: list[str] = []
    capacity: int | None = None


class FacilityUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    color_hex: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=255)
    media_urls: list[str] | None = None
    capacity: int | None = None


class FacilityMediaRead(ORMModel):
    id: int
    file_url: str
    file_name: str | None = None


class FacilityRead(ORMModel):
    id: int
    complex_id: int
    name: str
    color_hex: str
    description: str | None = None
    image_url: str | None = None
    media: list[FacilityMediaRead] = []
    capacity: int | None = None


class BookingCreate(BaseModel):
    facility_id: int
    start_datetime: datetime
    end_datetime: datetime
    notes: str | None = None

    @model_validator(mode="after")
    def validate_range(self) -> "BookingCreate":
        if self.end_datetime <= self.start_datetime:
            raise ValueError("end_datetime must be after start_datetime")
        return self


class BookingUpdate(BaseModel):
    facility_id: int | None = None
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    notes: str | None = None
    status: BookingStatus | None = None

    @model_validator(mode="after")
    def validate_optional_range(self) -> "BookingUpdate":
        if self.start_datetime and self.end_datetime and self.end_datetime <= self.start_datetime:
            raise ValueError("end_datetime must be after start_datetime")
        return self


class BookingStatusUpdate(BaseModel):
    status: BookingStatus


class BookingRead(ORMModel):
    id: int
    facility_id: int
    user_id: int
    start_datetime: datetime
    end_datetime: datetime
    status: BookingStatus
    notes: str | None = None
    facility_name: str | None = None
    facility_color_hex: str | None = None
    requester_name: str | None = None
