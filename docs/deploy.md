# Deployment Runbook

This is the single checklist for shipping updates to:
- Web (Vercel)
- iOS app shell (Capacitor/Xcode)

## 1) Pre-Deploy Checks (always)

From repo root:

```bash
cd /Users/shop/inspections-app
npm run check:api-auth
npm run check:route-access
npm run check:authz
npm run lint
npm run build
npm run smoke:health
```

If any command fails, fix before deploying.

## 2) Push Code to GitHub

```bash
cd /Users/shop/inspections-app
git add -A
git commit -m "your release message"
git push origin main
```

One-command alternative (runs lint+build first):

```bash
cd /Users/shop/inspections-app
npm run push:checked -- "your release message"
```

Optional flags:

```bash
# include Supabase migration push
npm run push:checked -- "your release message" --with-db-push

# include iOS Capacitor sync before commit
npm run push:checked -- "your release message" --with-ios-sync

# include both
npm run push:checked -- "your release message" --with-db-push --with-ios-sync
```

## 3) Web Deploy (Vercel)

Normal path:
- Vercel auto-deploys from `main` when Git integration is connected.

If you need to verify quickly:

```bash
curl -I https://outdoor-independence-llc-app.vercel.app/
```

Expected:
- HTTP 200 for main pages after deploy settles.

## 4) Required Env Vars (Vercel)

Project settings must contain:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (for cron-protected endpoints)

Optional but recommended for production-stable API rate limits (shared across instances):
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## 5) Database Migrations (when schema changed)

If you added a migration under `supabase/migrations`:

```bash
cd /Users/shop/inspections-app
npx supabase db push --linked
```

## 6) Cron Endpoints Quick Check

Digest endpoint:

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://outdoor-independence-llc-app.vercel.app/api/trend-actions/digest"
```

Reminder endpoint:

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://outdoor-independence-llc-app.vercel.app/api/accountability/reminders"
```

SLA alert scan endpoint:

```bash
curl -i \
  -H "Authorization: Bearer $CRON_SECRET" \
  "https://outdoor-independence-llc-app.vercel.app/api/sla-alerts"
```

## 7) iOS Sync (when web/app UI changed)

Sync Capacitor project:

```bash
cd /Users/shop/inspections-app
npx cap sync ios
```

Open Xcode project:

```bash
npx cap open ios
```

In Xcode:
- Select `App` target
- Product > Clean Build Folder (optional)
- Build and run on device

## 8) TestFlight / App Store Release (when shipping a new mobile version)

In Xcode:
1. Increase version/build number.
2. Product > Archive.
3. Distribute App > App Store Connect > Upload.

In App Store Connect:
1. Wait for processing.
2. Add release notes.
3. Submit for TestFlight or App Review.

### iOS Release Readiness Checklist

Before archiving, confirm:
1. `npm run release:check` passes locally.
2. `npx cap sync ios` completed after latest web changes.
3. App icon and launch assets are present in Xcode `Assets.xcassets`.
4. Signing team + bundle identifier are set under `App` target.
5. Device smoke run passes (login, home, scan QR, notifications).

Real-time update rule:
- Web/UI/data changes ship instantly to web and are reflected inside the app webview.
- Native-capability changes (camera plugin config, iOS entitlements, plist/capacitor native changes) require a new iOS build/TestFlight submission.

## 9) Post-Deploy Smoke Test

Minimum checks:
- Login works
- Home loads
- `/vehicles`, `/equipment`, `/maintenance` load
- Notifications load (`/notifications`)
- One pre/post trip form can be submitted
- Role view works (owner/ops manager)

Quick command (defaults to production URL):

```bash
npm run smoke:web
```

Optional browser test suite (requires Playwright browsers installed):

```bash
npx playwright install --with-deps chromium
npm run test:e2e
```

Custom URL example:

```bash
BASE_URL=https://outdoor-independence-llc-app.vercel.app npm run smoke:web
```

## 10) Rollback Strategy

If production breaks:
1. Revert offending commit locally.
2. Push revert commit to `main`.
3. Confirm Vercel redeploy completes.
4. Re-run smoke test.

## 11) Required CI Status Checks

In GitHub branch protection for `main`, require the `CI / validate` check to pass before merge.

Recommended branch protection settings:
- Require a pull request before merging
- Require status checks to pass before merging
- Select required check: `CI / validate`
- Restrict direct pushes to `main`

## 12) Data Safety Operations

Create encrypted backups:

```bash
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'
npm run backup:supabase
```

Run restore drill on a non-production database:

```bash
export SUPABASE_RESTORE_DB_URL='postgresql://postgres:<password>@db.<restore-ref>.supabase.co:5432/postgres?sslmode=require'
npm run restore:drill -- ./backups/schema_YYYYMMDD_HHMMSS.sql ./backups/data_YYYYMMDD_HHMMSS.dump
```

Reference: `docs/operations-hardening.md`.
