from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import (
    AttachmentSource,
    LetterRequest,
    LetterRequestAttachment,
    LetterRequestReply,
    LetterStatus,
    LetterType,
    User,
    UserRole,
)
from app.schemas.letters import (
    LetterAttachmentCreate,
    LetterRequestCreate,
    LetterRequestRead,
    LetterRequestUpdate,
    LetterReplyCreate,
    LetterTypeCreate,
    LetterTypeRead,
    LetterTypeUpdate,
)

router = APIRouter(prefix="/letters", tags=["letters"])


def serialize_request(db: Session, item: LetterRequest) -> LetterRequestRead:
    letter_type = db.get(LetterType, item.letter_type_id)
    requester = db.get(User, item.requester_id)
    replies = db.scalars(
        select(LetterRequestReply)
        .where(LetterRequestReply.letter_request_id == item.id, LetterRequestReply.is_deleted.is_(False))
        .order_by(LetterRequestReply.created_at.asc())
    ).all()
    attachments = db.scalars(
        select(LetterRequestAttachment).where(
            LetterRequestAttachment.letter_request_id == item.id,
            LetterRequestAttachment.is_deleted.is_(False),
        )
    ).all()
    data = LetterRequestRead.model_validate(item).model_dump()
    data.update(
        {
            "letter_type_name": letter_type.name if letter_type else None,
            "requester_name": requester.full_name if requester else None,
            "replies": replies,
            "attachments": attachments,
        }
    )
    return LetterRequestRead(**data)


