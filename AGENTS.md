# AGENTS.md — inspections-app rules

## Project Overview
This is a Next.js App Router project using Supabase for auth and data.

- App Router (not Pages Router)
- Route groups like (app) are used
- Supabase auth via @supabase/ssr on server
- Supabase client via @supabase/supabase-js on client

## Core Rules

1. Prefer minimal diffs.
   - Do NOT refactor unrelated files.
   - Do NOT rename folders unless explicitly required.

2. Never modify environment variable names.
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_ANON_KEY
   - SUPABASE_SERVICE_ROLE_KEY

3. Never commit secrets.
   - .env.local must remain ignored.

4. When fixing routes:
   - Ensure folder param names match usage (case-sensitive).
   - Verify route works and does not 404.

5. Before finishing ANY task:
   - Run `npm run lint`
   - Run `npm run build`
   - Fix any errors before completing.

6. When adding database features:
   - Provide SQL migration
   - Provide RLS policies
   - Keep UI changes minimal
   - Verify persistence after refresh

7. Do not remove role-based access control logic.

## Definition of Done
A task is complete only if:
- App builds successfully
- No TypeScript errors
- Route loads correctly
- Data persists if DB-related

