#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${APP_DIR}/.env"

if [[ -f "${ENV_FILE}" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "${ENV_FILE}"
  set +a
fi

MYSQL_HOST="${MYSQL_HOST:-localhost}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_ROOT_USER="${MYSQL_ROOT_USER:-root}"
DB_NAME="${DB_NAME:-db_resida}"
DB_USER="${DB_USER:-resida_app}"
DB_PASSWORD="${DB_PASSWORD:-resida_password}"
DB_APP_HOST="${DB_APP_HOST:-%}"

sql_escape() {
  printf "%s" "$1" | sed "s/'/''/g"
}

DB_NAME_SQL="$(sql_escape "${DB_NAME}")"
DB_USER_SQL="$(sql_escape "${DB_USER}")"
DB_PASSWORD_SQL="$(sql_escape "${DB_PASSWORD}")"
DB_APP_HOST_SQL="$(sql_escape "${DB_APP_HOST}")"

mysql \
  --host="${MYSQL_HOST}" \
  --port="${MYSQL_PORT}" \
  --user="${MYSQL_ROOT_USER}" \
  --password \
  --execute="
SET @db_name = '${DB_NAME_SQL}';
SET @app_user = '${DB_USER_SQL}';
SET @app_password = '${DB_PASSWORD_SQL}';
SET @app_host = '${DB_APP_HOST_SQL}';

SET @create_database = CONCAT(
  'CREATE DATABASE IF NOT EXISTS \`', @db_name,
  '\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
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
  'ON \`', @db_name, '\`.* TO ''', @app_user, '''@''', @app_host, ''''
);
PREPARE stmt FROM @grant_privileges;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

FLUSH PRIVILEGES;

SELECT
  @db_name AS database_name,
  CONCAT(@app_user, '@', @app_host) AS application_user,
  'created_or_updated' AS status;
"
