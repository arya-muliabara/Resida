from datetime import datetime

from pydantic import BaseModel, Field

from app.models.entities import PurchaseRequestStatus
from app.schemas.common_base import ORMModel


class PurchaseRequestItemInput(BaseModel):
    item_name: str = Field(min_length=1, max_length=200)
    quantity: int = Field(default=1, ge=1, le=100000)
    estimated_price: int = Field(ge=0)


class PurchaseRequestCreate(BaseModel):
    header: str = Field(min_length=1, max_length=200)
    items: list[PurchaseRequestItemInput] = Field(min_length=1, max_length=100)


class PurchaseRequestUpdate(BaseModel):
    header: str | None = Field(default=None, min_length=1, max_length=200)
    items: list[PurchaseRequestItemInput] | None = Field(default=None, min_length=1, max_length=100)


class PurchaseRequestReview(BaseModel):
    status: PurchaseRequestStatus
    rejection_reason: str | None = None


class PurchaseRequestComplete(BaseModel):
    actual_amount: int = Field(ge=0)
    completion_note: str | None = Field(default=None, max_length=2000)
    transaction_proof_url: str = Field(min_length=1, max_length=255)
    transaction_proof_name: str = Field(min_length=1, max_length=255)


class PurchaseProofUpdate(BaseModel):
    transaction_proof_url: str = Field(min_length=1, max_length=255)
    transaction_proof_name: str = Field(min_length=1, max_length=255)


class PurchaseRequestItemRead(ORMModel):
    id: int
    item_name: str
    quantity: int
    estimated_price: int


class PurchaseRequestRead(ORMModel):
    id: int
    complex_id: int
    requester_id: int
    header: str
    status: PurchaseRequestStatus
    rejection_reason: str | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    actual_amount: int | None = None
    completion_note: str | None = None
    transaction_proof_url: str | None = None
    transaction_proof_name: str | None = None
    completed_by: int | None = None
    completed_at: datetime | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None
    requester_name: str | None = None
    reviewer_name: str | None = None
    completed_by_name: str | None = None
    estimated_total: int = 0
    items: list[PurchaseRequestItemRead] = []
