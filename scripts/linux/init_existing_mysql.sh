#!/usr/bin/env bash
set -euo pipefail

: "${MYSQL_CONTAINER:?Set MYSQL_CONTAINER to the existing MySQL container name.}"
: "${MYSQL_ROOT_PASSWORD:?Set MYSQL_ROOT_PASSWORD to the existing MySQL root password.}"
: "${DB_NAME:?Set DB_NAME.}"
: "${DB_USER:?Set DB_USER.}"
: "${DB_PASSWORD:?Set DB_PASSWORD.}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCHEMA_FILE="${SCHEMA_FILE:-${SCRIPT_DIR}/../../scripts/sql/001_resida_schema_mysql.sql}"

if [[ ! -f "${SCHEMA_FILE}" ]]; then
  echo "Schema file not found: ${SCHEMA_FILE}" >&2
  exit 1
fi

docker exec -e "MYSQL_PWD=${MYSQL_ROOT_PASSWORD}" -i "${MYSQL_CONTAINER}" \
  mysql -uroot < "${SCHEMA_FILE}"

docker exec -e "MYSQL_PWD=${MYSQL_ROOT_PASSWORD}" -i "${MYSQL_CONTAINER}" \
  mysql -uroot <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
ALTER USER '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
FLUSH PRIVILEGES;
SQL

echo "Database ${DB_NAME} initialized and application user ${DB_USER} is ready."
