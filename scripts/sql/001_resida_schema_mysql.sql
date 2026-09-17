-- Resida MySQL schema.
-- Run this on your existing MySQL 8.0 server as a root/admin user.

CREATE DATABASE IF NOT EXISTS `db_resida`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `db_resida`;

SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `m_complexes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(150) NOT NULL,
  `address` TEXT NULL,
  `description` TEXT NULL,
  `logo_url` VARCHAR(255) NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_m_complexes_is_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_users` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('superadmin','administrator','penghuni') NOT NULL,
  `phone` VARCHAR(20) NULL,
  `phone_secondary` VARCHAR(20) NULL,
  `ktp_number` VARCHAR(20) NULL,
  `unit_location` VARCHAR(100) NULL,
  `photo_url` VARCHAR(255) NULL,
  `is_email_verified` BOOLEAN NOT NULL DEFAULT FALSE,
  `email_verification_token` VARCHAR(255) NULL,
  `email_verification_expired_at` DATETIME NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_m_users_email` (`email`),
  INDEX `ix_m_users_complex_id` (`complex_id`),
  INDEX `ix_m_users_email` (`email`),
  INDEX `ix_m_users_email_verification_token` (`email_verification_token`),
  INDEX `ix_m_users_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_m_users_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_user_documents` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `document_type` ENUM('kartu_keluarga','ktp','lainnya') NOT NULL,
  `document_name` VARCHAR(150) NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `file_size` INT NULL,
  `mime_type` VARCHAR(100) NULL,
  `uploaded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_m_user_documents_user_id` (`user_id`),
  INDEX `ix_m_user_documents_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_m_user_documents_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_registration_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NOT NULL,
  `complex_id` BIGINT NOT NULL,
  `ktp_document_url` VARCHAR(255) NOT NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `admin_notes` TEXT NULL,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_trx_registration_requests_user_id` (`user_id`),
  INDEX `ix_trx_registration_requests_complex_id` (`complex_id`),
  INDEX `ix_trx_registration_requests_status` (`status`),
  INDEX `ix_trx_registration_requests_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_registration_requests_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`),
  CONSTRAINT `fk_registration_requests_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_registration_requests_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_complex_administrators` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `assigned_by` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_complex_admin` (`complex_id`, `user_id`),
  INDEX `ix_complex_admin_complex_id` (`complex_id`),
  INDEX `ix_complex_admin_user_id` (`user_id`),
  INDEX `ix_complex_admin_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_complex_admin_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_complex_admin_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`),
  CONSTRAINT `fk_complex_admin_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_news` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `author_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `cover_image_url` VARCHAR(255) NULL,
  `published_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_trx_news_complex_id` (`complex_id`),
  INDEX `ix_trx_news_author_id` (`author_id`),
  INDEX `ix_trx_news_published_at` (`published_at`),
  INDEX `ix_trx_news_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_trx_news_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_trx_news_author_id` FOREIGN KEY (`author_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_news_comments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `news_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_news_comments_news_id` (`news_id`),
  INDEX `ix_news_comments_user_id` (`user_id`),
  INDEX `ix_news_comments_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_news_comments_news_id` FOREIGN KEY (`news_id`) REFERENCES `trx_news` (`id`),
  CONSTRAINT `fk_news_comments_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_news_likes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `news_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_news_like` (`news_id`, `user_id`),
  INDEX `ix_news_likes_news_id` (`news_id`),
  INDEX `ix_news_likes_user_id` (`user_id`),
  CONSTRAINT `fk_news_likes_news_id` FOREIGN KEY (`news_id`) REFERENCES `trx_news` (`id`),
  CONSTRAINT `fk_news_likes_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_facilities` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `color_hex` VARCHAR(7) NOT NULL DEFAULT '#2f6690',
  `description` TEXT NULL,
  `image_url` VARCHAR(255) NULL,
  `capacity` INT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_m_facilities_complex_id` (`complex_id`),
  INDEX `ix_m_facilities_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_m_facilities_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_facility_bookings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `facility_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `start_datetime` DATETIME NOT NULL,
  `end_datetime` DATETIME NOT NULL,
  `status` ENUM('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `notes` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_bookings_facility_id` (`facility_id`),
  INDEX `ix_bookings_user_id` (`user_id`),
  INDEX `ix_booking_facility_range` (`facility_id`, `start_datetime`, `end_datetime`),
  INDEX `ix_bookings_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_bookings_facility_id` FOREIGN KEY (`facility_id`) REFERENCES `m_facilities` (`id`),
  CONSTRAINT `fk_bookings_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_votings` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `created_by` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `image_url` VARCHAR(255) NULL,
  `start_date` DATETIME NOT NULL,
  `end_date` DATETIME NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_votings_complex_id` (`complex_id`),
  INDEX `ix_votings_created_by` (`created_by`),
  INDEX `ix_votings_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_votings_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_votings_created_by` FOREIGN KEY (`created_by`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_voting_options` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `voting_id` BIGINT NOT NULL,
  `option_text` VARCHAR(200) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_voting_options_voting_id` (`voting_id`),
  INDEX `ix_voting_options_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_voting_options_voting_id` FOREIGN KEY (`voting_id`) REFERENCES `trx_votings` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_voting_votes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `voting_id` BIGINT NOT NULL,
  `option_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_voting_user_vote` (`voting_id`, `user_id`),
  INDEX `ix_voting_votes_voting_id` (`voting_id`),
  INDEX `ix_voting_votes_user_id` (`user_id`),
  CONSTRAINT `fk_voting_votes_voting_id` FOREIGN KEY (`voting_id`) REFERENCES `trx_votings` (`id`),
  CONSTRAINT `fk_voting_votes_option_id` FOREIGN KEY (`option_id`) REFERENCES `m_voting_options` (`id`),
  CONSTRAINT `fk_voting_votes_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_letter_types` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `description` TEXT NULL,
  `is_active` BOOLEAN NOT NULL DEFAULT TRUE,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_letter_types_complex_id` (`complex_id`),
  INDEX `ix_letter_types_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_letter_types_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_letter_requests` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `letter_type_id` BIGINT NOT NULL,
  `requester_id` BIGINT NOT NULL,
  `description` TEXT NOT NULL,
  `status` ENUM('dikirim','diproses','selesai','dibatalkan') NOT NULL DEFAULT 'dikirim',
  `submitted_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled_at` DATETIME NULL,
  `completed_at` DATETIME NULL,
  `handled_by` BIGINT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_letter_requests_complex_id` (`complex_id`),
  INDEX `ix_letter_requests_requester_id` (`requester_id`),
  INDEX `ix_letter_requests_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_letter_requests_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_letter_requests_letter_type_id` FOREIGN KEY (`letter_type_id`) REFERENCES `m_letter_types` (`id`),
  CONSTRAINT `fk_letter_requests_requester_id` FOREIGN KEY (`requester_id`) REFERENCES `m_users` (`id`),
  CONSTRAINT `fk_letter_requests_handled_by` FOREIGN KEY (`handled_by`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_letter_request_attachments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `letter_request_id` BIGINT NOT NULL,
  `uploaded_by` BIGINT NOT NULL,
  `source` ENUM('penghuni','administrator') NOT NULL,
  `file_url` VARCHAR(255) NOT NULL,
  `file_name` VARCHAR(150) NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_letter_attachments_request_id` (`letter_request_id`),
  INDEX `ix_letter_attachments_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_letter_attachments_request_id` FOREIGN KEY (`letter_request_id`) REFERENCES `trx_letter_requests` (`id`),
  CONSTRAINT `fk_letter_attachments_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_letter_request_replies` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `letter_request_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `note` TEXT NOT NULL,
  `status_after` ENUM('dikirim','diproses','selesai','dibatalkan') NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_letter_replies_request_id` (`letter_request_id`),
  INDEX `ix_letter_replies_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_letter_replies_request_id` FOREIGN KEY (`letter_request_id`) REFERENCES `trx_letter_requests` (`id`),
  CONSTRAINT `fk_letter_replies_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_houses` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `address` TEXT NOT NULL,
  `block` VARCHAR(50) NOT NULL,
  `number` VARCHAR(50) NOT NULL,
  `gps_coordinates` VARCHAR(100) NULL,
  `house_photo_url` VARCHAR(255) NULL,
  `house_status` VARCHAR(30) NOT NULL DEFAULT 'ditempati',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_m_houses_complex_id` (`complex_id`),
  INDEX `ix_m_houses_user_id` (`user_id`),
  INDEX `ix_m_houses_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_m_houses_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_m_houses_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `m_family_members` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `house_id` BIGINT NOT NULL,
  `full_name` VARCHAR(150) NOT NULL,
  `relationship` VARCHAR(80) NULL,
  `phone` VARCHAR(20) NULL,
  `ktp_number` VARCHAR(20) NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_m_family_members_house_id` (`house_id`),
  INDEX `ix_m_family_members_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_m_family_members_house_id` FOREIGN KEY (`house_id`) REFERENCES `m_houses` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_notification_logs` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT NULL,
  `type` ENUM('email_verification','booking_confirmation','news_published','voting_reminder','letter_request_update') NOT NULL,
  `recipient_email` VARCHAR(150) NOT NULL,
  `subject` VARCHAR(200) NOT NULL,
  `status` ENUM('sent','failed') NOT NULL,
  `sent_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `ix_notification_logs_user_id` (`user_id`),
  CONSTRAINT `fk_notification_logs_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP FUNCTION IF EXISTS `fn_resida_booking_conflict`;
DELIMITER $$
CREATE FUNCTION `fn_resida_booking_conflict`(
  p_facility_id BIGINT,
  p_start_datetime DATETIME,
  p_end_datetime DATETIME,
  p_ignore_booking_id BIGINT
) RETURNS TINYINT
DETERMINISTIC
READS SQL DATA
BEGIN
  DECLARE v_conflicts INT DEFAULT 0;

  SELECT COUNT(*)
    INTO v_conflicts
    FROM `trx_facility_bookings`
   WHERE `facility_id` = p_facility_id
     AND `is_deleted` = FALSE
     AND `status` IN ('pending', 'approved')
     AND (p_ignore_booking_id IS NULL OR `id` <> p_ignore_booking_id)
     AND `start_datetime` < p_end_datetime
     AND `end_datetime` > p_start_datetime;

  RETURN IF(v_conflicts > 0, 1, 0);
END$$
DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;
