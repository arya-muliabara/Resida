from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import MarketplaceItemType, MarketplaceStatus
from app.schemas.common_base import ORMModel


class MarketplacePostCreate(BaseModel):
    title: str = Field(max_length=200)
    description: str = Field(min_length=1)
    item_type: MarketplaceItemType
    price: int = Field(ge=0)
    phone: str = Field(min_length=8, max_length=20)
    image_urls: list[str] = Field(min_length=1, max_length=10)


class MarketplacePostUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    description: str | None = None
    item_type: MarketplaceItemType | None = None
    price: int | None = Field(default=None, ge=0)
    phone: str | None = Field(default=None, min_length=8, max_length=20)
    image_urls: list[str] | None = Field(default=None, min_length=1, max_length=10)


class MarketplaceReview(BaseModel):
    status: MarketplaceStatus
    rejection_reason: str | None = None


class MarketplaceCommentCreate(BaseModel):
    comment: str = Field(min_length=1)


class MarketplaceCommentRead(ORMModel):
    id: int
    marketplace_post_id: int
    user_id: int
    comment: str
    created_at: datetime | None = None
    user_name: str | None = None


class MarketplacePostRead(ORMModel):
    id: int
    complex_id: int
    author_id: int
    title: str
    description: str
    item_type: MarketplaceItemType
    price: int
    phone: str | None = None
    status: MarketplaceStatus
    rejection_reason: str | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    published_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    author_name: str | None = None
    reviewer_name: str | None = None
    image_urls: list[str] = []
    likes_count: int = 0
    comments_count: int = 0
    liked_by_me: bool = False
