from __future__ import annotations

import argparse
from pathlib import Path
import sys

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.core.config import get_settings
from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.entities import User, UserRole


def parse_args() -> argparse.Namespace:
    settings = get_settings()
    parser = argparse.ArgumentParser(description="Create or update the Resida superadmin user.")
    parser.add_argument("--email", default=settings.seed_superadmin_email)
    parser.add_argument("--password", default=settings.seed_superadmin_password)
    parser.add_argument("--name", default="Superadmin Resida")
    parser.add_argument("--no-update-password", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    email = args.email.strip().lower()
    if not email:
        print("Email superadmin wajib diisi.", file=sys.stderr)
        return 2
    if not args.password and not args.no_update_password:
        print("Password superadmin wajib diisi.", file=sys.stderr)
        return 2

    try:
        with SessionLocal() as db:
            user = db.scalar(select(User).where(User.email == email, User.is_deleted.is_(False)))
            if user:
                user.full_name = args.name
                user.role = UserRole.superadmin
                user.complex_id = None
                user.is_active = True
                user.is_email_verified = True
                if not args.no_update_password:
                    user.password_hash = hash_password(args.password)
                action = "updated"
            else:
                user = User(
                    complex_id=None,
                    full_name=args.name,
                    email=email,
                    password_hash=hash_password(args.password),
                    role=UserRole.superadmin,
                    is_email_verified=True,
                    is_active=True,
                )
                db.add(user)
                action = "created"
            db.commit()
            db.refresh(user)
    except SQLAlchemyError as exc:
        print(f"Gagal membuat superadmin: {exc}", file=sys.stderr)
        return 1

    print(f"Superadmin {action}:")
    print(f"  id    : {user.id}")
    print(f"  email : {user.email}")
    print(f"  role  : {user.role.value}")
    if not args.no_update_password:
        print("  password sudah diset/diupdate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
