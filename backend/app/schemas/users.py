from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.entities import DocumentType, RegistrationStatus, UserRole
from app.schemas.common_base import ORMModel


def normalize_email_value(value: str) -> str:
    email = str(value).strip().lower()
    if not email or "@" not in email or email.startswith("@") or email.endswith("@"):
        raise ValueError("email tidak valid")
    return email


class ComplexRead(ORMModel):
    id: int
    name: str
    address: str | None = None
    description: str | None = None
    logo_url: str | None = None
    is_active: bool = True


class ComplexCreate(BaseModel):
    name: str = Field(max_length=150)
    address: str | None = None
    description: str | None = None
    logo_url: str | None = None
    is_active: bool = True


class ComplexUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=150)
    address: str | None = None
    description: str | None = None
    logo_url: str | None = None
    is_active: bool | None = None


class UserRead(ORMModel):
    id: int
    complex_id: int | None = None
    full_name: str
    email: str
    role: UserRole
    phone: str | None = None
    phone_secondary: str | None = None
    ktp_number: str | None = None
    unit_location: str | None = None
    photo_url: str | None = None
    is_email_verified: bool
    is_active: bool


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    complex_id: int
    ktp_document_url: str = Field(max_length=255)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return normalize_email_value(value)


class RegistrationReview(BaseModel):
    status: RegistrationStatus
    admin_notes: str = Field(min_length=1)


class RegistrationRequestRead(ORMModel):
    id: int
    user_id: int
    complex_id: int
    ktp_document_url: str
    status: RegistrationStatus
    admin_notes: str | None = None
    reviewed_by: int | None = None
    reviewed_at: datetime | None = None
    created_at: datetime | None = None
    email: str | None = None
    full_name: str | None = None
    complex_name: str | None = None


class LoginRequest(BaseModel):
    email: str
    password: str

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return normalize_email_value(value)


class UserCreate(BaseModel):
    full_name: str = Field(max_length=150)
    email: str
    password: str = Field(min_length=8)
    role: UserRole
    complex_id: int | None = None
    phone: str | None = None
    is_email_verified: bool = True

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return normalize_email_value(value)


class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    email: str | None = None
    password: str | None = Field(default=None, min_length=8)
    role: UserRole | None = None
    complex_id: int | None = None
    phone: str | None = None
    phone_secondary: str | None = None
    ktp_number: str | None = None
    unit_location: str | None = None
    photo_url: str | None = None
    is_email_verified: bool | None = None
    is_active: bool | None = None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_optional_email(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return normalize_email_value(value)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    phone_secondary: str | None = Field(default=None, max_length=20)
    ktp_number: str | None = Field(default=None, max_length=20)
    unit_location: str | None = Field(default=None, max_length=100)
    photo_url: str | None = Field(default=None, max_length=255)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class FamilyMemberCreate(BaseModel):
    full_name: str = Field(max_length=150)
    relationship: str | None = Field(default=None, max_length=80)
    birth_place: str | None = Field(default=None, max_length=100)
    birth_date: datetime | None = None
    member_type: str = Field(default="anggota_keluarga", pattern="^(kepala_keluarga|anggota_keluarga|keluarga_tidak_serumah)$")
    identity_document_url: str | None = Field(default=None, max_length=255)
    identity_document_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    ktp_number: str | None = Field(default=None, max_length=20)


class FamilyMemberUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=150)
    relationship: str | None = Field(default=None, max_length=80)
    birth_place: str | None = Field(default=None, max_length=100)
    birth_date: datetime | None = None
    member_type: str | None = Field(default=None, pattern="^(kepala_keluarga|anggota_keluarga|keluarga_tidak_serumah)$")
    identity_document_url: str | None = Field(default=None, max_length=255)
    identity_document_name: str | None = Field(default=None, max_length=150)
    phone: str | None = Field(default=None, max_length=20)
    ktp_number: str | None = Field(default=None, max_length=20)


class FamilyMemberRead(ORMModel):
    id: int
    house_id: int
    full_name: str
    relationship: str | None = None
    birth_place: str | None = None
    birth_date: datetime | None = None
    member_type: str = "anggota_keluarga"
    identity_document_url: str | None = None
    identity_document_name: str | None = None
    phone: str | None = None
    ktp_number: str | None = None


class HouseDocumentRead(ORMModel):
    id: int
    house_id: int
    file_url: str
    file_name: str | None = None


class HouseCreate(BaseModel):
    user_id: int | None = None
    address: str
    block: str = Field(max_length=50)
    number: str = Field(max_length=50)
    gps_coordinates: str | None = Field(default=None, max_length=100)
    house_photo_url: str | None = Field(default=None, max_length=255)
    house_status: str = Field(default="ditempati", pattern="^(ditempati|dihuni|kosong)$")
    document_urls: list[str] = []


class HouseUpdate(BaseModel):
    user_id: int | None = None
    address: str | None = None
    block: str | None = Field(default=None, max_length=50)
    number: str | None = Field(default=None, max_length=50)
    gps_coordinates: str | None = Field(default=None, max_length=100)
    house_photo_url: str | None = Field(default=None, max_length=255)
    house_status: str | None = Field(default=None, pattern="^(ditempati|dihuni|kosong)$")
    document_urls: list[str] | None = None


class HouseRead(ORMModel):
    id: int
    complex_id: int
    user_id: int
    owner_name: str | None = None
    owner_email: str | None = None
    address: str
    block: str
    number: str
    gps_coordinates: str | None = None
    house_photo_url: str | None = None
    house_status: str
    documents: list[HouseDocumentRead] = []
    family_members: list[FamilyMemberRead] = []


class UserDocumentCreate(BaseModel):
    document_type: DocumentType
    document_name: str = Field(max_length=150)
    file_url: str = Field(max_length=255)
    file_size: int | None = None
    mime_type: str | None = Field(default=None, max_length=100)


class UserDocumentRead(ORMModel):
    id: int
    user_id: int
    document_type: DocumentType
    document_name: str
    file_url: str
    file_size: int | None = None
    mime_type: str | None = None
    uploaded_at: datetime
