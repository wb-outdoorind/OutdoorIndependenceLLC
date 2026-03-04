#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ "${1:-}" == "" ]]; then
  echo "Usage: npm run push:checked -- \"commit message\" [--with-ios-sync] [--with-db-push]"
  exit 1
fi

COMMIT_MESSAGE="$1"
shift || true

WITH_IOS_SYNC="0"
WITH_DB_PUSH="0"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --with-ios-sync)
      WITH_IOS_SYNC="1"
      shift
      ;;
    --with-db-push)
      WITH_DB_PUSH="1"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: npm run push:checked -- \"commit message\" [--with-ios-sync] [--with-db-push]"
      exit 1
      ;;
  esac
done

echo "==> Running release checks (lint + build)"
npm run release:check

if [[ "$WITH_DB_PUSH" == "1" ]]; then
  echo "==> Pushing Supabase migrations to linked project"
  npx supabase db push --linked
fi

if [[ "$WITH_IOS_SYNC" == "1" ]]; then
  echo "==> Syncing Capacitor iOS project"
  npm run mobile:sync -- ios
fi

echo "==> Staging changes"
git add -A

if git diff --cached --quiet; then
  echo "No staged changes detected after checks. Nothing to commit."
  exit 0
fi

echo "==> Committing"
git commit -m "$COMMIT_MESSAGE"

echo "==> Pushing to origin/main"
git push origin main

echo "Done."
