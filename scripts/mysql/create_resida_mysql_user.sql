-- Create database and limited MySQL user for Resida.
-- Run this as a MySQL root/admin user.
--
-- Before running, change @app_password to the same value used in .env DB_PASSWORD.

SET @db_name = 'db_resida';
SET @app_user = 'resida_app';
SET @app_password = 'resida_password';
SET @app_host = '%';

SET @create_database = CONCAT(
  'CREATE DATABASE IF NOT EXISTS `', @db_name,
  '` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
);
PREPARE stmt FROM @create_database;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @create_user = CONCAT(
  'CREATE USER IF NOT EXISTS ''', @app_user, '''@''', @app_host,
  ''' IDENTIFIED BY ''', REPLACE(@app_password, '''', ''''''), ''''
);
PREPARE stmt FROM @create_user;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @grant_privileges = CONCAT(
  'GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES, ',
  'CREATE TEMPORARY TABLES, LOCK TABLES ',
  'ON `', @db_name, '`.* TO ''', @app_user, '''@''', @app_host, ''''
);
PREPARE stmt FROM @grant_privileges;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

FLUSH PRIVILEGES;

SELECT
  @db_name AS database_name,
  CONCAT(@app_user, '@', @app_host) AS application_user,
  'created_or_updated' AS status;

