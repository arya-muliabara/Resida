from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common_base import ORMModel


class NewsCreate(BaseModel):
    title: str = Field(max_length=200)
    content: str
    cover_image_url: str | None = Field(default=None, max_length=255)
    media_urls: list[str] = []
    is_active: bool = True


class NewsUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str | None = None
    cover_image_url: str | None = Field(default=None, max_length=255)
    media_urls: list[str] | None = None
    is_active: bool | None = None


class CommentCreate(BaseModel):
    comment: str


class CommentRead(ORMModel):
    id: int
    news_id: int
    user_id: int
    author_name: str | None = None
    comment: str
    created_at: datetime | None = None


class MediaRead(ORMModel):
    id: int
    file_url: str
    file_name: str | None = None


class NewsRead(ORMModel):
    id: int
    complex_id: int
    author_id: int
    title: str
    content: str
    cover_image_url: str | None = None
    media: list[MediaRead] = []
    is_active: bool = True
    published_at: datetime | None = None
    updated_at: datetime | None = None
    likes_count: int = 0
    comments_count: int = 0
    liked_by_me: bool = False
