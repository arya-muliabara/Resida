from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.common_base import ORMModel


class EventCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    start_datetime: datetime
    end_datetime: datetime | None = None
    is_active: bool = True

    @model_validator(mode="after")
    def validate_range(self) -> "EventCreate":
        if self.end_datetime and self.end_datetime <= self.start_datetime:
            raise ValueError("end_datetime must be after start_datetime")
        return self


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    location: str | None = Field(default=None, max_length=200)
    start_datetime: datetime | None = None
    end_datetime: datetime | None = None
    is_active: bool | None = None


class EventRead(ORMModel):
    id: int
    complex_id: int
    created_by: int
    title: str
    description: str | None = None
    location: str | None = None
    start_datetime: datetime
    end_datetime: datetime | None = None
    is_active: bool = True
