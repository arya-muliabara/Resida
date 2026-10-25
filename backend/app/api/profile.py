from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.db.session import get_db
from app.models.entities import FamilyMember, House, HouseDocument, HouseIplPayment, User, UserDocument, UserRole
from app.schemas.users import (
    FamilyMemberCreate,
    FamilyMemberRead,
    FamilyMemberUpdate,
    HouseCreate,
    HouseIplPaymentRead,
    HouseIplPaymentUpdate,
    HouseRead,
    HouseUpdate,
    PasswordChange,
    ProfileUpdate,
    UserDocumentCreate,
    UserDocumentRead,
    UserRead,
)

router = APIRouter(prefix="/profile", tags=["profile"])


def serialize_house(db: Session, house: House) -> HouseRead:
    owner = db.get(User, house.user_id)
    members = db.scalars(
        select(FamilyMember)
        .where(FamilyMember.house_id == house.id, FamilyMember.is_deleted.is_(False))
        .order_by(FamilyMember.full_name.asc())
    ).all()
    documents = db.scalars(
        select(HouseDocument)
        .where(HouseDocument.house_id == house.id, HouseDocument.is_deleted.is_(False))
        .order_by(HouseDocument.id.asc())
    ).all()
    data = HouseRead.model_validate(house).model_dump()
    data.update({
        "family_members": members,
        "documents": documents,
        "owner_name": owner.full_name if owner else None,
        "owner_email": owner.email if owner else None,
    })
    return HouseRead(**data)


def house_scope_query(user: User):
    query = select(House).where(House.is_deleted.is_(False))
    if user.role == UserRole.administrator and user.complex_id:
        return query.where(House.complex_id == user.complex_id)
    return query.where(House.user_id == user.id)


def get_scoped_house(db: Session, user: User, house_id: int) -> House:
    house = db.scalar(house_scope_query(user).where(House.id == house_id))
    if not house:
        raise HTTPException(status_code=404, detail="House profile not found")
    return house


def resolve_house_user_id(db: Session, current: User, requested_user_id: int | None) -> int:
    if current.role != UserRole.administrator:
        return current.id
    target_id = requested_user_id or current.id
    target = db.scalar(
        select(User).where(
            User.id == target_id,
            User.complex_id == current.complex_id,
            User.role == UserRole.penghuni,
            User.is_deleted.is_(False),
        )
    )
    if not target:
        raise HTTPException(status_code=400, detail="User Access penghuni tidak valid untuk komplek ini")
    return target.id


def sync_house_documents(db: Session, house: House, document_urls: list[str]) -> None:
    requested_urls = list(dict.fromkeys(str(url).strip() for url in document_urls if str(url).strip()))
    active_documents = list(db.scalars(
        select(HouseDocument).where(HouseDocument.house_id == house.id, HouseDocument.is_deleted.is_(False))
    ))
    active_by_url = {document.file_url: document for document in active_documents}
    requested_set = set(requested_urls)
    for document in active_documents:
        if document.file_url not in requested_set:
            document.soft_delete()
    for clean_url in requested_urls:
        if clean_url not in active_by_url:
            db.add(HouseDocument(house_id=house.id, file_url=clean_url, file_name=clean_url.rsplit("/", 1)[-1]))


@router.get("", response_model=UserRead)
def read_profile(user: User = Depends(get_current_user)) -> User:
    return user


@router.patch("", response_model=UserRead)
def update_profile(
    payload: ProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> User:
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] != user.email:
        existing = db.scalar(select(User.id).where(User.email == data["email"], User.id != user.id))
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email sudah digunakan oleh akun lain")
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/password")
def change_password(
    payload: PasswordChange,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password lama tidak sesuai")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password updated"}


