#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_DB_URL env var."
  echo "Example: export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require'"
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$BACKUP_DIR"

SCHEMA_FILE="$BACKUP_DIR/schema_${STAMP}.sql"
DATA_FILE="$BACKUP_DIR/data_${STAMP}.dump"

echo "Creating schema backup -> $SCHEMA_FILE"
pg_dump "$SUPABASE_DB_URL" --schema-only --no-owner --no-privileges --file "$SCHEMA_FILE"

echo "Creating data backup -> $DATA_FILE"
pg_dump "$SUPABASE_DB_URL" --format=custom --data-only --no-owner --no-privileges --file "$DATA_FILE"

echo "Backup complete."
ls -lh "$SCHEMA_FILE" "$DATA_FILE"
