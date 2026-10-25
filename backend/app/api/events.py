from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import COMPLEX_ADMIN_ROLES, Event, NotificationType, User, UserRole
from app.schemas.events import EventCreate, EventRead, EventUpdate
from app.services.notifications import notify_users, users_by_roles

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventRead])
def list_events(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[Event]:
    query = select(Event).where(Event.complex_id == user_complex_id(user), Event.is_deleted.is_(False))
    if user.role not in (*COMPLEX_ADMIN_ROLES, UserRole.superadmin):
        query = query.where(Event.is_active.is_(True))
    return list(db.scalars(query.order_by(Event.start_datetime.asc())))


@router.post("", response_model=EventRead, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: Session = Depends(get_db), user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES))) -> Event:
    event = Event(complex_id=user_complex_id(user), created_by=user.id, **payload.model_dump())
    db.add(event)
    db.flush()
    if event.is_active:
        notify_users(
            db,
            users_by_roles(db, event.complex_id, [UserRole.penghuni, UserRole.security, UserRole.supports]),
            NotificationType.event_created,
            "Agenda komplek baru",
            event.title,
            "event",
            event.id,
        )
    db.commit()
    db.refresh(event)
    return event


@router.patch("/{event_id}", response_model=EventRead)
def update_event(event_id: int, payload: EventUpdate, db: Session = Depends(get_db), user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES))) -> Event:
    event = db.scalar(select(Event).where(Event.id == event_id, Event.is_deleted.is_(False)))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    ensure_complex_access(db, user, event.complex_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(event, key, value)
    db.commit()
    db.refresh(event)
    return event


@router.delete("/{event_id}")
def delete_event(event_id: int, db: Session = Depends(get_db), user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES))) -> dict[str, str]:
    event = db.scalar(select(Event).where(Event.id == event_id, Event.is_deleted.is_(False)))
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    ensure_complex_access(db, user, event.complex_id)
    event.soft_delete()
    db.commit()
    return {"message": "Event deleted"}
