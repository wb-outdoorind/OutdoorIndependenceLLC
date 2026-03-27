# Outdoor Independence App Working Brief

Last updated: 2026-03-27

## Purpose

This app started as an internal operations app for Outdoor Independence LLC.
It is evolving into a broader field-service operating system for:

- landscaping
- maintenance
- fertilizing
- snow removal

The app is being built for internal operational use first, with future SaaS
productization considered later.

## Core Workflow Direction

The long-term business flow is:

`Client -> Property -> Estimate -> Job -> Schedule -> Invoice`

That sequence is intentional and should drive architecture decisions.
We do not skip ahead in the workflow just because later modules are tempting.

## Current Build Order

The approved build order is:

1. CRM Clients
2. CRM Properties
3. CRM persistence stabilization
4. Estimate Entry Shell
5. Jobs backbone
6. Scheduling
7. Invoicing / Payments
8. QuickBooks integration
9. Broader SaaS / multi-tenant architecture

## What Is Already Built

### CRM UI

The CRM module already includes:

- clients list
- client detail page
- property detail page
- client create/edit modal
- property create/edit modal
- search / filters / quick actions
- polished dark UI
- shared provider for CRM state

### CRM Persistence

Supabase persistence has already been introduced for CRM:

- `crm_clients`
- `crm_properties`
- client/property relationship via foreign key
- optimistic UI updates with rollback behavior
- fallback to seeded mock data if a true load failure occurs

Important property metadata must continue to be preserved during edits:

- `routeGroup`
- `snowPriority`
- `fertilizingPreferences`
- `maintenanceContractLink`
- `latitude`
- `longitude`
- `serviceTemplates`

## Current Priority

The immediate priority is:

**Make CRM persistence unquestionably stable before any new module work begins.**

That means:

- CRM client create/edit/delete must survive refresh
- CRM property create/edit/delete must survive refresh
- list counts, previews, and detail pages must stay aligned
- direct route loads must work cleanly
- fallback must not hide real errors

Only after CRM persistence is confirmed stable should the project move to:

**Estimate Entry Shell connected to Client + Property**

## What We Are Not Building Yet

Do not start these yet:

- Estimate engine beyond the initial shell
- Jobs system
- Scheduling / dispatch board
- Invoicing / payments
- QuickBooks integration
- Multi-tenant architecture
- Customer portal
- Fertilizing refactor / migration
- Unrelated broad cleanup

## Product Principles

This should remain:

- an operational tool, not a sales CRM
- fast, simple, and intuitive like Jobber
- capable of LMN-style depth later, but not overloaded now
- dark, calm, and readable
- built around real outdoor service operations
- optimized for low friction and field-service clarity

## Execution Rules

Work should follow these rules:

1. Build in small, reviewable slices.
2. Preserve current UX whenever possible.
3. Do not refactor unrelated modules.
4. Prefer stable, explicit Supabase patterns over hidden magic.
5. Keep optimistic UI behavior where it improves usability.
6. Do not bypass the approved module order.

## Source Of Truth

If older notes or transcript summaries conflict, use this brief as the
working source of truth for:

- product direction
- build order
- current priorities
- non-goals
- execution style

## Immediate Next Approved Feature

After CRM persistence is stable:

**Build Estimate Entry Shell connected to Client + Property**

That shell should start with:

- route + shell
- visual layout first
- client/property connection
- no full estimating engine yet
