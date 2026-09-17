import enum
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


class UserRole(str, enum.Enum):
    superadmin = "superadmin"
    administrator = "administrator"
    penghuni = "penghuni"
    security = "security"
    supports = "supports"


class DocumentType(str, enum.Enum):
    kartu_keluarga = "kartu_keluarga"
    ktp = "ktp"
    lainnya = "lainnya"


class BookingStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    cancelled = "cancelled"


class RegistrationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class LetterStatus(str, enum.Enum):
    dikirim = "dikirim"
    diproses = "diproses"
    selesai = "selesai"
    dibatalkan = "dibatalkan"


class AttachmentSource(str, enum.Enum):
    penghuni = "penghuni"
    administrator = "administrator"


class NotificationType(str, enum.Enum):
    email_verification = "email_verification"
    booking_confirmation = "booking_confirmation"
    news_published = "news_published"
    news_contribution = "news_contribution"
    voting_reminder = "voting_reminder"
    letter_request_update = "letter_request_update"
    report_created = "report_created"
    report_updated = "report_updated"
    event_created = "event_created"


class NotificationStatus(str, enum.Enum):
    sent = "sent"
    failed = "failed"


class ReportStatus(str, enum.Enum):
    open = "open"
    closed = "closed"


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    def soft_delete(self) -> None:
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()


class Complex(TimestampMixin, Base):
    __tablename__ = "m_complexes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    address: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    users: Mapped[list["User"]] = relationship(back_populates="complex")
    facilities: Mapped[list["Facility"]] = relationship(back_populates="complex")


class User(TimestampMixin, Base):
    __tablename__ = "m_users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int | None] = mapped_column(ForeignKey("m_complexes.id"), nullable=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(150), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(20))
    phone_secondary: Mapped[str | None] = mapped_column(String(20))
    ktp_number: Mapped[str | None] = mapped_column(String(20))
    unit_location: Mapped[str | None] = mapped_column(String(100))
    photo_url: Mapped[str | None] = mapped_column(String(255))
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    email_verification_token: Mapped[str | None] = mapped_column(String(255), index=True)
    email_verification_expired_at: Mapped[datetime | None] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    complex: Mapped[Complex | None] = relationship(back_populates="users")


class UserDocument(TimestampMixin, Base):
    __tablename__ = "m_user_documents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    document_type: Mapped[DocumentType] = mapped_column(Enum(DocumentType), nullable=False)
    document_name: Mapped[str] = mapped_column(String(150), nullable=False)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class RegistrationRequest(TimestampMixin, Base):
    __tablename__ = "trx_registration_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    ktp_document_url: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[RegistrationStatus] = mapped_column(Enum(RegistrationStatus), default=RegistrationStatus.pending, index=True)
    admin_notes: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("m_users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime)


class ComplexAdministrator(TimestampMixin, Base):
    __tablename__ = "trx_complex_administrators"
    __table_args__ = (UniqueConstraint("complex_id", "user_id", name="uq_complex_admin"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    assigned_by: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False)


class News(TimestampMixin, Base):
    __tablename__ = "trx_news"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    cover_image_url: Mapped[str | None] = mapped_column(String(255))
    source_report_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    published_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)


class AppNotification(TimestampMixin, Base):
    __tablename__ = "trx_app_notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    link_type: Mapped[str | None] = mapped_column(String(50))
    link_id: Mapped[int | None] = mapped_column(BigInteger)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    read_at: Mapped[datetime | None] = mapped_column(DateTime)


class Event(TimestampMixin, Base):
    __tablename__ = "trx_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(String(200))
    start_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    end_datetime: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)


class Report(TimestampMixin, Base):
    __tablename__ = "trx_reports"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    reporter_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    location: Mapped[str | None] = mapped_column(String(200))
    priority: Mapped[str] = mapped_column(String(30), default="normal")
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.open, index=True)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("m_users.id"), nullable=True)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime)
    published_news_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)


class ReportAttachment(TimestampMixin, Base):
    __tablename__ = "trx_report_attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("trx_reports.id"), nullable=False, index=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False)
    source: Mapped[AttachmentSource] = mapped_column(Enum(AttachmentSource), nullable=False)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(150))


