from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import require_roles, user_complex_id
from app.db.session import get_db
from app.models.entities import (
    COMPLEX_ADMIN_ROLES,
    ManagementReport,
    ManagementReportImage,
    ManagementReportStatus,
    NotificationType,
    User,
    UserRole,
)
from app.schemas.management_reports import ManagementReportCreate, ManagementReportRead, ManagementReportReview, ManagementReportStaffRead
from app.services.notifications import notify_users, users_by_roles

router = APIRouter(prefix="/management-reports", tags=["management-reports"])

REPORTER_ROLES = (UserRole.security, UserRole.supports)


def get_management_report(db: Session, report_id: int, user: User) -> ManagementReport:
    report = db.scalar(
        select(ManagementReport).where(
            ManagementReport.id == report_id,
            ManagementReport.complex_id == user_complex_id(user),
            ManagementReport.is_deleted.is_(False),
        )
    )
    if not report:
        raise HTTPException(status_code=404, detail="Laporan pengelola tidak ditemukan")
    return report


def serialize_management_report(db: Session, report: ManagementReport) -> ManagementReportRead:
    reporter = db.get(User, report.reporter_id)
    reviewer = db.get(User, report.reviewed_by) if report.reviewed_by else None
    incoming = db.get(User, report.shift_incoming_user_id) if report.shift_incoming_user_id else None
    outgoing = db.get(User, report.shift_outgoing_user_id) if report.shift_outgoing_user_id else None
    images = list(db.scalars(
        select(ManagementReportImage)
        .where(
            ManagementReportImage.management_report_id == report.id,
            ManagementReportImage.is_deleted.is_(False),
        )
        .order_by(ManagementReportImage.sort_order, ManagementReportImage.id)
    ))
    data = ManagementReportRead.model_validate(report).model_dump()
    data.update(
        {
            "reporter_name": reporter.full_name if reporter else None,
            "reviewer_name": reviewer.full_name if reviewer else None,
            "shift_incoming_user_name": incoming.full_name if incoming else None,
            "shift_outgoing_user_name": outgoing.full_name if outgoing else None,
            "images": images,
            "image_urls": [image.image_url for image in images],
        }
    )
    return ManagementReportRead(**data)


@router.get("", response_model=list[ManagementReportRead])
def list_management_reports(
    report_status: ManagementReportStatus | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES, *REPORTER_ROLES)),
) -> list[ManagementReportRead]:
    query = select(ManagementReport).where(
        ManagementReport.complex_id == user_complex_id(user),
        ManagementReport.is_deleted.is_(False),
    )
    if user.role in REPORTER_ROLES:
        query = query.where(ManagementReport.reporter_id == user.id)
    if report_status:
        query = query.where(ManagementReport.status == report_status)
    reports = db.scalars(query.order_by(ManagementReport.report_date.desc(), ManagementReport.report_time.desc(), ManagementReport.id.desc())).all()
    return [serialize_management_report(db, report) for report in reports]


@router.get("/staff", response_model=list[ManagementReportStaffRead])
def list_management_report_staff(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES, *REPORTER_ROLES)),
) -> list[User]:
    return list(
        db.scalars(
            select(User)
            .where(
                User.complex_id == user_complex_id(user),
                User.role.in_(REPORTER_ROLES),
                User.is_active.is_(True),
                User.is_deleted.is_(False),
            )
            .order_by(User.full_name)
        )
    )


