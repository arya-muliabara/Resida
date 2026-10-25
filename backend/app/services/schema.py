from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.models.entities import AppNotification, Event, FamilyMember, FacilityMedia, House, HouseDocument, HouseIplPayment, ManagementReport, ManagementReportImage, MarketplaceComment, MarketplaceImage, MarketplaceLike, MarketplacePost, NewsMedia, PurchaseRequest, PurchaseRequestItem, Report, ReportAttachment, ReportFollowUp


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
    with engine.begin() as connection:
        connection.execute(text("UPDATE m_houses SET house_status = 'dihuni' WHERE house_status = 'ditempati'"))
        connection.execute(text("UPDATE m_houses SET house_status = 'dikosongkan' WHERE house_status = 'kosong'"))
    FamilyMember.__table__.create(bind=engine, checkfirst=True)
    HouseDocument.__table__.create(bind=engine, checkfirst=True)
    HouseIplPayment.__table__.create(bind=engine, checkfirst=True)
    FacilityMedia.__table__.create(bind=engine, checkfirst=True)
    NewsMedia.__table__.create(bind=engine, checkfirst=True)
    AppNotification.__table__.create(bind=engine, checkfirst=True)
    Event.__table__.create(bind=engine, checkfirst=True)
    Report.__table__.create(bind=engine, checkfirst=True)
    ReportAttachment.__table__.create(bind=engine, checkfirst=True)
    ReportFollowUp.__table__.create(bind=engine, checkfirst=True)
    ManagementReport.__table__.create(bind=engine, checkfirst=True)
    ManagementReportImage.__table__.create(bind=engine, checkfirst=True)
    MarketplacePost.__table__.create(bind=engine, checkfirst=True)
    MarketplaceImage.__table__.create(bind=engine, checkfirst=True)
    MarketplaceLike.__table__.create(bind=engine, checkfirst=True)
    MarketplaceComment.__table__.create(bind=engine, checkfirst=True)
    PurchaseRequest.__table__.create(bind=engine, checkfirst=True)
    PurchaseRequestItem.__table__.create(bind=engine, checkfirst=True)

    purchase_request_columns = {
        column["name"] for column in inspect(engine).get_columns("trx_purchase_requests")
    }
    purchase_request_alters = []
    if "transaction_proof_url" not in purchase_request_columns:
        purchase_request_alters.append("ADD COLUMN transaction_proof_url VARCHAR(255) NULL")
    if "transaction_proof_name" not in purchase_request_columns:
        purchase_request_alters.append("ADD COLUMN transaction_proof_name VARCHAR(255) NULL")
    if purchase_request_alters:
        with engine.begin() as connection:
            for alter in purchase_request_alters:
                connection.execute(text(f"ALTER TABLE trx_purchase_requests {alter}"))

    marketplace_columns = {column["name"] for column in inspect(engine).get_columns("trx_marketplace_posts")}
    if "phone" not in marketplace_columns:
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE trx_marketplace_posts ADD COLUMN phone VARCHAR(20) NULL"))

    management_report_columns = {column["name"] for column in inspect(engine).get_columns("trx_management_reports")}
    management_report_alters = []
    if "shift_incoming_user_id" not in management_report_columns:
        management_report_alters.append("ADD COLUMN shift_incoming_user_id BIGINT NULL")
    if "shift_outgoing_user_id" not in management_report_columns:
        management_report_alters.append("ADD COLUMN shift_outgoing_user_id BIGINT NULL")
    if "latitude" not in management_report_columns:
        management_report_alters.append("ADD COLUMN latitude DECIMAL(10,7) NULL")
    if "longitude" not in management_report_columns:
        management_report_alters.append("ADD COLUMN longitude DECIMAL(10,7) NULL")
    if management_report_alters:
        with engine.begin() as connection:
            for alter in management_report_alters:
                connection.execute(text(f"ALTER TABLE trx_management_reports {alter}"))

    if engine.dialect.name == "mysql":
        with engine.begin() as connection:
            connection.execute(
                text("ALTER TABLE m_houses MODIFY COLUMN house_status VARCHAR(30) NOT NULL DEFAULT 'dihuni'")
            )
            connection.execute(
                text(
                    "ALTER TABLE m_users MODIFY COLUMN role "
                    "ENUM('superadmin','administrator','pengurus','penghuni','security','supports') NOT NULL"
                )
            )
            connection.execute(
                text(
                    "ALTER TABLE trx_management_reports MODIFY COLUMN report_type "
                    "ENUM('shift_change','work_report','incidental') NOT NULL"
                )
            )
            if "trx_notification_logs" in inspector.get_table_names():
                connection.execute(
                    text(
                        "ALTER TABLE trx_notification_logs MODIFY COLUMN type "
                        "ENUM('email_verification','booking_confirmation','news_published','news_contribution',"
                        "'voting_reminder','letter_request_update','report_created','report_updated','event_created','purchase_request','management_report') NOT NULL"
                    )
                )
            if "trx_app_notifications" in inspector.get_table_names():
                connection.execute(
                    text(
                        "ALTER TABLE trx_app_notifications MODIFY COLUMN type "
                        "ENUM('email_verification','booking_confirmation','news_published','news_contribution',"
                        "'voting_reminder','letter_request_update','report_created','report_updated','event_created','purchase_request','management_report') NOT NULL"
                    )
                )
