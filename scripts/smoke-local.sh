#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-4010}"
BASE_URL="http://127.0.0.1:${PORT}"

echo "Starting local app for smoke checks on ${BASE_URL} ..."
PORT="$PORT" npm run start >/tmp/oi-smoke-start.log 2>&1 &
APP_PID=$!

cleanup() {
  if kill -0 "$APP_PID" >/dev/null 2>&1; then
    kill "$APP_PID" >/dev/null 2>&1 || true
    wait "$APP_PID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

for _ in $(seq 1 40); do
  code="$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/login" || true)"
  if [[ "$code" == "200" ]]; then
    break
  fi
  sleep 1
done

check_200() {
  local path="$1"
  local code
  code="$(curl -s -o /dev/null -L -w "%{http_code}" "${BASE_URL}${path}")"
  if [[ "$code" != "200" ]]; then
    echo "FAIL: ${path} expected 200, got ${code}"
    echo "--- next start logs ---"
    tail -n 120 /tmp/oi-smoke-start.log || true
    exit 1
  fi
  echo "OK: ${path} -> ${code}"
}

check_200 "/login"
check_200 "/"
check_200 "/scan"

echo "Local smoke checks passed."
