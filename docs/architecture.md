# System Architecture

See also the interactive diagram: [`docs/diagrams/00-architecture.html`](diagrams/00-architecture.html)
(open locally in a browser — GitHub doesn't render standalone HTML inline).

## Overview

Next.js 16 App Router application backed by Supabase (PostgreSQL + Auth).
All business logic lives in the service layer — API routes and Server Components
never call Supabase directly.

## Layer separation

```
app/            → Route handlers and page components
components/     → UI (components/ui/) and domain components
services/       → All business logic
lib/supabase/   → Supabase client helpers
lib/permissions/→ RBAC role checks
lib/validators/ → Zod schemas shared between API routes and forms
types/          → Shared TypeScript types (database.types.ts is auto-generated)
```

## Route groups

| Group         | Path                                                                                                    | Description                                          |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| public        | `/`, `/forgot-password`, `/activate`, `/auth/callback`                                                     | Login, password recovery, account activation           |
| `(dashboard)` | `/dashboard`, `/movements`, `/ministries`, `/requests`, `/payroll`, `/users`, `/audit`, `/settings/*`, `/profile`, `/voucher-book` | Protected app pages, gated by `proxy.ts` + per-page permission checks |

Route protection is handled by `proxy.ts` (Next.js 16's middleware convention): it reads the
Supabase session and redirects unauthenticated requests away from anything not in its
`PUBLIC_PATHS` list back to `/`. Per-permission gating (e.g. only `MANAGE_PAYROLL` can reach
`/payroll`) happens inside each page/route, via `can(user.permissions, PERMISSIONS.X)` — the
middleware only enforces "logged in or not," not fine-grained authorization.

## Data flow — mutations

```
API route or server action
  → validate session (Supabase server client)
  → validate body (Zod schema from lib/validators/)
  → call service
      → service uses Supabase server client
      → service calls auditService (audit log)
  → (movements) call processMovementIntegrations
      → Email notification via Resend
```

## Authentication

Supabase Auth with email/password (`signInWithPassword`), invoked client-side from
`components/auth/login-form.tsx`. No public sign-up — accounts are created by an ADMIN through
the Users page. Session is read server-side via `createServerClient()` from
`lib/supabase/server.ts`; `proxy.ts` refreshes/validates it on every request.

Password recovery is a separate "forgot password" flow (`/forgot-password` →
`/api/auth/forgot-password` → Resend email → `/activate`) that deliberately never reveals whether
an email exists (always returns `{ ok: true }`). See
[`docs/diagrams/07-login-and-impersonation.md`](diagrams/07-login-and-impersonation.md) and
[`docs/diagrams/04-password-recovery.md`](diagrams/04-password-recovery.md) for
the full login and recovery diagrams (in Spanish).

An ADMIN can also **impersonate** another (non-ADMIN, active) user for up to 30 minutes to
reproduce issues without their password — see [roles.md](roles.md#impersonation-suplantación-de-usuarios)
and `services/impersonation/impersonation.service.ts`.

## Authorization (RBAC)

Four roles enforced in `lib/permissions/rbac.ts`, via a **configurable** permission matrix
(`role_permissions` table, editable by ADMIN at `/settings/permissions`) rather than a fixed
mapping in code:

| Role       | Spanish label | Description                                                                |
| ---------- | ------------- | ----------------------------------------------------------------------------- |
| `ADMIN`    | Administrador | Full access — user management, configuration, all operations. Permissions are immutable from the UI. |
| `BURSAR`   | Tesorero      | Create/edit/cancel movements; review and approve fund requests and settlements. |
| `FINANCE`  | Finanzas      | Read-only — views movements and the requests workflow, no create/edit/approve. |
| `MINISTER` | Ministro      | Submits fund requests for their ministry and settles them with proof.          |

Business logic never compares role strings directly — it always calls
`can(user.permissions, PERMISSIONS.X)`. See [roles.md](roles.md) for the full permission catalog,
matrix, and caching model. Role is stored in `users.role`; RLS (Row Level Security) is enabled on
all tables as a second enforcement layer beneath the application-level permission checks.

## Supabase clients

| File                     | Client type                       | Used in                        |
| ------------------------ | --------------------------------- | ------------------------------ |
| `lib/supabase/server.ts` | SSR client (reads/writes cookies) | API routes, Server Components  |
| `lib/supabase/client.ts` | Browser client                    | Client Components              |
| `lib/supabase/admin.ts`  | Service role (bypasses RLS)       | User management, audit inserts |

## User creation

An ADMIN invites a user from the Users page. The invite path uses
`admin.auth.admin.generateLink({ type: "invite" })` (service-role client) rather than a
password — the invited user sets their own password on activation. See
[roles.md](roles.md#creating-users) and
[`docs/diagrams/02-account-creation.md`](diagrams/02-account-creation.md) for the full flow.

`create_user_with_role(email, password, full_name, role)` is an older RPC kept only for backward
compatibility — the app no longer calls it.

Bootstrap: call `create_initial_admin(email, password, full_name)` once from Supabase Studio SQL
editor to create the first `ADMIN` account (fails if any user already exists).

## Email

All transactional email is sent via **Resend** (`resend.com`).
No Gmail or SMTP credentials are stored in the application.

Services:

- `services/email/resend.service.ts` — movement notifications and auth emails (invite, reset)
- `services/email/workflow-emails.service.ts` — fund request workflow emails

See [email.md](email.md) for configuration and template details.

## Movement post-processing

`services/google/movement-postprocess.ts` runs after a movement is created/edited. The earlier
Google Apps Script pipeline (PDF generation + Google Drive storage, Google Sheets sync) has been
removed entirely — it now only sends an email notification via Resend (`sendMovementEmail`).
Integration state is tracked on `movements` via `notification_status` / `notification_error`.

## Database schema

Migrations live in `supabase/migrations/`. Key tables:

| Table                            | Description                                                             |
| ---------------------------------- | ---------------------------------------------------------------------- |
| `users`                           | App users, with `role` and `status` (`ACTIVE`/`INACTIVE`/`PENDING_ACTIVATION`/`PENDING_RESET`) |
| `role_permissions`                | Configurable permission grants per role (`role`, `permission`, `enabled`) |
| `impersonation_sessions`          | ADMIN-as-user sessions — start/expiry/end reason                       |
| `movements`                       | Income/expense records                                                  |
| `movement_audit_log`              | Audit trail for every movement change                                  |
| `system_audit_log`                | System-wide audit events (invites, payroll registration, etc.)         |
| `ministries`                      | Church ministries                                                      |
| `ministry_assignments`            | Links a `MINISTER` user to the ministry they manage                    |
| `budget_intentions`               | Fund requests ("intentions") submitted by ministries                   |
| `intention_transfers`             | Registered transfers against an approved intention                     |
| `expense_settlements`             | Settlements (rendiciones) with proof, against an intention             |
| `request_comments`                | Comments on a request/settlement (review feedback, corrections)        |
| `payroll_records` / `payroll_movements` | Monthly pastor payroll (remuneraciones), one record with N linked movements |
| `severance_reserve_adjustments`   | Append-only ledger for the severance reserve balance                    |
| `movement_categories` / `movement_subcategories` | Movement category catalog                              |
| `app_settings`                    | Key/value system settings                                              |

Note: `budgets`/`budget_periods`/`ministry_budgets` (per-ministry budget allocation) were removed
— see `supabase/migrations/20260709022754_remove_budget_feature.sql` and CLAUDE.md; budgets are
tracked outside the platform for now.

Always use `pnpm supabase migration new <name>` to create migrations.
Always run `pnpm types:generate` after schema changes.