@router.get("/house", response_model=HouseRead | None)
def read_house(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> HouseRead | None:
    house = db.scalar(house_scope_query(user).order_by(House.id.desc()))
    return serialize_house(db, house) if house else None


@router.get("/houses", response_model=list[HouseRead])
def list_houses(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[HouseRead]:
    houses = db.scalars(house_scope_query(user).order_by(House.block.asc(), House.number.asc(), House.id.desc())).all()
    return [serialize_house(db, house) for house in houses]


@router.get("/houses/{house_id}/ipl", response_model=list[HouseIplPaymentRead])
def list_house_ipl_payments(
    house_id: int,
    year: int = Query(..., ge=2000, le=2200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[HouseIplPayment]:
    get_scoped_house(db, user, house_id)
    return db.scalars(
        select(HouseIplPayment)
        .where(
            HouseIplPayment.house_id == house_id,
            HouseIplPayment.payment_year == year,
            HouseIplPayment.is_deleted.is_(False),
        )
        .order_by(HouseIplPayment.payment_month.asc())
    ).all()


@router.put("/houses/{house_id}/ipl/{year}/{month}", response_model=HouseIplPaymentRead)
def upsert_house_ipl_payment(
    house_id: int,
    year: int,
    month: int,
    payload: HouseIplPaymentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseIplPayment:
    if user.role != UserRole.administrator:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Hanya Administrator Komplek yang dapat mengubah IPL")
    if not 2000 <= year <= 2200 or not 1 <= month <= 12:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Periode IPL tidak valid")
    get_scoped_house(db, user, house_id)
    payment = db.scalar(
        select(HouseIplPayment).where(
            HouseIplPayment.house_id == house_id,
            HouseIplPayment.payment_year == year,
            HouseIplPayment.payment_month == month,
            HouseIplPayment.is_deleted.is_(False),
        )
    )
    if not payment:
        payment = HouseIplPayment(house_id=house_id, payment_year=year, payment_month=month)
        db.add(payment)
    payment.amount = payload.amount
    payment.is_paid = payload.is_paid
    db.commit()
    db.refresh(payment)
    return payment


@router.post("/houses", response_model=HouseRead, status_code=status.HTTP_201_CREATED)
def create_house(
    payload: HouseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseRead:
    if not user.complex_id:
        raise HTTPException(status_code=400, detail="User has no active complex")
    data = payload.model_dump()
    document_urls = data.pop("document_urls", [])
    requested_user_id = data.pop("user_id", None)
    house = House(complex_id=user.complex_id, user_id=resolve_house_user_id(db, user, requested_user_id), **data)
    db.add(house)
    db.commit()
    db.refresh(house)
    sync_house_documents(db, house, document_urls)
    db.commit()
    db.refresh(house)
    return serialize_house(db, house)


@router.post("/house", response_model=HouseRead, status_code=status.HTTP_201_CREATED)
def create_house_legacy(
    payload: HouseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseRead:
    return create_house(payload, db, user)


@router.patch("/houses/{house_id}", response_model=HouseRead)
def update_house(
    house_id: int,
    payload: HouseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseRead:
    house = get_scoped_house(db, user, house_id)
    data = payload.model_dump(exclude_unset=True)
    document_urls = data.pop("document_urls", None)
    requested_user_id = data.pop("user_id", None)
    if user.role == UserRole.administrator and requested_user_id is not None:
        house.user_id = resolve_house_user_id(db, user, requested_user_id)
    for key, value in data.items():
        setattr(house, key, value)
    if document_urls is not None:
        sync_house_documents(db, house, document_urls)
    db.commit()
    db.refresh(house)
    return serialize_house(db, house)


@router.patch("/house", response_model=HouseRead)
def update_house_legacy(
    payload: HouseUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HouseRead:
    house = db.scalar(house_scope_query(user).order_by(House.id.desc()))
    if not house:
        raise HTTPException(status_code=404, detail="House profile not found")
    return update_house(house.id, payload, db, user)


@router.delete("/houses/{house_id}")
def delete_house(house_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, str]:
    house = get_scoped_house(db, user, house_id)
    for member in db.scalars(select(FamilyMember).where(FamilyMember.house_id == house.id, FamilyMember.is_deleted.is_(False))):
        member.soft_delete()
    for document in db.scalars(select(HouseDocument).where(HouseDocument.house_id == house.id, HouseDocument.is_deleted.is_(False))):
        document.soft_delete()
    for payment in db.scalars(select(HouseIplPayment).where(HouseIplPayment.house_id == house.id, HouseIplPayment.is_deleted.is_(False))):
        payment.soft_delete()
    house.soft_delete()
    db.commit()
    return {"message": "House profile deleted"}


@router.delete("/house")
def delete_house_legacy(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, str]:
    house = db.scalar(house_scope_query(user).order_by(House.id.desc()))
    if not house:
        raise HTTPException(status_code=404, detail="House profile not found")
    return delete_house(house.id, db, user)


@router.post("/houses/{house_id}/members", response_model=FamilyMemberRead, status_code=status.HTTP_201_CREATED)
def add_family_member(
    house_id: int,
    payload: FamilyMemberCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FamilyMember:
    house = get_scoped_house(db, user, house_id)
    member = FamilyMember(house_id=house.id, **payload.model_dump())
    db.add(member)
    db.commit()
    db.refresh(member)
    return member


@router.post("/house/members", response_model=FamilyMemberRead, status_code=status.HTTP_201_CREATED)
def add_family_member_legacy(
    payload: FamilyMemberCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FamilyMember:
    house = db.scalar(house_scope_query(user).order_by(House.id.desc()))
    if not house:
        raise HTTPException(status_code=404, detail="House profile not found")
    return add_family_member(house.id, payload, db, user)


@router.patch("/houses/{house_id}/members/{member_id}", response_model=FamilyMemberRead)
def update_family_member(
    house_id: int,
    member_id: int,
    payload: FamilyMemberUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FamilyMember:
    get_scoped_house(db, user, house_id)
    member = db.scalar(select(FamilyMember).where(FamilyMember.id == member_id, FamilyMember.house_id == house_id, FamilyMember.is_deleted.is_(False)))
    if not member:
        raise HTTPException(status_code=404, detail="Family member not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(member, key, value)
    db.commit()
    db.refresh(member)
    return member


@router.patch("/house/members/{member_id}", response_model=FamilyMemberRead)
def update_family_member_legacy(
    member_id: int,
    payload: FamilyMemberUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FamilyMember:
    member = db.scalar(
        select(FamilyMember)
        .join(House, House.id == FamilyMember.house_id)
        .where(FamilyMember.id == member_id, House.user_id == user.id, FamilyMember.is_deleted.is_(False))
    )
    if not member:
        raise HTTPException(status_code=404, detail="Family member not found")
    return update_family_member(member.house_id, member_id, payload, db, user)


@router.delete("/houses/{house_id}/members/{member_id}")
def delete_family_member(
    house_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    get_scoped_house(db, user, house_id)
    member = db.scalar(select(FamilyMember).where(FamilyMember.id == member_id, FamilyMember.house_id == house_id, FamilyMember.is_deleted.is_(False)))
    if not member:
        raise HTTPException(status_code=404, detail="Family member not found")
    member.soft_delete()
    db.commit()
    return {"message": "Family member deleted"}


@router.delete("/house/members/{member_id}")
def delete_family_member_legacy(
    member_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    member = db.scalar(
        select(FamilyMember)
        .join(House, House.id == FamilyMember.house_id)
        .where(FamilyMember.id == member_id, House.user_id == user.id, FamilyMember.is_deleted.is_(False))
    )
    if not member:
        raise HTTPException(status_code=404, detail="Family member not found")
    return delete_family_member(member.house_id, member_id, db, user)


@router.get("/documents", response_model=list[UserDocumentRead])
def list_documents(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[UserDocument]:
    return list(
        db.scalars(
            select(UserDocument)
            .where(UserDocument.user_id == user.id, UserDocument.is_deleted.is_(False))
            .order_by(UserDocument.uploaded_at.desc())
        )
    )


@router.post("/documents", response_model=UserDocumentRead, status_code=status.HTTP_201_CREATED)
def add_document(
    payload: UserDocumentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserDocument:
    document = UserDocument(user_id=user.id, **payload.model_dump())
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


@router.delete("/documents/{document_id}")
def delete_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict[str, str]:
    document = db.scalar(
        select(UserDocument).where(
            UserDocument.id == document_id,
            UserDocument.user_id == user.id,
            UserDocument.is_deleted.is_(False),
        )
    )
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    document.soft_delete()
    db.commit()
    return {"message": "Document deleted"}
