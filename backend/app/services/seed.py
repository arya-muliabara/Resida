from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import hash_password
from app.models.entities import (
    Complex,
    ComplexAdministrator,
    Facility,
    LetterType,
    News,
    User,
    UserRole,
    Voting,
    VotingOption,
)


def seed_initial_data(db: Session) -> None:
    settings = get_settings()
    if db.scalar(select(User.id).where(User.email == settings.seed_superadmin_email)):
        return

    complex_ = Complex(
        name="Taman Resida",
        address="Jl. Komunitas No. 1",
        description="Komplek demo untuk menjalankan alur Resida.",
        logo_url="/icons/icon-192.png",
    )
    db.add(complex_)
    db.flush()

    superadmin = User(
        full_name="Superadmin Resida",
        email=settings.seed_superadmin_email,
        password_hash=hash_password(settings.seed_superadmin_password),
        role=UserRole.superadmin,
        is_email_verified=True,
        is_active=True,
    )
    admin = User(
        complex_id=complex_.id,
        full_name="Administrator Komplek",
        email="admin@resida.local",
        password_hash=hash_password("Admin123!"),
        role=UserRole.administrator,
        phone="0811000001",
        is_email_verified=True,
        is_active=True,
    )
    resident = User(
        complex_id=complex_.id,
        full_name="Penghuni Demo",
        email="penghuni@resida.local",
        password_hash=hash_password("Penghuni123!"),
        role=UserRole.penghuni,
        phone="0811000002",
        unit_location="A-01",
        is_email_verified=True,
        is_active=True,
    )
    db.add_all([superadmin, admin, resident])
    db.flush()
    db.add(ComplexAdministrator(complex_id=complex_.id, user_id=admin.id, assigned_by=superadmin.id))

    db.add_all(
        [
            Facility(
                complex_id=complex_.id,
                name="Aula Warga",
                color_hex="#2f6690",
                description="Ruang serbaguna untuk rapat dan acara warga.",
                capacity=80,
                image_url="https://images.unsplash.com/photo-1517502884422-41eaead166d4?auto=format&fit=crop&w=900&q=80",
            ),
            Facility(
                complex_id=complex_.id,
                name="Lapangan",
                color_hex="#31a354",
                description="Area olahraga dan kegiatan luar ruang.",
                capacity=40,
                image_url="https://images.unsplash.com/photo-1526232761682-d26e03ac148e?auto=format&fit=crop&w=900&q=80",
            ),
            LetterType(
                complex_id=complex_.id,
                name="Surat Pengantar RT",
                description="Surat pengantar untuk kebutuhan administrasi umum.",
            ),
        ]
    )
    news = News(
        complex_id=complex_.id,
        author_id=admin.id,
        title="Jadwal Kerja Bakti Minggu Ini",
        content="Kerja bakti akan dilakukan pada hari Minggu pukul 07.00. Mohon seluruh warga membawa alat kebersihan sederhana.",
        cover_image_url="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=900&q=80",
    )
    voting = Voting(
        complex_id=complex_.id,
        created_by=admin.id,
        title="Prioritas Perbaikan Fasilitas",
        description="Pilih satu fasilitas yang perlu menjadi prioritas perbaikan bulan ini.",
        image_url="https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=900&q=80",
        start_date=datetime(2026, 8, 1, 0, 0, 0),
        end_date=datetime(2026, 12, 31, 23, 59, 59),
    )
    db.add_all([news, voting])
    db.flush()
    db.add_all(
        [
            VotingOption(voting_id=voting.id, option_text="Perbaikan lampu jalan"),
            VotingOption(voting_id=voting.id, option_text="Pengecatan pos keamanan"),
            VotingOption(voting_id=voting.id, option_text="Perawatan taman"),
        ]
    )
    db.commit()
