from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import ensure_complex_access, get_current_user, require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import User, UserRole, Voting, VotingOption, VotingVote
from app.schemas.votings import VoteCreate, VotingCreate, VotingOptionRead, VotingRead, VotingUpdate

router = APIRouter(prefix="/votings", tags=["votings"])


def serialize_voting(db: Session, voting: Voting, user: User) -> VotingRead:
    options = db.scalars(
        select(VotingOption).where(VotingOption.voting_id == voting.id, VotingOption.is_deleted.is_(False))
    ).all()
    my_vote = db.scalar(select(VotingVote).where(VotingVote.voting_id == voting.id, VotingVote.user_id == user.id))
    option_reads = []
    for option in options:
        votes_count = db.scalar(select(func.count(VotingVote.id)).where(VotingVote.option_id == option.id)) or 0
        voters = []
        if user.role == UserRole.administrator:
            voters = db.scalars(
                select(User.full_name)
                .join(VotingVote, VotingVote.user_id == User.id)
                .where(VotingVote.option_id == option.id)
                .order_by(User.full_name.asc())
            ).all()
        option_reads.append(VotingOptionRead(id=option.id, option_text=option.option_text, votes_count=votes_count, voters=list(voters)))
    data = VotingRead.model_validate(voting).model_dump()
    data.update({"options": option_reads, "my_option_id": my_vote.option_id if my_vote else None})
    return VotingRead(**data)


@router.get("", response_model=list[VotingRead])
def list_votings(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[VotingRead]:
    complex_id = user_complex_id(user)
    query = select(Voting).where(Voting.complex_id == complex_id, Voting.is_deleted.is_(False))
    if user.role == UserRole.penghuni:
        query = query.where(Voting.is_active.is_(True))
    votings = db.scalars(query.order_by(Voting.start_date.desc())).all()
    return [serialize_voting(db, voting, user) for voting in votings]


@router.post("", response_model=VotingRead, status_code=status.HTTP_201_CREATED)
def create_voting(
    payload: VotingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> VotingRead:
    voting = Voting(
        complex_id=user_complex_id(user),
        created_by=user.id,
        title=payload.title,
        description=payload.description,
        image_url=payload.image_url,
        start_date=payload.start_date,
        end_date=payload.end_date,
        is_active=payload.is_active,
    )
    db.add(voting)
    db.flush()
    db.add_all([VotingOption(voting_id=voting.id, option_text=text) for text in payload.options])
    db.commit()
    db.refresh(voting)
    return serialize_voting(db, voting, user)


@router.post("/{voting_id}/vote", response_model=VotingRead)
def submit_vote(
    voting_id: int,
    payload: VoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.penghuni)),
) -> VotingRead:
    voting = db.scalar(select(Voting).where(Voting.id == voting_id, Voting.is_deleted.is_(False)))
    if not voting:
        raise HTTPException(status_code=404, detail="Voting not found")
    ensure_complex_access(db, user, voting.complex_id)
    now = datetime.utcnow()
    if not voting.is_active:
        raise HTTPException(status_code=400, detail="Voting is not published")
    option = db.scalar(
        select(VotingOption).where(
            VotingOption.id == payload.option_id,
            VotingOption.voting_id == voting_id,
            VotingOption.is_deleted.is_(False),
        )
    )
    if not option:
        raise HTTPException(status_code=404, detail="Voting option not found")
    existing = db.scalar(select(VotingVote).where(VotingVote.voting_id == voting_id, VotingVote.user_id == user.id))
    if existing:
        existing.option_id = payload.option_id
    else:
        db.add(VotingVote(voting_id=voting_id, option_id=payload.option_id, user_id=user.id))
    db.commit()
    db.refresh(voting)
    return serialize_voting(db, voting, user)


@router.patch("/{voting_id}", response_model=VotingRead)
def update_voting(
    voting_id: int,
    payload: VotingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> VotingRead:
    voting = db.scalar(select(Voting).where(Voting.id == voting_id, Voting.is_deleted.is_(False)))
    if not voting:
        raise HTTPException(status_code=404, detail="Voting not found")
    ensure_complex_access(db, user, voting.complex_id)
    data = payload.model_dump(exclude_unset=True)
    options = data.pop("options", None)
    start_date = data.get("start_date", voting.start_date)
    end_date = data.get("end_date", voting.end_date)
    if end_date <= start_date:
        raise HTTPException(status_code=400, detail="end_date must be after start_date")
    for key, value in data.items():
        setattr(voting, key, value)
    if options is not None:
        if len(options) < 2:
            raise HTTPException(status_code=400, detail="Voting needs at least two options")
        old_options = db.scalars(select(VotingOption).where(VotingOption.voting_id == voting.id, VotingOption.is_deleted.is_(False))).all()
        for option in old_options:
            option.soft_delete()
        db.add_all([VotingOption(voting_id=voting.id, option_text=text) for text in options])
    db.commit()
    db.refresh(voting)
    return serialize_voting(db, voting, user)


@router.delete("/{voting_id}")
def delete_voting(
    voting_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(UserRole.administrator)),
) -> dict[str, str]:
    voting = db.scalar(select(Voting).where(Voting.id == voting_id, Voting.is_deleted.is_(False)))
    if not voting:
        raise HTTPException(status_code=404, detail="Voting not found")
    ensure_complex_access(db, user, voting.complex_id)
    voting.soft_delete()
    db.commit()
    return {"message": "Voting deleted"}
