from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.models.entities import AppNotification, Event, FamilyMember, FacilityMedia, House, HouseDocument, NewsMedia, Report, ReportAttachment, ReportFollowUp, UserNotificationPreference, WhatsAppGatewayConfig


def ensure_runtime_schema(engine: Engine) -> None:
    inspector = inspect(engine)
    if "m_complexes" not in inspector.get_table_names():
        return

    complex_columns = {column["name"] for column in inspector.get_columns("m_complexes")}
    if "is_active" not in complex_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE m_complexes ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))

    if "trx_news" in inspector.get_table_names():
        news_columns = {column["name"] for column in inspector.get_columns("trx_news")}
        if "is_active" not in news_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE trx_news ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        if "source_report_id" not in news_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE trx_news ADD COLUMN source_report_id BIGINT NULL"))
                connection.execute(text("CREATE INDEX ix_trx_news_source_report_id ON trx_news (source_report_id)"))

    if "trx_votings" in inspector.get_table_names():
        voting_columns = {column["name"] for column in inspector.get_columns("trx_votings")}
        if "is_active" not in voting_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE trx_votings ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT FALSE"))

    if "m_family_members" in inspector.get_table_names():
        member_columns = {column["name"] for column in inspector.get_columns("m_family_members")}
        member_alters = []
        if "birth_place" not in member_columns:
            member_alters.append("ADD COLUMN birth_place VARCHAR(100)")
        if "birth_date" not in member_columns:
            member_alters.append("ADD COLUMN birth_date DATETIME")
        if "member_type" not in member_columns:
            member_alters.append("ADD COLUMN member_type VARCHAR(30) NOT NULL DEFAULT 'anggota_keluarga'")
        if "identity_document_url" not in member_columns:
            member_alters.append("ADD COLUMN identity_document_url VARCHAR(255)")
        if "identity_document_name" not in member_columns:
            member_alters.append("ADD COLUMN identity_document_name VARCHAR(150)")
        with engine.begin() as connection:
            for alter in member_alters:
                connection.execute(text(f"ALTER TABLE m_family_members {alter}"))

    House.__table__.create(bind=engine, checkfirst=True)
    FamilyMember.__table__.create(bind=engine, checkfirst=True)
    HouseDocument.__table__.create(bind=engine, checkfirst=True)
    FacilityMedia.__table__.create(bind=engine, checkfirst=True)
    NewsMedia.__table__.create(bind=engine, checkfirst=True)
    AppNotification.__table__.create(bind=engine, checkfirst=True)
    Event.__table__.create(bind=engine, checkfirst=True)
    Report.__table__.create(bind=engine, checkfirst=True)
    ReportAttachment.__table__.create(bind=engine, checkfirst=True)
    ReportFollowUp.__table__.create(bind=engine, checkfirst=True)
    WhatsAppGatewayConfig.__table__.create(bind=engine, checkfirst=True)
    UserNotificationPreference.__table__.create(bind=engine, checkfirst=True)

    if engine.dialect.name == "mysql":
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE m_users MODIFY COLUMN role "
                    "ENUM('superadmin','administrator','penghuni','security','supports') NOT NULL"
                )
            )
            if "trx_notification_logs" in inspector.get_table_names():
                connection.execute(
                    text(
                        "ALTER TABLE trx_notification_logs MODIFY COLUMN type "
                        "ENUM('email_verification','booking_confirmation','news_published','news_contribution',"
                        "'voting_reminder','letter_request_update','report_created','report_updated','event_created') NOT NULL"
                    )
                )
