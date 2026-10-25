-- Permintaan Pembelian (Procure-to-Pay) for RUKUN
-- The application also applies this schema safely at startup.

CREATE TABLE IF NOT EXISTS trx_purchase_requests (
  id BIGINT NOT NULL AUTO_INCREMENT,
  complex_id BIGINT NOT NULL,
  requester_id BIGINT NOT NULL,
  header VARCHAR(200) NOT NULL,
  status ENUM('requested', 'approved', 'rejected', 'completed') NOT NULL DEFAULT 'requested',
  rejection_reason TEXT NULL,
  reviewed_by BIGINT NULL,
  reviewed_at DATETIME NULL,
  actual_amount BIGINT NULL,
  completion_note TEXT NULL,
  transaction_proof_url VARCHAR(255) NULL,
  transaction_proof_name VARCHAR(255) NULL,
  completed_by BIGINT NULL,
  completed_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_purchase_request_complex (complex_id),
  KEY ix_purchase_request_requester (requester_id),
  KEY ix_purchase_request_status (status),
  KEY ix_purchase_request_deleted (is_deleted),
  CONSTRAINT fk_purchase_request_complex FOREIGN KEY (complex_id) REFERENCES m_complexes(id),
  CONSTRAINT fk_purchase_request_requester FOREIGN KEY (requester_id) REFERENCES m_users(id),
  CONSTRAINT fk_purchase_request_reviewer FOREIGN KEY (reviewed_by) REFERENCES m_users(id),
  CONSTRAINT fk_purchase_request_completed_by FOREIGN KEY (completed_by) REFERENCES m_users(id)
);

CREATE TABLE IF NOT EXISTS trx_purchase_request_items (
  id BIGINT NOT NULL AUTO_INCREMENT,
  purchase_request_id BIGINT NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  estimated_price BIGINT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  KEY ix_purchase_request_item_request (purchase_request_id),
  KEY ix_purchase_request_item_deleted (is_deleted),
  CONSTRAINT fk_purchase_request_item_request FOREIGN KEY (purchase_request_id) REFERENCES trx_purchase_requests(id)
);

ALTER TABLE trx_app_notifications MODIFY COLUMN type
  ENUM('email_verification','booking_confirmation','news_published','news_contribution',
  'voting_reminder','letter_request_update','report_created','report_updated','event_created','purchase_request') NOT NULL;
