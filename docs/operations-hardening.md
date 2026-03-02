# Operations Hardening Runbook

## 1) Backup and restore drill

### Prereqs
- `pg_dump`, `pg_restore`, `psql` installed locally.
- Primary DB URL in `SUPABASE_DB_URL`.
- Separate non-production restore target in `SUPABASE_RESTORE_DB_URL`.

### Create backup
```bash
cd /Users/shop/inspections-app
export SUPABASE_DB_URL='postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require'
./scripts/backup-supabase.sh
```

### Run restore drill (monthly)
```bash
cd /Users/shop/inspections-app
export SUPABASE_RESTORE_DB_URL='postgresql://postgres:<password>@db.<restore-ref>.supabase.co:5432/postgres?sslmode=require'
./scripts/restore-drill-supabase.sh ./backups/schema_YYYYMMDD_HHMMSS.sql ./backups/data_YYYYMMDD_HHMMSS.dump
```

### Post-restore verification checklist
- Validate key table counts (`profiles`, `vehicles`, `equipment`, `inspections`, `maintenance_requests`).
- Open app against restore target and confirm login/list views.
- Record drill date, backup timestamp, and verifier in an internal log.

## 2) Monitoring and alerting

### Health endpoint
- Endpoint: `/api/health`
- Expected: HTTP `200` with JSON `{ ok: true, ... }`.

### Suggested monitors
- Vercel monitor for `/api/health` every 5 minutes.
- Vercel alerts on serverless function error spikes.
- Supabase project alerting for auth/database incidents.

### Daily operational checks
- Verify cron results in `/api/trend-actions/digest/runs`.
- Verify notification inbox delivery for trend/accountability events.

## 3) App Store readiness checklist

- Privacy policy URL set and reachable.
- Terms of use URL set and reachable.
- iOS permission copy reviewed:
  - Camera usage description.
  - Photo library usage description (for uploads).
- App icon and launch assets validated on iPhone + iPad form factors.
- Build metadata updated in Xcode (`Version`, `Build`).

## 4) Security notes

- API write endpoints now include server-side rate limiting.
- Continue using strict API auth helper (`getCurrentUserProfileStrict`) only.
- Keep service-role usage limited to server routes/functions.