@router.post("", response_model=ManagementReportRead, status_code=status.HTTP_201_CREATED)
def create_management_report(
    payload: ManagementReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*REPORTER_ROLES)),
) -> ManagementReportRead:
    values = payload.model_dump()
    image_urls = values.pop("image_urls", [])
    complex_id = user_complex_id(user)
    if payload.report_type.value == "shift_change":
        shift_ids = {payload.shift_incoming_user_id, payload.shift_outgoing_user_id}
        if None in shift_ids:
            raise HTTPException(status_code=400, detail="Naik Piket dan Turun Piket wajib dipilih untuk laporan ganti shift")
        if len(shift_ids) != 2:
            raise HTTPException(status_code=400, detail="Naik Piket dan Turun Piket harus berbeda")
        valid_count = db.scalar(
            select(func.count(User.id))
            .where(
                User.complex_id == complex_id,
                User.id.in_(shift_ids),
                User.role.in_(REPORTER_ROLES),
                User.is_active.is_(True),
                User.is_deleted.is_(False),
            )
        )
        if valid_count != len(shift_ids):
            raise HTTPException(status_code=400, detail="Petugas piket harus merupakan Security atau Support aktif pada komplek ini")
    else:
        values["shift_incoming_user_id"] = None
        values["shift_outgoing_user_id"] = None
    if payload.report_type.value == "work_report":
        if payload.latitude is None or payload.longitude is None:
            raise HTTPException(status_code=400, detail="Lokasi latitude dan longitude wajib dipilih untuk Laporan Kerja")
        values["resident_guest_count"] = 0
        values["ojol_guest_count"] = 0
        values["electricity_token"] = None
    else:
        values["latitude"] = None
        values["longitude"] = None
    report = ManagementReport(complex_id=complex_id, reporter_id=user.id, **values)
    db.add(report)
    db.flush()
    for order, image_url in enumerate(image_urls):
        clean_url = image_url.strip()
        if clean_url:
            db.add(ManagementReportImage(management_report_id=report.id, image_url=clean_url, sort_order=order))
    notify_users(
        db,
        users_by_roles(db, report.complex_id, list(COMPLEX_ADMIN_ROLES)),
        NotificationType.management_report,
        "Laporan pengelola baru",
        f"{user.full_name} mengirim laporan {report.report_type.value.replace('_', ' ')}.",
        "management_report",
        report.id,
    )
    db.commit()
    db.refresh(report)
    return serialize_management_report(db, report)


@router.delete("/{report_id}/images/{image_id}", response_model=ManagementReportRead)
def delete_own_management_report_image(
    report_id: int,
    image_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*REPORTER_ROLES)),
) -> ManagementReportRead:
    report = get_management_report(db, report_id, user)
    if report.reporter_id != user.id:
        raise HTTPException(status_code=403, detail="Hanya pengunggah laporan yang dapat menghapus foto")
    image = db.scalar(
        select(ManagementReportImage).where(
            ManagementReportImage.id == image_id,
            ManagementReportImage.management_report_id == report_id,
            ManagementReportImage.is_deleted.is_(False),
        )
    )
    if not image:
        raise HTTPException(status_code=404, detail="Foto laporan tidak ditemukan")
    image.soft_delete()
    db.commit()
    db.refresh(report)
    return serialize_management_report(db, report)


@router.patch("/{report_id}/review", response_model=ManagementReportRead)
def review_management_report(
    report_id: int,
    payload: ManagementReportReview,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles(*COMPLEX_ADMIN_ROLES)),
) -> ManagementReportRead:
    report = get_management_report(db, report_id, user)
    if payload.status not in {ManagementReportStatus.approved, ManagementReportStatus.rejected}:
        raise HTTPException(status_code=400, detail="Status review harus approved atau rejected")
    if payload.status == ManagementReportStatus.rejected and not (payload.rejection_reason or "").strip():
        raise HTTPException(status_code=400, detail="Alasan reject wajib diisi")
    report.status = payload.status
    report.rejection_reason = payload.rejection_reason.strip() if payload.status == ManagementReportStatus.rejected else None
    report.reviewed_by = user.id
    report.reviewed_at = datetime.utcnow()
    reporter = db.get(User, report.reporter_id)
    if reporter:
        outcome = "disetujui" if report.status == ManagementReportStatus.approved else "ditolak"
        notify_users(
            db,
            [reporter],
            NotificationType.management_report,
            "Update laporan pengelola",
            f"Laporan Anda {outcome} oleh {user.full_name}.",
            "management_report",
            report.id,
        )
    db.commit()
    db.refresh(report)
    return serialize_management_report(db, report)
