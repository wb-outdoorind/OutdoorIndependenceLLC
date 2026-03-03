#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-https://outdoor-independence-llc-app.vercel.app}}"
BASE_URL="${BASE_URL%/}"

echo "Running web smoke checks against: $BASE_URL"

check_200() {
  local path="$1"
  local code
  code="$(curl -s -o /dev/null -L -w "%{http_code}" "$BASE_URL$path")"
  if [[ "$code" != "200" ]]; then
    echo "FAIL: $path expected 200, got $code"
    exit 1
  fi
  echo "OK: $path -> $code"
}

check_exact() {
  local path="$1"
  local expected="$2"
  local code
  code="$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")"
  if [[ "$code" != "$expected" ]]; then
    echo "FAIL: $path expected $expected, got $code"
    exit 1
  fi
  echo "OK: $path -> $code"
}

check_200 "/"
check_200 "/login"
check_200 "/api/health"

# Protected APIs should reject unauthenticated requests.
check_exact "/api/notifications" "401"
check_exact "/api/trend-actions/digest" "401"
check_exact "/api/sla-alerts" "401"
check_exact "/api/employees/invite" "405"

echo "Smoke checks passed."
