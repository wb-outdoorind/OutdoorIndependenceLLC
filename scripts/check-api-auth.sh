#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "Checking API auth helper usage..."

if [[ -f "middleware.ts" || -f "middleware.js" || -f "middleware.mjs" || -f "middleware.cjs" ]]; then
  echo "ERROR: middleware file detected. Next.js 16 requires proxy.ts convention."
  exit 1
fi

if rg -n --pcre2 '\bgetCurrentUserProfile\(' app/api >/tmp/api-auth-calls.txt 2>/dev/null; then
  echo "ERROR: Non-strict auth helper call found in app/api:"
  cat /tmp/api-auth-calls.txt
  exit 1
fi

if rg -n --pcre2 'import\s*\{[^}]*\bgetCurrentUserProfile\b[^}]*\}\s*from\s*["'\'']@/lib/supabase/server["'\'']' app/api >/tmp/api-auth-imports.txt 2>/dev/null; then
  echo "ERROR: Non-strict auth helper import found in app/api:"
  cat /tmp/api-auth-imports.txt
  exit 1
fi

echo "OK: API routes use strict auth helper only."
