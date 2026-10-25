-- Resida Marketplace migration for an existing db_resida database.
USE `db_resida`;

CREATE TABLE IF NOT EXISTS `trx_marketplace_posts` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `complex_id` BIGINT NOT NULL,
  `author_id` BIGINT NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `description` TEXT NOT NULL,
  `item_type` ENUM('barang','jasa') NOT NULL,
  `price` BIGINT NOT NULL DEFAULT 0,
  `phone` VARCHAR(20) NULL,
  `status` ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `rejection_reason` TEXT NULL,
  `reviewed_by` BIGINT NULL,
  `reviewed_at` DATETIME NULL,
  `published_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_marketplace_posts_complex_status` (`complex_id`, `status`),
  INDEX `ix_marketplace_posts_author_id` (`author_id`),
  INDEX `ix_marketplace_posts_published_at` (`published_at`),
  INDEX `ix_marketplace_posts_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_marketplace_posts_complex_id` FOREIGN KEY (`complex_id`) REFERENCES `m_complexes` (`id`),
  CONSTRAINT `fk_marketplace_posts_author_id` FOREIGN KEY (`author_id`) REFERENCES `m_users` (`id`),
  CONSTRAINT `fk_marketplace_posts_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_marketplace_images` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `marketplace_post_id` BIGINT NOT NULL,
  `image_url` VARCHAR(255) NOT NULL,
  `sort_order` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_marketplace_images_post_id` (`marketplace_post_id`),
  INDEX `ix_marketplace_images_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_marketplace_images_post_id` FOREIGN KEY (`marketplace_post_id`) REFERENCES `trx_marketplace_posts` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_marketplace_likes` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `marketplace_post_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_marketplace_like` (`marketplace_post_id`, `user_id`),
  INDEX `ix_marketplace_likes_post_id` (`marketplace_post_id`),
  INDEX `ix_marketplace_likes_user_id` (`user_id`),
  CONSTRAINT `fk_marketplace_likes_post_id` FOREIGN KEY (`marketplace_post_id`) REFERENCES `trx_marketplace_posts` (`id`),
  CONSTRAINT `fk_marketplace_likes_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `trx_marketplace_comments` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `marketplace_post_id` BIGINT NOT NULL,
  `user_id` BIGINT NOT NULL,
  `comment` TEXT NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME NULL,
  `is_deleted` BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (`id`),
  INDEX `ix_marketplace_comments_post_id` (`marketplace_post_id`),
  INDEX `ix_marketplace_comments_user_id` (`user_id`),
  INDEX `ix_marketplace_comments_is_deleted` (`is_deleted`),
  CONSTRAINT `fk_marketplace_comments_post_id` FOREIGN KEY (`marketplace_post_id`) REFERENCES `trx_marketplace_posts` (`id`),
  CONSTRAINT `fk_marketplace_comments_user_id` FOREIGN KEY (`user_id`) REFERENCES `m_users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
