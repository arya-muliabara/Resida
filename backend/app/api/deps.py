from collections.abc import Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.db.session import get_db
from app.models.entities import COMPLEX_ADMIN_ROLES, Complex, ComplexAdministrator, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    try:
        payload = decode_token(token)
        user_id = int(payload.get("sub"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid authentication")

    user = db.scalar(select(User).where(User.id == user_id, User.is_deleted.is_(False)))
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive or missing user")
    if user.role != UserRole.superadmin and user.complex_id:
        complex_is_active = db.scalar(
            select(Complex.is_active).where(
                Complex.id == user.complex_id,
                Complex.is_deleted.is_(False),
            )
        )
        if complex_is_active is False:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive complex")
    return user


def require_roles(*roles: UserRole) -> Callable[[User], User]:
    def dependency(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permission")
        return user

    return dependency


def ensure_complex_access(db: Session, user: User, complex_id: int) -> None:
    if user.role == UserRole.superadmin:
        return
    if user.role in [UserRole.penghuni, UserRole.security, UserRole.supports] and user.complex_id == complex_id:
        return
    if user.role in COMPLEX_ADMIN_ROLES:
        assigned = db.scalar(
            select(ComplexAdministrator.id).where(
                ComplexAdministrator.user_id == user.id,
                ComplexAdministrator.complex_id == complex_id,
                ComplexAdministrator.is_deleted.is_(False),
            )
        )
        if assigned:
            return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No access to this complex")


def user_complex_id(user: User) -> int:
    if not user.complex_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User has no active complex")
    return user.complex_id
