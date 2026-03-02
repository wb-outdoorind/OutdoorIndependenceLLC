#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${SUPABASE_RESTORE_DB_URL:-}" ]]; then
  echo "Missing SUPABASE_RESTORE_DB_URL env var (non-production drill database)."
  exit 1
fi

SCHEMA_FILE="${1:-}"
DATA_FILE="${2:-}"

if [[ -z "$SCHEMA_FILE" || -z "$DATA_FILE" ]]; then
  echo "Usage: SUPABASE_RESTORE_DB_URL=... $0 <schema.sql> <data.dump>"
  exit 1
fi

if [[ ! -f "$SCHEMA_FILE" ]]; then
  echo "Schema file not found: $SCHEMA_FILE"
  exit 1
fi

if [[ ! -f "$DATA_FILE" ]]; then
  echo "Data backup file not found: $DATA_FILE"
  exit 1
fi

echo "Running restore drill on non-production database..."
psql "$SUPABASE_RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f "$SCHEMA_FILE"
pg_restore --no-owner --no-privileges --data-only --dbname "$SUPABASE_RESTORE_DB_URL" "$DATA_FILE"

echo "Restore drill completed. Verify row counts manually before sign-off."
