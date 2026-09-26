# Roles and Permissions

The system has **four roles**. Authorization is **permission-based, not role-name-based**:
business logic always checks `can(user.permissions, PERMISSIONS.X)` from
`lib/permissions/rbac.ts` — it never compares `user.role === "ADMIN"` directly (the sidebar,
`components/dashboard/app-sidebar.tsx`, is the one deliberate exception, since it only controls
navigation visibility, not access).

Permissions are stored per-role in the `role_permissions` table and are **configurable by an
ADMIN at runtime** from **Settings → Permisos** (`/settings/permissions`) — this is not a
recompile-to-change matrix like a typical hardcoded RBAC table.

## Role overview

| Role       | Spanish label | Description                                                                 |
| ---------- | ------------- | ---------------------------------------------------------------------------- |
| `ADMIN`    | Administrador | Full access — user management, configuration, all operations. Cannot be restricted from the UI. |
| `BURSAR`   | Tesorero      | Registers/edits/cancels movements; reviews and approves fund requests and settlements. |
| `FINANCE`  | Finanzas      | Read-only financial oversight — views movements and the requests workflow, cannot create or approve anything. |
| `MINISTER` | Ministro      | Submits fund requests for their ministry and settles expenses with proof.   |

These descriptions match what ADMIN sees when creating/editing a user in `components/users/users-manager.tsx`.

## Permission catalog

All permissions live in `PERMISSIONS` (`lib/permissions/rbac.ts`):

| Permission           | Meaning                                                              |
| --------------------- | --------------------------------------------------------------------- |
| `MANAGE_USERS`        | Invite, edit, deactivate users; change roles                        |
| `CREATE_MOVEMENT`     | Create, edit, and cancel movements                                   |
| `VIEW_MOVEMENT`       | View the movements list and detail pages                             |
| `VIEW_DASHBOARD`      | View the general dashboard (org-wide KPIs, balances)                 |
| `MANAGE_MINISTRIES`   | Create/edit ministries and their minister assignments                |
| `MANAGE_CATEGORIES`   | Manage movement categories/subcategories                             |
| `REVIEW_INTENTIONS`   | Approve/reject fund requests, register the transfer, review settlements |
| `CREATE_REQUEST`      | Submit a fund request (intention) for a ministry                     |
| `CREATE_SETTLEMENT`   | Submit/resubmit a settlement with proof of expense                   |
| `MANAGE_PAYROLL`      | Register monthly payroll (remuneraciones) and adjust the severance reserve |
| `MANAGE_SETTINGS`     | Change system settings, including the permission matrix itself       |
| `VIEW_WORKFLOW`       | Derived helper — see below, not independently meaningful in the UI matrix |

Two permissions deliberately **don't** appear as toggles on the `/settings/permissions` page
(`components/configuration/permissions-matrix.tsx`), even though they're valid `role_permissions`
rows an ADMIN could seed via a migration:

- `MANAGE_CATEGORIES` and `MANAGE_PAYROLL` — narrow, ADMIN/BURSAR-oriented permissions not yet
  wired into the generic matrix UI.
- `VIEW_WORKFLOW` — not a real independent grant. Access to the requests workflow (`canAccessWorkflow()`
  in `rbac.ts`) is *derived* from having any of `CREATE_REQUEST`, `CREATE_SETTLEMENT`, or
  `REVIEW_INTENTIONS` — toggling `VIEW_WORKFLOW` alone in the UI would be misleading.

`isMinisterWorkflowUser()` similarly derives "this user only ever sees their own ministry's
requests" from having `CREATE_REQUEST` or `CREATE_SETTLEMENT` — there's no separate
`MINISTER`-only code path, just a permission check.

## Permission matrix

Seeded defaults, from `supabase/migrations/20260429151749_add_role_permissions_table.sql` and
later migrations (`20260715143757`, `20260716172924`, `20260717025126`,
`20260717030809`) — current state, editable by ADMIN at any time:

| Permission          | ADMIN | BURSAR | FINANCE | MINISTER |
| -------------------- | :---: | :----: | :-----: | :------: |
| `MANAGE_USERS`       |   ✓   |   —    |    —    |    —     |
| `CREATE_MOVEMENT`    |   ✓   |   ✓    |    —    |    —     |
| `VIEW_MOVEMENT`      |   ✓   |   ✓    |    ✓    |    —     |
| `VIEW_DASHBOARD`     |   ✓   |   ✓    |    ✓    |    —     |
| `MANAGE_MINISTRIES`  |   ✓   |   ✓    |    —    |    —     |
| `MANAGE_CATEGORIES`  |   ✓   |   ✓    |    —    |    —     |
| `REVIEW_INTENTIONS`  |   ✓   |   ✓    |    —    |    —     |
| `CREATE_REQUEST`     |   ✓   |   —    |    —    |    ✓     |
| `CREATE_SETTLEMENT`  |   ✓   |   —    |    —    |    ✓     |
| `MANAGE_PAYROLL`     |   ✓   |   —    |    —    |    —     |
| `MANAGE_SETTINGS`    |   ✓   |   —    |    —    |    —     |
| `VIEW_WORKFLOW`      |   ✓   |   ✓    |    ✓    |    ✓     |

ADMIN's row is hardcoded as always-on in the UI (`permissions-matrix.tsx` renders it as a
disabled checked box) — an ADMIN cannot lock themselves out. The other three rows are live
toggles; unchecking one takes effect on that role's *next* request (see caching below).

`role_permissions` also has an RLS policy allowing every authenticated user to `SELECT` (needed
to compute their own effective permission set) but only `ADMIN` (`get_my_role() = 'ADMIN'`) to
write.

## How permissions are resolved (and cached)

Every request calls `getCurrentUser()` (`lib/supabase/server.ts`), which:

1. Resolves the real authenticated identity from the Supabase session (`getRealUser()`).
2. Loads that user's row from `public.users` via the **service-role client** — not RLS-as-self,
   because step 3 below may need to load a *different* user's row during impersonation.
3. Looks up the role's enabled permissions via `getPermissionsForRole(role)`, wrapped in
   `unstable_cache` — **cached for 24 hours per role**, tagged `"role-permissions"`.
4. Builds a `Set<Permission>` attached to the user object; every `can()` check downstream is a
   plain `Set.has()`.

When an ADMIN toggles a permission (`updateRolePermission` server action,
`app/actions/permissions.ts`), it writes the `role_permissions` row and immediately calls
`revalidateRolePermissions()` (`revalidateTag("role-permissions")`) — so the 24 h cache is
invalidated instantly rather than actually waiting a day. See
[`docs/diagrams/06-roles-and-permissions.md`](diagrams/06-roles-and-permissions.md) for the full diagram
(in Spanish).

## User status lifecycle

`users.status` is one of `ACTIVE | INACTIVE | PENDING_ACTIVATION | PENDING_RESET`. Only
`ACTIVE` users can authenticate meaningfully — `getCurrentUser()`/`loadIdentity()` returns `null`
for any other status, which the proxy (`proxy.ts`) treats as unauthenticated.

- `PENDING_ACTIVATION` — set right after an ADMIN invites a new user; cleared to `ACTIVE` once
  they set their password via `/activate`.
- `PENDING_RESET` — set when a password-recovery link is generated; cleared to `ACTIVE` the same
  way.
- `INACTIVE` — an ADMIN deactivated the account; login attempts fail, and password recovery is a
  silent no-op (see [`docs/diagrams/07-login-and-impersonation.md`](diagrams/07-login-and-impersonation.md)).

## Creating users

Only users with `MANAGE_USERS` (currently ADMIN only) can create accounts. There is no public
sign-up.

Flow:

1. ADMIN opens **Usuarios** (`/users`) and invites a new user (name, email, role).
2. `admin.auth.admin.generateLink({ type: "invite" })` creates the `auth.users` row and an
   activation link; `public.users` gets a new row with `status: PENDING_ACTIVATION`.
3. Resend sends the invite email (2-day link) via `sendInviteEmail` (`emails/auth-email.tsx`).
4. The user clicks the link → `GET /api/auth/verify` validates the token and redirects to
   `/activate` → the user sets a password → `POST /api/auth/activate` flips `status` to `ACTIVE`.

Full diagram: [`docs/diagrams/02-account-creation.md`](diagrams/02-account-creation.md).

## Changing a role

