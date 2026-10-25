from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import (
    NotificationType,
    PurchaseRequest,
    PurchaseRequestItem,
    PurchaseRequestStatus,
    User,
    UserRole,
)
from app.schemas.purchase_requests import (
    PurchaseProofUpdate,
    PurchaseRequestComplete,
    PurchaseRequestCreate,
    PurchaseRequestRead,
    PurchaseRequestReview,
    PurchaseRequestUpdate,
)
from app.services.notifications import notify_users, users_by_roles

router = APIRouter(prefix="/purchase-requests", tags=["purchase-requests"])

PURCHASE_REQUESTER_ROLES = (UserRole.pengurus, UserRole.security, UserRole.supports)
PURCHASE_COMPLETER_ROLES = (UserRole.administrator, UserRole.pengurus)


def get_purchase_request(db: Session, request_id: int, user: User) -> PurchaseRequest:
    item = db.scalar(
        select(PurchaseRequest).where(
            PurchaseRequest.id == request_id,
            PurchaseRequest.complex_id == user_complex_id(user),
            PurchaseRequest.is_deleted.is_(False),
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Permintaan pembelian tidak ditemukan")
    return item


def serialize_purchase_request(db: Session, item: PurchaseRequest) -> PurchaseRequestRead:
    rows = list(
        db.scalars(
            select(PurchaseRequestItem)
            .where(
                PurchaseRequestItem.purchase_request_id == item.id,
                PurchaseRequestItem.is_deleted.is_(False),
            )
            .order_by(PurchaseRequestItem.id.asc())
        )
    )
    requester = db.get(User, item.requester_id)
    reviewer = db.get(User, item.reviewed_by) if item.reviewed_by else None
    completer = db.get(User, item.completed_by) if item.completed_by else None
    data = PurchaseRequestRead.model_validate(item).model_dump()
    data.update(
        {
            "items": rows,
            "estimated_total": sum(row.quantity * row.estimated_price for row in rows),
            "requester_name": requester.full_name if requester else None,
            "reviewer_name": reviewer.full_name if reviewer else None,
            "completed_by_name": completer.full_name if completer else None,
        }
    )
    return PurchaseRequestRead(**data)


def replace_items(db: Session, item: PurchaseRequest, values: list) -> None:
    for current in db.scalars(
        select(PurchaseRequestItem).where(
            PurchaseRequestItem.purchase_request_id == item.id,
            PurchaseRequestItem.is_deleted.is_(False),
        )
    ):
        current.soft_delete()
    for value in values:
        db.add(PurchaseRequestItem(purchase_request_id=item.id, **value.model_dump()))


@router.get("", response_model=list[PurchaseRequestRead])
def list_purchase_requests(
    request_status: PurchaseRequestStatus | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator, *PURCHASE_REQUESTER_ROLES)),
) -> list[PurchaseRequestRead]:
    query = select(PurchaseRequest).where(
        PurchaseRequest.complex_id == user_complex_id(user),
        PurchaseRequest.is_deleted.is_(False),
    )
    if user.role != UserRole.administrator:
        query = query.where(PurchaseRequest.requester_id == user.id)
    if request_status:
        query = query.where(PurchaseRequest.status == request_status)
    items = db.scalars(query.order_by(PurchaseRequest.updated_at.desc(), PurchaseRequest.id.desc())).all()
    return [serialize_purchase_request(db, item) for item in items]


@router.post("", response_model=PurchaseRequestRead, status_code=status.HTTP_201_CREATED)
def create_purchase_request(
    payload: PurchaseRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PURCHASE_REQUESTER_ROLES)),
) -> PurchaseRequestRead:
    item = PurchaseRequest(
        complex_id=user_complex_id(user),
        requester_id=user.id,
        header=payload.header.strip(),
        status=PurchaseRequestStatus.requested,
    )
    db.add(item)
    db.flush()
    replace_items(db, item, payload.items)
    notify_users(
        db,
        users_by_roles(db, item.complex_id, [UserRole.administrator]),
        NotificationType.purchase_request,
        "Permintaan pembelian baru",
        f"{user.full_name} mengajukan: {item.header}",
        "purchase_request",
        item.id,
    )
    db.commit()
    db.refresh(item)
    return serialize_purchase_request(db, item)


@router.patch("/{request_id}", response_model=PurchaseRequestRead)
def update_purchase_request(
    request_id: int,
    payload: PurchaseRequestUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PURCHASE_REQUESTER_ROLES)),
) -> PurchaseRequestRead:
    item = get_purchase_request(db, request_id, user)
    if item.requester_id != user.id:
        raise HTTPException(status_code=403, detail="Hanya pengaju yang dapat mengubah permintaan ini")
    if item.status == PurchaseRequestStatus.completed:
        raise HTTPException(status_code=400, detail="Permintaan yang telah selesai tidak dapat diubah")
    changes = payload.model_dump(exclude_unset=True)
    if "header" in changes:
        item.header = changes["header"].strip()
    if "items" in changes:
        replace_items(db, item, payload.items or [])
    if item.status != PurchaseRequestStatus.requested:
        item.status = PurchaseRequestStatus.requested
        item.rejection_reason = None
        item.reviewed_by = None
        item.reviewed_at = None
        notify_users(
            db,
            users_by_roles(db, item.complex_id, [UserRole.administrator]),
            NotificationType.purchase_request,
            "Permintaan pembelian diajukan ulang",
            f"{user.full_name} memperbarui: {item.header}",
            "purchase_request",
            item.id,
        )
    db.commit()
    db.refresh(item)
    return serialize_purchase_request(db, item)


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_purchase_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> None:
    item = get_purchase_request(db, request_id, user)
    for row in db.scalars(
        select(PurchaseRequestItem).where(
            PurchaseRequestItem.purchase_request_id == item.id,
            PurchaseRequestItem.is_deleted.is_(False),
        )
    ):
        row.soft_delete()
    item.soft_delete()
    db.commit()


