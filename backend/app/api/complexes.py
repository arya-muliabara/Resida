from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.core.security import hash_password
from app.db.session import get_db
from app.models.entities import Complex, ComplexAdministrator, RegistrationRequest, RegistrationStatus, User, UserRole
from app.schemas.users import ComplexCreate, ComplexRead, ComplexUpdate, UserCreate, UserRead, UserUpdate

router = APIRouter(prefix="/complexes", tags=["complexes"])
MANAGED_RESIDENT_ROLES = [UserRole.penghuni, UserRole.security, UserRole.supports]


def ensure_admin_complex(current: User) -> int:
    if current.role != UserRole.administrator or not current.complex_id:
        raise HTTPException(status_code=403, detail="Admin Komplek only")
    return current.complex_id


def get_managed_resident(db: Session, current: User, user_id: int) -> User:
    complex_id = ensure_admin_complex(current)
    user = db.scalar(
        select(User).where(
            User.id == user_id,
            User.complex_id == complex_id,
            User.role.in_(MANAGED_RESIDENT_ROLES),
            User.is_deleted.is_(False),
        )
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=list[ComplexRead])
def list_complexes(db: Session = Depends(get_db)) -> list[Complex]:
    return list(db.scalars(select(Complex).where(Complex.is_deleted.is_(False)).order_by(Complex.name)))


@router.post("", response_model=ComplexRead, status_code=status.HTTP_201_CREATED)
def create_complex(
    payload: ComplexCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.superadmin)),
) -> Complex:
    complex_ = Complex(**payload.model_dump())
    db.add(complex_)
    db.commit()
    db.refresh(complex_)
    return complex_


@router.get("/users", response_model=list[UserRead])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.superadmin)),
) -> list[User]:
    return list(db.scalars(select(User).where(User.is_deleted.is_(False)).order_by(User.full_name)))


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.superadmin)),
) -> User:
    if payload.role != UserRole.superadmin and not payload.complex_id:
        raise HTTPException(status_code=400, detail="complex_id is required for administrator and penghuni")
    if db.scalar(select(User.id).where(User.email == payload.email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        **payload.model_dump(exclude={"password"}),
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.flush()
    if payload.role == UserRole.administrator and payload.complex_id:
        db.add(ComplexAdministrator(complex_id=payload.complex_id, user_id=user.id, assigned_by=current.id))
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}", response_model=UserRead)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.superadmin)),
) -> User:
    user = db.scalar(select(User).where(User.id == user_id, User.is_deleted.is_(False)))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    data = payload.model_dump(exclude_unset=True)
    if "email" in data and data["email"] != user.email and db.scalar(select(User.id).where(User.email == data["email"], User.id != user_id)):
        raise HTTPException(status_code=409, detail="Email already registered")
    desired_role = data.get("role", user.role)
    desired_complex_id = data.get("complex_id", user.complex_id)
    if desired_role != UserRole.superadmin and not desired_complex_id:
        raise HTTPException(status_code=400, detail="complex_id is required for administrator and penghuni")
    password = data.pop("password", None)
    if password:
        user.password_hash = hash_password(password)
    for key, value in data.items():
        setattr(user, key, value)
    assignments = db.scalars(
        select(ComplexAdministrator).where(
            ComplexAdministrator.user_id == user.id,
            ComplexAdministrator.is_deleted.is_(False),
        )
    ).all()
    for assignment in assignments:
        if user.role != UserRole.administrator or assignment.complex_id != user.complex_id:
            assignment.soft_delete()
    if user.role == UserRole.administrator and user.complex_id:
        assigned = db.scalar(
            select(ComplexAdministrator).where(
                ComplexAdministrator.complex_id == user.complex_id,
                ComplexAdministrator.user_id == user.id,
                ComplexAdministrator.is_deleted.is_(False),
            )
        )
        if not assigned:
            db.add(ComplexAdministrator(complex_id=user.complex_id, user_id=user.id, assigned_by=current.id))
    db.commit()
    db.refresh(user)
    return user


@router.patch("/users/{user_id}/active", response_model=UserRead)
def set_user_active(
    user_id: int,
    payload: dict[str, bool],
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.superadmin)),
) -> User:
    if user_id == current.id and payload.get("is_active") is False:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    user = db.scalar(select(User).where(User.id == user_id, User.is_deleted.is_(False)))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = bool(payload.get("is_active"))
    db.commit()
    db.refresh(user)
    return user


