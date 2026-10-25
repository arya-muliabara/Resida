from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import COMPLEX_ADMIN_ROLES, BookingStatus, Facility, FacilityBooking, FacilityMedia, User, UserRole
from app.schemas.facilities import BookingCreate, BookingRead, BookingStatusUpdate, BookingUpdate, FacilityCreate, FacilityRead, FacilityUpdate

router = APIRouter(prefix="/facilities", tags=["facilities"])


def booking_read(db: Session, booking: FacilityBooking) -> BookingRead:
    facility = db.get(Facility, booking.facility_id)
    requester = db.get(User, booking.user_id)
    data = BookingRead.model_validate(booking).model_dump()
    data.update(
        {
            "facility_name": facility.name if facility else None,
            "facility_color_hex": facility.color_hex if facility else None,
            "requester_name": requester.full_name if requester else None,
        }
    )
    return BookingRead(**data)


def sync_facility_media(db: Session, facility: Facility, media_urls: list[str]) -> None:
    requested_urls = list(dict.fromkeys(str(url).strip() for url in media_urls if str(url).strip()))
    active_media = list(db.scalars(
        select(FacilityMedia).where(FacilityMedia.facility_id == facility.id, FacilityMedia.is_deleted.is_(False))
    ))
    active_by_url = {item.file_url: item for item in active_media}
    requested_set = set(requested_urls)
    for item in active_media:
        if item.file_url not in requested_set:
            item.soft_delete()
    for clean_url in requested_urls:
        if clean_url not in active_by_url:
            db.add(FacilityMedia(facility_id=facility.id, file_url=clean_url, file_name=clean_url.rsplit("/", 1)[-1]))


def facility_read(db: Session, facility: Facility) -> FacilityRead:
    media = db.scalars(
        select(FacilityMedia)
        .where(FacilityMedia.facility_id == facility.id, FacilityMedia.is_deleted.is_(False))
        .order_by(FacilityMedia.id.asc())
    ).all()
    data = FacilityRead.model_validate(facility).model_dump()
    data.update({"media": media})
    return FacilityRead(**data)