@router.patch("/{request_id}/review", response_model=PurchaseRequestRead)
def review_purchase_request(
    request_id: int,
    payload: PurchaseRequestReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> PurchaseRequestRead:
    item = get_purchase_request(db, request_id, user)
    if item.status == PurchaseRequestStatus.completed:
        raise HTTPException(status_code=400, detail="Permintaan yang telah selesai tidak dapat direview")
    if payload.status not in {PurchaseRequestStatus.approved, PurchaseRequestStatus.rejected}:
        raise HTTPException(status_code=400, detail="Status review harus approved atau rejected")
    if payload.status == PurchaseRequestStatus.rejected and not (payload.rejection_reason or "").strip():
        raise HTTPException(status_code=400, detail="Alasan reject wajib diisi")
    item.status = payload.status
    item.rejection_reason = payload.rejection_reason.strip() if payload.status == PurchaseRequestStatus.rejected else None
    item.reviewed_by = user.id
    item.reviewed_at = datetime.utcnow()
    requester = db.get(User, item.requester_id)
    if requester:
        outcome = "disetujui" if item.status == PurchaseRequestStatus.approved else "ditolak"
        notify_users(
            db,
            [requester],
            NotificationType.purchase_request,
            "Update permintaan pembelian",
            f"Permintaan '{item.header}' {outcome} oleh {user.full_name}.",
            "purchase_request",
            item.id,
        )
    db.commit()
    db.refresh(item)
    return serialize_purchase_request(db, item)


@router.patch("/{request_id}/complete", response_model=PurchaseRequestRead)
def complete_purchase_request(
    request_id: int,
    payload: PurchaseRequestComplete,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PURCHASE_COMPLETER_ROLES)),
) -> PurchaseRequestRead:
    item = get_purchase_request(db, request_id, user)
    if user.role == UserRole.pengurus and item.requester_id != user.id:
        raise HTTPException(status_code=403, detail="Pengurus hanya dapat menyelesaikan transaksi yang diajukan sendiri")
    if item.status != PurchaseRequestStatus.approved:
        raise HTTPException(status_code=400, detail="Hanya permintaan yang disetujui yang dapat diselesaikan")
    item.status = PurchaseRequestStatus.completed
    item.actual_amount = payload.actual_amount
    item.completion_note = (payload.completion_note or "").strip() or None
    item.transaction_proof_url = payload.transaction_proof_url.strip()
    item.transaction_proof_name = payload.transaction_proof_name.strip()
    item.completed_by = user.id
    item.completed_at = datetime.utcnow()
    requester = db.get(User, item.requester_id)
    if requester:
        notify_users(
            db,
            [requester],
            NotificationType.purchase_request,
            "Permintaan pembelian selesai",
            f"Permintaan '{item.header}' telah diterima dan diselesaikan.",
            "purchase_request",
            item.id,
        )
    db.commit()
    db.refresh(item)
    return serialize_purchase_request(db, item)


@router.patch("/{request_id}/transaction-proof", response_model=PurchaseRequestRead)
def replace_own_transaction_proof(
    request_id: int,
    payload: PurchaseProofUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PURCHASE_COMPLETER_ROLES)),
) -> PurchaseRequestRead:
    item = get_purchase_request(db, request_id, user)
    if item.status != PurchaseRequestStatus.completed or item.completed_by != user.id:
        raise HTTPException(status_code=403, detail="Hanya pengunggah bukti transaksi yang dapat mengganti file")
    item.transaction_proof_url = payload.transaction_proof_url.strip()
    item.transaction_proof_name = payload.transaction_proof_name.strip()
    db.commit()
    db.refresh(item)
    return serialize_purchase_request(db, item)


@router.delete("/{request_id}/transaction-proof", response_model=PurchaseRequestRead)
def delete_own_transaction_proof(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*PURCHASE_COMPLETER_ROLES)),
) -> PurchaseRequestRead:
    item = get_purchase_request(db, request_id, user)
    if item.status != PurchaseRequestStatus.completed or item.completed_by != user.id:
        raise HTTPException(status_code=403, detail="Hanya pengunggah bukti transaksi yang dapat menghapus file")
    item.transaction_proof_url = None
    item.transaction_proof_name = None
    db.commit()
    db.refresh(item)
    return serialize_purchase_request(db, item)