@router.delete("/users/{user_id}")
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.superadmin)),
) -> dict[str, str]:
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    user = db.scalar(select(User).where(User.id == user_id, User.is_deleted.is_(False)))
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = False
    user.soft_delete()
    db.commit()
    return {"message": "User deleted"}


@router.get("/residents", response_model=list[UserRead])
def list_residents(
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.administrator)),
) -> list[User]:
    complex_id = ensure_admin_complex(current)
    approved_registration_user_ids = select(RegistrationRequest.user_id).where(
        RegistrationRequest.complex_id == complex_id,
        RegistrationRequest.status == RegistrationStatus.approved,
        RegistrationRequest.is_deleted.is_(False),
    )
    return list(
        db.scalars(
            select(User)
            .where(
                User.complex_id == complex_id,
                User.role.in_(MANAGED_RESIDENT_ROLES),
                User.is_deleted.is_(False),
                (
                    User.id.in_(approved_registration_user_ids)
                    | (User.is_active.is_(True) & User.is_email_verified.is_(True))
                ),
            )
            .order_by(User.full_name)
        )
    )


@router.post("/residents", response_model=UserRead, status_code=status.HTTP_201_CREATED)
def create_resident(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.administrator)),
) -> User:
    complex_id = ensure_admin_complex(current)
    if payload.role not in MANAGED_RESIDENT_ROLES:
        raise HTTPException(status_code=400, detail="Role hanya boleh Penghuni, Security, atau Supports")
    if db.scalar(select(User.id).where(User.email == payload.email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        **payload.model_dump(exclude={"password", "complex_id"}),
        complex_id=complex_id,
        password_hash=hash_password(payload.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/residents/{user_id}", response_model=UserRead)
def update_resident(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.administrator)),
) -> User:
    user = get_managed_resident(db, current, user_id)
    data = payload.model_dump(exclude_unset=True)
    data.pop("complex_id", None)
    if "role" in data and data["role"] not in MANAGED_RESIDENT_ROLES:
        raise HTTPException(status_code=400, detail="Role hanya boleh Penghuni, Security, atau Supports")
    if "email" in data and data["email"] != user.email and db.scalar(select(User.id).where(User.email == data["email"], User.id != user_id)):
        raise HTTPException(status_code=409, detail="Email already registered")
    password = data.pop("password", None)
    if password:
        user.password_hash = hash_password(password)
    for key, value in data.items():
        setattr(user, key, value)
    db.commit()
    db.refresh(user)
    return user


@router.patch("/residents/{user_id}/active", response_model=UserRead)
def set_resident_active(
    user_id: int,
    payload: dict[str, bool],
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.administrator)),
) -> User:
    user = get_managed_resident(db, current, user_id)
    user.is_active = bool(payload.get("is_active"))
    db.commit()
    db.refresh(user)
    return user


@router.delete("/residents/{user_id}")
def delete_resident(
    user_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(require_roles(UserRole.administrator)),
) -> dict[str, str]:
    user = get_managed_resident(db, current, user_id)
    user.is_active = False
    user.soft_delete()
    db.commit()
    return {"message": "User deleted"}


@router.patch("/{complex_id}", response_model=ComplexRead)
def update_complex(
    complex_id: int,
    payload: ComplexUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.superadmin)),
) -> Complex:
    complex_ = db.scalar(select(Complex).where(Complex.id == complex_id, Complex.is_deleted.is_(False)))
    if not complex_:
        raise HTTPException(status_code=404, detail="Complex not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(complex_, key, value)
    db.commit()
    db.refresh(complex_)
    return complex_


@router.patch("/{complex_id}/active", response_model=ComplexRead)
def set_complex_active(
    complex_id: int,
    payload: dict[str, bool],
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.superadmin)),
) -> Complex:
    complex_ = db.scalar(select(Complex).where(Complex.id == complex_id, Complex.is_deleted.is_(False)))
    if not complex_:
        raise HTTPException(status_code=404, detail="Complex not found")
    complex_.is_active = bool(payload.get("is_active"))
    db.commit()
    db.refresh(complex_)
    return complex_


@router.delete("/{complex_id}")
def delete_complex(
    complex_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles(UserRole.superadmin)),
) -> dict[str, str]:
    complex_ = db.scalar(select(Complex).where(Complex.id == complex_id, Complex.is_deleted.is_(False)))
    if not complex_:
        raise HTTPException(status_code=404, detail="Complex not found")
    complex_.is_active = False
    complex_.soft_delete()
    db.commit()
    return {"message": "Complex deleted"}