class ReportFollowUp(TimestampMixin, Base):
    __tablename__ = "trx_report_followups"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(ForeignKey("trx_reports.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    status_after: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), nullable=False)


class NewsMedia(TimestampMixin, Base):
    __tablename__ = "trx_news_media"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    news_id: Mapped[int] = mapped_column(ForeignKey("trx_news.id"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(150))


class NewsComment(TimestampMixin, Base):
    __tablename__ = "trx_news_comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    news_id: Mapped[int] = mapped_column(ForeignKey("trx_news.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    comment: Mapped[str] = mapped_column(Text, nullable=False)


class NewsLike(Base):
    __tablename__ = "trx_news_likes"
    __table_args__ = (UniqueConstraint("news_id", "user_id", name="uq_news_like"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    news_id: Mapped[int] = mapped_column(ForeignKey("trx_news.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class Facility(TimestampMixin, Base):
    __tablename__ = "m_facilities"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color_hex: Mapped[str] = mapped_column(String(7), nullable=False, default="#2f6690")
    description: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(255))
    capacity: Mapped[int | None] = mapped_column(Integer)

    complex: Mapped[Complex] = relationship(back_populates="facilities")


class FacilityMedia(TimestampMixin, Base):
    __tablename__ = "m_facility_media"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    facility_id: Mapped[int] = mapped_column(ForeignKey("m_facilities.id"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(150))


class FacilityBooking(TimestampMixin, Base):
    __tablename__ = "trx_facility_bookings"
    __table_args__ = (
        Index("ix_booking_facility_range", "facility_id", "start_datetime", "end_datetime"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    facility_id: Mapped[int] = mapped_column(ForeignKey("m_facilities.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    start_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_datetime: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[BookingStatus] = mapped_column(Enum(BookingStatus), default=BookingStatus.pending)
    notes: Mapped[str | None] = mapped_column(Text)


class Voting(TimestampMixin, Base):
    __tablename__ = "trx_votings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(255))
    start_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    end_date: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)


class VotingOption(TimestampMixin, Base):
    __tablename__ = "m_voting_options"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    voting_id: Mapped[int] = mapped_column(ForeignKey("trx_votings.id"), nullable=False, index=True)
    option_text: Mapped[str] = mapped_column(String(200), nullable=False)


class VotingVote(Base):
    __tablename__ = "trx_voting_votes"
    __table_args__ = (UniqueConstraint("voting_id", "user_id", name="uq_voting_user_vote"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    voting_id: Mapped[int] = mapped_column(ForeignKey("trx_votings.id"), nullable=False, index=True)
    option_id: Mapped[int] = mapped_column(ForeignKey("m_voting_options.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())


class LetterType(TimestampMixin, Base):
    __tablename__ = "m_letter_types"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class LetterRequest(TimestampMixin, Base):
    __tablename__ = "trx_letter_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    letter_type_id: Mapped[int] = mapped_column(ForeignKey("m_letter_types.id"), nullable=False)
    requester_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[LetterStatus] = mapped_column(Enum(LetterStatus), default=LetterStatus.dikirim)
    submitted_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)
    handled_by: Mapped[int | None] = mapped_column(ForeignKey("m_users.id"))


class LetterRequestAttachment(TimestampMixin, Base):
    __tablename__ = "trx_letter_request_attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    letter_request_id: Mapped[int] = mapped_column(ForeignKey("trx_letter_requests.id"), nullable=False, index=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False)
    source: Mapped[AttachmentSource] = mapped_column(Enum(AttachmentSource), nullable=False)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str] = mapped_column(String(150), nullable=False)


class LetterRequestReply(TimestampMixin, Base):
    __tablename__ = "trx_letter_request_replies"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    letter_request_id: Mapped[int] = mapped_column(ForeignKey("trx_letter_requests.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    status_after: Mapped[LetterStatus] = mapped_column(Enum(LetterStatus), nullable=False)


class House(TimestampMixin, Base):
    __tablename__ = "m_houses"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("m_complexes.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("m_users.id"), nullable=False, index=True)
    address: Mapped[str] = mapped_column(Text, nullable=False)
    block: Mapped[str] = mapped_column(String(50), nullable=False)
    number: Mapped[str] = mapped_column(String(50), nullable=False)
    gps_coordinates: Mapped[str | None] = mapped_column(String(100))
    house_photo_url: Mapped[str | None] = mapped_column(String(255))
    house_status: Mapped[str] = mapped_column(String(30), default="ditempati")


class HouseDocument(TimestampMixin, Base):
    __tablename__ = "m_house_documents"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("m_houses.id"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(String(255), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(150))


class FamilyMember(TimestampMixin, Base):
    __tablename__ = "m_family_members"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    house_id: Mapped[int] = mapped_column(ForeignKey("m_houses.id"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    relationship: Mapped[str | None] = mapped_column(String(80))
    birth_place: Mapped[str | None] = mapped_column(String(100))
    birth_date: Mapped[datetime | None] = mapped_column(DateTime)
    member_type: Mapped[str] = mapped_column(String(30), default="anggota_keluarga")
    identity_document_url: Mapped[str | None] = mapped_column(String(255))
    identity_document_name: Mapped[str | None] = mapped_column(String(150))
    phone: Mapped[str | None] = mapped_column(String(20))
    ktp_number: Mapped[str | None] = mapped_column(String(20))


class NotificationLog(Base):
    __tablename__ = "trx_notification_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("m_users.id"), nullable=True, index=True)
    type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(150), nullable=False)
    subject: Mapped[str] = mapped_column(String(200), nullable=False)
    status: Mapped[NotificationStatus] = mapped_column(Enum(NotificationStatus), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