ADMIN can change a user's role at any time from the Users page. The change takes effect on the
user's next request — the session token itself doesn't carry permissions; they're re-derived
server-side from `role_permissions` on every call (subject to the 24 h/tag-invalidated cache
above).

## MINISTER role specifics

`MINISTER` is a restricted role for ministry leaders:

- Access granted: `/requests` only — both submitting a fund request and settling an approved one
  happen from the same page and its `[id]` detail view (there is no separate settlements route).
- Access denied: `/movements`, `/ministries`, `/users`, `/settings`, `/payroll`, `/audit`.
- `isMinisterWorkflowUser()` scopes what they see: only their **own** ministry's requests —
  enforced both by RLS and by the requests service layer.
- Cannot see other ministries' requests.

## Impersonation ("Suplantación de usuarios")

An ADMIN can temporarily act as another user — useful for reproducing a bug reported by a
minister or bursar without needing their password. This is a session-scoped overlay, not a role
change: it never touches `users.role` or the auth session itself.

Key rules, enforced in `services/impersonation/impersonation.service.ts` and
`app/actions/impersonation.ts`:

- Only a **real** ADMIN can start one — checked against `getRealUser()`, which ignores any
  impersonation already in effect, so an impersonated identity can never chain into a second
  impersonation.
- The target must be `ACTIVE` and **cannot be another ADMIN**, and cannot be the impersonator's
  own account.
- Only **one active impersonation session per admin** at a time — starting a second one while
  one is already running is rejected.
- Sessions last **30 minutes** (`impersonation_sessions.expires_at`) and are tracked server-side,
  not just as a client cookie; the cookie (`impersonation_session`, httpOnly) only carries the
  session id.
- `MANAGE_USERS` is **deliberately blocked while impersonating** (`isImpersonating()` check in
  `rbac.ts`), even if the impersonated user's role would normally grant it — this closes off using
  impersonation to escalate into managing users/roles beyond the real admin's intent.
- If the impersonated user gets deactivated mid-session, `getCurrentUser()` detects it, force-ends
  the session (`ended_reason: "target_inactive"`), and falls back to the real admin's identity
  rather than erroring.
- Ending reasons: `manual` (admin clicked "stop"), `expired` (TTL passed), `target_inactive`,
  `forced` (reserved for future admin-side force-stop).

Every page render exposes both the effective (possibly impersonated) user and, when
impersonating, the `realUser` — used to show a "you are viewing as X" banner and to gate the
"stop impersonation" action.

Full diagram: [`docs/diagrams/07-login-and-impersonation.md`](diagrams/07-login-and-impersonation.md).

## Role source of truth

```
types/auth.ts                    → UserRole type
lib/permissions/rbac.ts          → PERMISSIONS catalog, can(), canAccessWorkflow(), isImpersonating()
lib/validators/user.ts           → Zod enums for create/update (role + status)
role_permissions (DB table)      → actual enabled/disabled grants, editable by ADMIN
```

## Adding a new role

1. Add the value to `UserRole` in `types/auth.ts`.
2. Add it to the Zod `role` enum in `lib/validators/user.ts`.
3. Seed its default permissions with a new migration
   (`pnpm supabase migration new seed_<role>_permissions`) inserting rows into `role_permissions`.
4. Add the `<option>` and role description `<Alert>` in `components/users/users-manager.tsx`.
5. Add `ROLE_LABEL` / `ROLE_DOT_CLASS` (and any badge color) entries in the same file.
6. If the role needs its own sidebar entries, add `roles: [...]` to the relevant links in
   `components/dashboard/app-sidebar.tsx`.
7. Update RLS policies in Supabase if the role needs row-level isolation (e.g. "only see your own
   ministry's rows", the way `MINISTER` is scoped today).
8. Regenerate types: `pnpm types:generate`.

## Adding a new permission

1. Add the key to `PERMISSIONS` in `lib/permissions/rbac.ts`.
2. Seed it for the roles that should have it by default, in a new migration.
3. Add a label in `PERMISSION_LABELS` in `components/configuration/permissions-matrix.tsx` if it
   should be an ADMIN-toggleable permission (skip this step for permissions that are meant to stay
   fixed, like `VIEW_WORKFLOW`).
4. Gate the relevant API route/server action/page with `can(user.permissions, PERMISSIONS.X)`.
