-- Laporan Pengelola untuk Security dan Support
-- Aplikasi membuat tabel ini secara otomatis ketika dijalankan.

CREATE TABLE IF NOT EXISTS trx_management_reports (
  id BIGINT NOT NULL AUTO_INCREMENT,
  complex_id BIGINT NOT NULL,
  reporter_id BIGINT NOT NULL,
  report_type ENUM('shift_change','work_report','incidental') NOT NULL,
  report_date DATE NOT NULL,
  report_time VARCHAR(5) NOT NULL,
  shift_incoming_user_id BIGINT NULL,
  shift_outgoing_user_id BIGINT NULL,
  resident_guest_count INT NOT NULL DEFAULT 0,
  ojol_guest_count INT NOT NULL DEFAULT 0,
  electricity_token DECIMAL(12,2) NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  situation VARCHAR(200) NOT NULL,
  notes TEXT NULL,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  rejection_reason TEXT NULL,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_management_report_complex (complex_id),
  KEY ix_management_report_reporter (reporter_id),
  KEY ix_management_report_status (status),
  KEY ix_management_report_deleted (is_deleted),
  CONSTRAINT fk_management_report_complex FOREIGN KEY (complex_id) REFERENCES m_complexes(id),
  CONSTRAINT fk_management_report_reporter FOREIGN KEY (reporter_id) REFERENCES m_users(id),
  CONSTRAINT fk_management_report_shift_incoming FOREIGN KEY (shift_incoming_user_id) REFERENCES m_users(id),
  CONSTRAINT fk_management_report_shift_outgoing FOREIGN KEY (shift_outgoing_user_id) REFERENCES m_users(id),
  CONSTRAINT fk_management_report_reviewer FOREIGN KEY (reviewed_by) REFERENCES m_users(id)
);

CREATE TABLE IF NOT EXISTS trx_management_report_images (
  id BIGINT NOT NULL AUTO_INCREMENT,
  management_report_id BIGINT NOT NULL,
  image_url VARCHAR(255) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_management_report_image_report (management_report_id),
  KEY ix_management_report_image_deleted (is_deleted),
  CONSTRAINT fk_management_report_image_report FOREIGN KEY (management_report_id) REFERENCES trx_management_reports(id)
);

ALTER TABLE trx_app_notifications MODIFY COLUMN type
  ENUM('email_verification','booking_confirmation','news_published','news_contribution',
  'voting_reminder','letter_request_update','report_created','report_updated','event_created',
  'purchase_request','management_report') NOT NULL;
