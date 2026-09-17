import smtplib
from email.message import EmailMessage

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models.entities import NotificationLog, NotificationStatus, NotificationType, User


def send_email(
    db: Session,
    recipient: str,
    subject: str,
    body: str,
    notification_type: NotificationType,
    user: User | None = None,
) -> None:
    settings = get_settings()
    status = NotificationStatus.failed
    if settings.smtp_host:
        message = EmailMessage()
        message["From"] = settings.smtp_from
        message["To"] = recipient
        message["Subject"] = subject
        message.set_content(body)
        try:
            with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
                smtp.starttls()
                if settings.smtp_user:
                    smtp.login(settings.smtp_user, settings.smtp_password)
                smtp.send_message(message)
            status = NotificationStatus.sent
        except Exception:
            status = NotificationStatus.failed

    db.add(
        NotificationLog(
            user_id=user.id if user else None,
            type=notification_type,
            recipient_email=recipient,
            subject=subject,
            status=status,
        )
    )

