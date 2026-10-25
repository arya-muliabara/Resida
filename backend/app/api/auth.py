from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.session import get_db
from app.models.entities import Complex, ComplexAdministrator, DocumentType, NotificationType, RegistrationRequest, User, UserDocument, UserRole
from app.schemas.users import LoginRequest, RegistrationRequestRead, UserRead, normalize_email_value
from app.services.email import send_email
from app.services.notifications import notify_users
from app.services.uploads import save_upload

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=RegistrationRequestRead, status_code=status.HTTP_201_CREATED)
def register(
    full_name: str = Form(..., min_length=2, max_length=150),
    phone: str = Form(..., min_length=8, max_length=20),
    email: str = Form(...),
    password: str = Form(..., min_length=8),
    complex_id: int = Form(...),
    ktp_document: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> RegistrationRequestRead:
    complex_ = db.scalar(select(Complex).where(Complex.id == complex_id, Complex.is_active.is_(True), Complex.is_deleted.is_(False)))
    if not complex_:
        raise HTTPException(status_code=404, detail="Complex not found")
    email_value = normalize_email_value(email)
    if db.scalar(select(User.id).where(User.email == email_value)):
        raise HTTPException(status_code=409, detail="Email already registered")

    full_name_value = " ".join(full_name.split())
    if len(full_name_value) < 2:
        raise HTTPException(status_code=422, detail="Nama lengkap wajib diisi")
    phone_value = phone.strip().translate(str.maketrans("", "", " -()."))
    phone_digits = phone_value[1:] if phone_value.startswith("+") else phone_value
    if not phone_digits.isdigit() or not 8 <= len(phone_digits) <= 15:
        raise HTTPException(status_code=422, detail="Nomor telepon harus terdiri dari 8 sampai 15 digit")

    ktp_url = save_upload(ktp_document, "registration-ktp")
    user = User(
        complex_id=complex_id,
        full_name=full_name_value,
        phone=phone_value,
        email=email_value,
        password_hash=hash_password(password),
        role=UserRole.penghuni,
        is_email_verified=False,
        is_active=False,
    )
    db.add(user)
    db.flush()
    db.add(
        UserDocument(
            user_id=user.id,
            document_type=DocumentType.ktp,
            document_name="KTP Registrasi",
            file_url=ktp_url,
            file_size=ktp_document.size,
            mime_type=ktp_document.content_type,
        )
    )
    registration = RegistrationRequest(user_id=user.id, complex_id=complex_id, ktp_document_url=ktp_url)
    db.add(registration)

    admin_ids = db.scalars(
        select(ComplexAdministrator.user_id).where(
            ComplexAdministrator.complex_id == complex_id,
            ComplexAdministrator.is_deleted.is_(False),
        )
    ).all()
    admins = db.scalars(
        select(User).where(
            User.id.in_(admin_ids),
            User.role == UserRole.administrator,
            User.is_active.is_(True),
            User.is_deleted.is_(False),
        )
    ).all() if admin_ids else []
    for admin in admins:
        send_email(
            db,
            admin.email,
            "Request pendaftaran penghuni baru",
            f"Ada request pendaftaran baru untuk {complex_.name}: {full_name_value}, {phone_value} ({email_value}). Silakan validasi di aplikasi RUKUN.",
            NotificationType.email_verification,
            admin,
        )
    notify_users(
        db, admins, NotificationType.email_verification,
        "Request pendaftaran penghuni baru",
        f"Ada request pendaftaran baru untuk {complex_.name}: {email_value}. Silakan validasi di aplikasi RUKUN.",
        "registration", registration.id,
    )
    send_email(
        db,
        user.email,
        "Pendaftaran RUKUN diterima",
        f"Pendaftaran Anda untuk {complex_.name} sudah diterima dan menunggu validasi administrator.",
        NotificationType.email_verification,
        user,
    )
    db.commit()
    db.refresh(registration)
    data = RegistrationRequestRead.model_validate(registration).model_dump()
    data.update({"email": user.email, "full_name": user.full_name, "phone": user.phone, "complex_name": complex_.name})
    return RegistrationRequestRead(**data)


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> dict:
    user = db.scalar(select(User).where(User.email == payload.email, User.is_deleted.is_(False)))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")
    if not user.is_active or not user.is_email_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Akun belum disetujui administrator")
    token = create_access_token(str(user.id), {"role": user.role.value})
    return {"access_token": token, "token_type": "bearer", "user": UserRead.model_validate(user)}


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> User:
    return user