@router.get("/types", response_model=list[LetterTypeRead])
def list_letter_types(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[LetterType]:
    query = select(LetterType).where(
        LetterType.complex_id == user_complex_id(user),
        LetterType.is_deleted.is_(False),
    )
    if user.role == UserRole.penghuni:
        query = query.where(LetterType.is_active.is_(True))
    return list(db.scalars(query.order_by(LetterType.name.asc())))


@router.post("/types", response_model=LetterTypeRead, status_code=status.HTTP_201_CREATED)
def create_letter_type(
    payload: LetterTypeCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> LetterType:
    letter_type = LetterType(complex_id=user_complex_id(user), **payload.model_dump())
    db.add(letter_type)
    db.commit()
    db.refresh(letter_type)
    return letter_type


@router.patch("/types/{letter_type_id}", response_model=LetterTypeRead)
def update_letter_type(
    letter_type_id: int,
    payload: LetterTypeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> LetterType:
    letter_type = db.scalar(select(LetterType).where(LetterType.id == letter_type_id, LetterType.is_deleted.is_(False)))
    if not letter_type:
        raise HTTPException(status_code=404, detail="Letter type not found")
    ensure_complex_access(db, user, letter_type.complex_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(letter_type, key, value)
    db.commit()
    db.refresh(letter_type)
    return letter_type


@router.delete("/types/{letter_type_id}")
def delete_letter_type(
    letter_type_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> dict[str, str]:
    letter_type = db.scalar(select(LetterType).where(LetterType.id == letter_type_id, LetterType.is_deleted.is_(False)))
    if not letter_type:
        raise HTTPException(status_code=404, detail="Letter type not found")
    ensure_complex_access(db, user, letter_type.complex_id)
    letter_type.is_active = False
    letter_type.soft_delete()
    db.commit()
    return {"message": "Letter type deleted"}


@router.get("/requests", response_model=list[LetterRequestRead])
def list_requests(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[LetterRequestRead]:
    complex_id = user_complex_id(user)
    query = select(LetterRequest).where(LetterRequest.complex_id == complex_id, LetterRequest.is_deleted.is_(False))
    if user.role == UserRole.penghuni:
        query = query.where(LetterRequest.requester_id == user.id)
    items = db.scalars(query.order_by(LetterRequest.submitted_at.desc())).all()
    return [serialize_request(db, item) for item in items]


@router.post("/requests", response_model=LetterRequestRead, status_code=status.HTTP_201_CREATED)
def create_request(
    payload: LetterRequestCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> LetterRequestRead:
    letter_type = db.scalar(
        select(LetterType).where(
            LetterType.id == payload.letter_type_id,
            LetterType.complex_id == user_complex_id(user),
            LetterType.is_deleted.is_(False),
            LetterType.is_active.is_(True),
        )
    )
    if not letter_type:
        raise HTTPException(status_code=404, detail="Letter type not found")
    request = LetterRequest(
        complex_id=user.complex_id,
        letter_type_id=payload.letter_type_id,
        requester_id=user.id,
        description=payload.description,
    )
    db.add(request)
    db.commit()
    db.refresh(request)
    return serialize_request(db, request)


@router.post("/requests/{request_id}/reply", response_model=LetterRequestRead)
def reply_request(
    request_id: int,
    payload: LetterReplyCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> LetterRequestRead:
    item = db.scalar(select(LetterRequest).where(LetterRequest.id == request_id, LetterRequest.is_deleted.is_(False)))
    if not item:
        raise HTTPException(status_code=404, detail="Request not found")
    ensure_complex_access(db, user, item.complex_id)
    item.status = payload.status_after
    item.handled_by = user.id
    if payload.status_after == LetterStatus.selesai:
        item.completed_at = datetime.utcnow()
    db.add(LetterRequestReply(letter_request_id=item.id, user_id=user.id, note=payload.note, status_after=payload.status_after))
    db.commit()
    db.refresh(item)
    return serialize_request(db, item)


@router.patch("/requests/{request_id}", response_model=LetterRequestRead)
def update_request(
    request_id: int,
    payload: LetterRequestUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LetterRequestRead:
    item = db.scalar(select(LetterRequest).where(LetterRequest.id == request_id, LetterRequest.is_deleted.is_(False)))
    if not item:
        raise HTTPException(status_code=404, detail="Request not found")
    if user.role == UserRole.penghuni and item.requester_id != user.id:
        raise HTTPException(status_code=403, detail="No access to this request")
    ensure_complex_access(db, user, item.complex_id)
    data = payload.model_dump(exclude_unset=True)
    if "letter_type_id" in data:
        letter_type = db.scalar(
            select(LetterType).where(
                LetterType.id == data["letter_type_id"],
                LetterType.complex_id == item.complex_id,
                LetterType.is_deleted.is_(False),
                LetterType.is_active.is_(True),
            )
        )
        if not letter_type:
            raise HTTPException(status_code=404, detail="Letter type not found")
    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return serialize_request(db, item)


@router.delete("/requests/{request_id}")
def delete_request(
    request_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    item = db.scalar(select(LetterRequest).where(LetterRequest.id == request_id, LetterRequest.is_deleted.is_(False)))
    if not item:
        raise HTTPException(status_code=404, detail="Request not found")
    if user.role == UserRole.penghuni and item.requester_id != user.id:
        raise HTTPException(status_code=403, detail="No access to this request")
    ensure_complex_access(db, user, item.complex_id)
    item.soft_delete()
    db.commit()
    return {"message": "Request deleted"}


@router.post("/requests/{request_id}/attachments", response_model=LetterRequestRead)
def add_attachment(
    request_id: int,
    payload: LetterAttachmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LetterRequestRead:
    item = db.scalar(select(LetterRequest).where(LetterRequest.id == request_id, LetterRequest.is_deleted.is_(False)))
    if not item:
        raise HTTPException(status_code=404, detail="Request not found")
    if user.role == UserRole.penghuni and item.requester_id != user.id:
        raise HTTPException(status_code=403, detail="No access to this request")
    ensure_complex_access(db, user, item.complex_id)
    source = payload.source or (AttachmentSource.administrator if user.role == UserRole.administrator else AttachmentSource.penghuni)
    if payload.replace:
        for attachment in db.scalars(
            select(LetterRequestAttachment).where(
                LetterRequestAttachment.letter_request_id == item.id,
                LetterRequestAttachment.source == source,
                LetterRequestAttachment.is_deleted.is_(False),
            )
        ):
            attachment.soft_delete()
    db.add(
        LetterRequestAttachment(
            letter_request_id=item.id,
            uploaded_by=user.id,
            source=source,
            file_url=payload.file_url,
            file_name=payload.file_name,
        )
    )
    db.commit()
    db.refresh(item)
    return serialize_request(db, item)


@router.post("/requests/{request_id}/cancel", response_model=LetterRequestRead)
def cancel_request(request_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(UserRole.penghuni))) -> LetterRequestRead:
    item = db.scalar(
        select(LetterRequest).where(
            LetterRequest.id == request_id,
            LetterRequest.requester_id == user.id,
            LetterRequest.is_deleted.is_(False),
        )
    )
    if not item:
        raise HTTPException(status_code=404, detail="Request not found")
    if item.status == LetterStatus.selesai:
        raise HTTPException(status_code=400, detail="Completed request cannot be cancelled")
    item.status = LetterStatus.dibatalkan
    item.cancelled_at = datetime.utcnow()
    db.commit()
    db.refresh(item)
    return serialize_request(db, item)
