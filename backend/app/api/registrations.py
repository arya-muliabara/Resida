from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import Complex, NotificationType, RegistrationRequest, RegistrationStatus, User, UserRole
from app.schemas.users import RegistrationRequestRead, RegistrationReview
from app.services.email import send_email

router = APIRouter(prefix="/registrations", tags=["registrations"])


def serialize_registration(db: Session, item: RegistrationRequest) -> RegistrationRequestRead:
    user = db.get(User, item.user_id)
    complex_ = db.get(Complex, item.complex_id)
    data = RegistrationRequestRead.model_validate(item).model_dump()
    data.update(
        {
            "email": user.email if user else None,
            "full_name": user.full_name if user else None,
            "complex_name": complex_.name if complex_ else None,
        }
    )
    return RegistrationRequestRead(**data)


@router.get("", response_model=list[RegistrationRequestRead])
def list_registration_requests(
    status: RegistrationStatus | None = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.administrator)),
) -> list[RegistrationRequestRead]:
    query = select(RegistrationRequest).where(
        RegistrationRequest.complex_id == user_complex_id(admin),
        RegistrationRequest.is_deleted.is_(False),
    )
    if status:
        query = query.where(RegistrationRequest.status == status)
    items = db.scalars(query.order_by(RegistrationRequest.created_at.desc())).all()
    return [serialize_registration(db, item) for item in items]


@router.patch("/{request_id}", response_model=RegistrationRequestRead)
def review_registration_request(
    request_id: int,
    payload: RegistrationReview,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles(UserRole.administrator)),
) -> RegistrationRequestRead:
    if payload.status == RegistrationStatus.pending:
        raise HTTPException(status_code=400, detail="Review status must be approved or rejected")
    item = db.scalar(
        select(RegistrationRequest).where(
            RegistrationRequest.id == request_id,
            RegistrationRequest.is_deleted.is_(False),
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Registration request not found")
    ensure_complex_access(db, admin, item.complex_id)
    user = db.get(User, item.user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    item.status = payload.status
    item.admin_notes = payload.admin_notes
    item.reviewed_by = admin.id
    item.reviewed_at = datetime.utcnow()
    if payload.status == RegistrationStatus.approved:
        user.complex_id = item.complex_id
        if user.role not in [UserRole.penghuni, UserRole.security, UserRole.supports]:
            user.role = UserRole.penghuni
        user.is_active = True
        user.is_email_verified = True
        subject = "Pendaftaran RUKUN disetujui"
        body = "Pendaftaran Anda sudah disetujui. Anda sekarang dapat login menggunakan email dan password yang didaftarkan."
    else:
        user.is_active = False
        user.is_email_verified = False
        subject = "Pendaftaran RUKUN ditolak"
        body = f"Pendaftaran Anda ditolak oleh administrator. Catatan: {payload.admin_notes}"

    send_email(db, user.email, subject, body, NotificationType.email_verification, user)
    db.commit()
    db.refresh(item)
    return serialize_registration(db, item)
