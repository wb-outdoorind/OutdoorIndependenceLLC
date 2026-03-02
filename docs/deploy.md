# Deployment Runbook

This is the single checklist for shipping updates to:
- Web (Vercel)
- iOS app shell (Capacitor/Xcode)

## 1) Pre-Deploy Checks (always)

From repo root:

```bash
cd /Users/shop/inspections-app
npm run check:api-auth
npm run lint
npm run build
```

If any command fails, fix before deploying.

## 2) Push Code to GitHub

```bash
cd /Users/shop/inspections-app
git add -A
git commit -m "your release message"
git push origin main
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
- `DIGEST_CRON_SECRET` (for digest endpoint auth)

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
  -H "Authorization: Bearer $DIGEST_CRON_SECRET" \
  "https://outdoor-independence-llc-app.vercel.app/api/trend-actions/digest"
```

Reminder endpoint:

```bash
curl -i \
  -H "Authorization: Bearer $DIGEST_CRON_SECRET" \
  "https://outdoor-independence-llc-app.vercel.app/api/accountability/reminders"
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

## 9) Post-Deploy Smoke Test

Minimum checks:
- Login works
- Home loads
- `/vehicles`, `/equipment`, `/maintenance` load
- Notifications load (`/notifications`)
- One pre/post trip form can be submitted
- Role view works (owner/ops manager)

## 10) Rollback Strategy

If production breaks:
1. Revert offending commit locally.
2. Push revert commit to `main`.
3. Confirm Vercel redeploy completes.
4. Re-run smoke test.
