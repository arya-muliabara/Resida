from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.common_base import ORMModel


class VotingCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str
    image_url: str | None = Field(default=None, max_length=255)
    start_date: datetime
    end_date: datetime
    options: list[str] = Field(min_length=2)
    is_active: bool = False

    @model_validator(mode="after")
    def validate_dates(self) -> "VotingCreate":
        if self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class VotingUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    image_url: str | None = Field(default=None, max_length=255)
    start_date: datetime | None = None
    end_date: datetime | None = None
    options: list[str] | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_optional_dates(self) -> "VotingUpdate":
        if self.start_date and self.end_date and self.end_date <= self.start_date:
            raise ValueError("end_date must be after start_date")
        return self


class VoteCreate(BaseModel):
    option_id: int


class VotingOptionRead(ORMModel):
    id: int
    option_text: str
    votes_count: int = 0
    voters: list[str] = []


class VotingRead(ORMModel):
    id: int
    complex_id: int
    created_by: int
    title: str
    description: str
    image_url: str | None = None
    start_date: datetime
    end_date: datetime
    is_active: bool = False
    options: list[VotingOptionRead] = []
    my_option_id: int | None = None