@router.get("", response_model=list[FacilityRead])
def list_facilities(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[FacilityRead]:
    complex_id = user_complex_id(user)
    facilities = db.scalars(select(Facility).where(Facility.complex_id == complex_id, Facility.is_deleted.is_(False))).all()
    return [facility_read(db, facility) for facility in facilities]


@router.post("", response_model=FacilityRead, status_code=status.HTTP_201_CREATED)
def create_facility(
    payload: FacilityCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> FacilityRead:
    data = payload.model_dump()
    media_urls = data.pop("media_urls", [])
    if media_urls and not data.get("image_url"):
        data["image_url"] = media_urls[0]
    facility = Facility(complex_id=user_complex_id(user), **data)
    db.add(facility)
    db.commit()
    db.refresh(facility)
    sync_facility_media(db, facility, media_urls)
    db.commit()
    db.refresh(facility)
    return facility_read(db, facility)


@router.patch("/{facility_id}", response_model=FacilityRead)
def update_facility(
    facility_id: int,
    payload: FacilityUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> FacilityRead:
    facility = db.scalar(select(Facility).where(Facility.id == facility_id, Facility.is_deleted.is_(False)))
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    ensure_complex_access(db, user, facility.complex_id)
    data = payload.model_dump(exclude_unset=True)
    media_urls = data.pop("media_urls", None)
    if media_urls is not None:
        data["image_url"] = media_urls[0] if media_urls else None
    for key, value in data.items():
        setattr(facility, key, value)
    if media_urls is not None:
        sync_facility_media(db, facility, media_urls)
    db.commit()
    db.refresh(facility)
    return facility_read(db, facility)


@router.delete("/{facility_id}")
def delete_facility(
    facility_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> dict[str, str]:
    facility = db.scalar(select(Facility).where(Facility.id == facility_id, Facility.is_deleted.is_(False)))
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    ensure_complex_access(db, user, facility.complex_id)
    facility.soft_delete()
    db.commit()
    return {"message": "Facility deleted"}


@router.get("/bookings", response_model=list[BookingRead])
def list_bookings(
    scope: str = "mine",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[BookingRead]:
    complex_id = user_complex_id(user)
    query = (
        select(FacilityBooking)
        .join(Facility, Facility.id == FacilityBooking.facility_id)
        .where(Facility.complex_id == complex_id, FacilityBooking.is_deleted.is_(False))
    )
    if scope == "calendar":
        query = query.where(FacilityBooking.status == BookingStatus.approved)
    elif user.role == UserRole.penghuni:
        query = query.where(FacilityBooking.user_id == user.id)
    rows = db.scalars(query.order_by(FacilityBooking.start_datetime.desc())).all()
    return [booking_read(db, row) for row in rows]


@router.post("/bookings", response_model=BookingRead, status_code=status.HTTP_201_CREATED)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> BookingRead:
    facility = db.scalar(select(Facility).where(Facility.id == payload.facility_id, Facility.is_deleted.is_(False)))
    if not facility:
        raise HTTPException(status_code=404, detail="Facility not found")
    ensure_complex_access(db, user, facility.complex_id)
    conflict = db.scalar(
        select(FacilityBooking.id).where(
            FacilityBooking.facility_id == payload.facility_id,
            FacilityBooking.is_deleted.is_(False),
            FacilityBooking.status.in_([BookingStatus.pending, BookingStatus.approved]),
            FacilityBooking.start_datetime < payload.end_datetime,
            FacilityBooking.end_datetime > payload.start_datetime,
        )
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Schedule conflicts with an active booking")
    booking = FacilityBooking(user_id=user.id, **payload.model_dump())
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return booking_read(db, booking)


@router.patch("/bookings/{booking_id}", response_model=BookingRead)
def update_booking(
    booking_id: int,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BookingRead:
    booking = db.scalar(select(FacilityBooking).where(FacilityBooking.id == booking_id, FacilityBooking.is_deleted.is_(False)))
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    current_facility = db.get(Facility, booking.facility_id)
    ensure_complex_access(db, user, current_facility.complex_id)
    if user.role not in COMPLEX_ADMIN_ROLES and booking.user_id != user.id:
        raise HTTPException(status_code=403, detail="No access to this booking")
    data = payload.model_dump(exclude_unset=True)
    if user.role not in COMPLEX_ADMIN_ROLES:
        data.pop("status", None)
    if "facility_id" in data:
        target_facility = db.scalar(select(Facility).where(Facility.id == data["facility_id"], Facility.is_deleted.is_(False)))
        if not target_facility:
            raise HTTPException(status_code=404, detail="Facility not found")
        ensure_complex_access(db, user, target_facility.complex_id)
    start_datetime = data.get("start_datetime", booking.start_datetime)
    end_datetime = data.get("end_datetime", booking.end_datetime)
    if end_datetime <= start_datetime:
        raise HTTPException(status_code=400, detail="end_datetime must be after start_datetime")
    conflict = db.scalar(
        select(FacilityBooking.id).where(
            FacilityBooking.id != booking.id,
            FacilityBooking.facility_id == data.get("facility_id", booking.facility_id),
            FacilityBooking.is_deleted.is_(False),
            FacilityBooking.status.in_([BookingStatus.pending, BookingStatus.approved]),
            FacilityBooking.start_datetime < end_datetime,
            FacilityBooking.end_datetime > start_datetime,
        )
    )
    if conflict:
        raise HTTPException(status_code=409, detail="Schedule conflicts with an active booking")
    for key, value in data.items():
        setattr(booking, key, value)
    db.commit()
    db.refresh(booking)
    return booking_read(db, booking)


@router.delete("/bookings/{booking_id}")
def delete_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict[str, str]:
    booking = db.scalar(select(FacilityBooking).where(FacilityBooking.id == booking_id, FacilityBooking.is_deleted.is_(False)))
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    facility = db.get(Facility, booking.facility_id)
    ensure_complex_access(db, user, facility.complex_id)
    if user.role not in COMPLEX_ADMIN_ROLES and booking.user_id != user.id:
        raise HTTPException(status_code=403, detail="No access to this booking")
    booking.soft_delete()
    db.commit()
    return {"message": "Booking deleted"}


@router.patch("/bookings/{booking_id}/status", response_model=BookingRead)
def update_booking_status(
    booking_id: int,
    payload: BookingStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> BookingRead:
    booking = db.scalar(select(FacilityBooking).where(FacilityBooking.id == booking_id, FacilityBooking.is_deleted.is_(False)))
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    facility = db.get(Facility, booking.facility_id)
    ensure_complex_access(db, user, facility.complex_id)
    booking.status = payload.status
    db.commit()
    db.refresh(booking)
    return booking_read(db, booking)
