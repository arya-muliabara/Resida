from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    message: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserRead"


class Counts(BaseModel):
    likes: int = 0
    comments: int = 0


class Timestamped(ORMModel):
    id: int
    created_at: datetime | None = None
    updated_at: datetime | None = None


from app.schemas.users import UserRead  # noqa: E402

Token.model_rebuild()

