# Multi-role users — design

## Goal

Let an ADMIN assign several roles to one user (e.g. MINISTER + BURSAR, MINISTER + FINANCE) at
user creation or edit time. Today `users.role` is a single enum, so a bursar can never appear in
the ministers list or be assigned to a ministry.

## Agreed scope

- Only ADMINs can set roles, in the create and edit user dialogs (page already requires
  `MANAGE_USERS`; server actions re-check).
- Combinable roles: `BURSAR`, `FINANCE`, `MINISTER`. Any non-empty combination.
- `ADMIN` and `DELEGATE` stay single-role (never combined with another role). ADMIN is still
  selectable in the create/edit dialogs as an exclusive choice (checking it clears the others),
  so admins can still be created and promoted exactly as today. DELEGATE is created only by the
  ministries flow and is read-only in the users dialogs.
- Effective permissions = union of the permissions of each of the user's roles.
- Every "is this user a minister?" check must work when MINISTER is one of several roles.
- Ministries become ADMIN-only: BURSAR loses the full ministries list and the ability to manage
  ministries/assignments. A user who also has MINISTER sees only their own ministry, as a
  minister. Budgets move to their own page so bursars keep them (section 5).
- Out of scope: primary-role concept, per-user permission overrides, role-change notifications,
  self-service role requests.

## Approach

`users.roles user_role[]` replaces `users.role` (no second source of truth). Rejected: a
`user_roles` join table (extra joins everywhere for a four-role, small-user-base system) and
`role` + `extra_roles[]` (two sources of truth).

## 1. Database and migration

- Add `users.roles user_role[] NOT NULL`, backfilled with `ARRAY[role]`, then drop `role`.
  Default `ARRAY['FINANCE']`.
- CHECK constraint: `cardinality(roles) >= 1`; if `ADMIN` or `DELEGATE` is present, exactly one
  element; no duplicates.
- New `has_any_role(text[])` helper (SECURITY DEFINER, STABLE, same grants as `get_my_role()`).
  Drop `get_my_role()` so any missed policy fails loudly.
- Rewrite every live policy that uses `get_my_role()` (44 policies in the local DB) with
  explicit `DROP POLICY` / `CREATE POLICY` statements. The statements are generated once from the
  live `pg_policies` definitions by a throwaway script, reviewed, and committed as static SQL;
  there is no runtime regexp over `pg_policies` inside the migration.
- `create_user_with_role` is dropped (nothing in the app calls it; users are created by
  `usersService.invite`). `create_initial_admin` is recreated to insert `roles = ['ADMIN']`.
- The no-duplicates rule needs a subquery, which CHECK constraints can't hold, so the constraint
  calls an IMMUTABLE `users_roles_valid(user_role[])` function.
- Created with `pnpm supabase migration new`, applied with `migration up` (never `db reset`),
  single transaction. Regenerate types with `pnpm types:generate`.
- Behavior for a two-role user is the union of access. Draft-intentions owner-only rule applies
  to the minister side (own drafts); bursar visibility is unchanged.

## 2. Server, types, permissions

- `UserContext` and related types: `role: UserRole` → `roles: UserRole[]` (user list row,
  impersonation `realUser`, sidebar and nav-user props).
- `lib/constants/roles.ts`: add `hasRole(user, role)`, `hasAnyRole(user, roles)`,
  `rolesLabel(roles)` ("Tesorero · Ministro"), and `ASSIGNABLE_ROLES = [BURSAR, FINANCE,
  MINISTER]`. `hasRole`/`hasAnyRole` are the only way TS code asks about roles.
- `loadIdentity` fetches `roles` and unions the permissions of each role into the existing
  `Set<string>` (the per-role `unstable_cache` lookup is kept; roles are fetched in parallel).
  `can()` is unchanged; Settings → Permisos still edits per role. The cache key is bumped
  (`role-permissions-v2`) so removing `MANAGE_MINISTRIES` from BURSAR takes effect on deploy
  instead of after the 24 h cache TTL.
- Validators (`lib/validators/user.ts`): `roles` is a non-empty, duplicate-free array;
  ADMIN/DELEGATE can't be combined with anything. Create accepts ADMIN, BURSAR, FINANCE,
  MINISTER; update accepts any role and the service refuses to change a DELEGATE user's roles or
  to make anyone a DELEGATE.
- Users service/actions write `roles`, same ADMIN gate. Audit
  `old_value`/`new_value` record `roles` as an array; audit-diff label becomes "Roles".
- Impersonation, hard delete and other `user.role !== ADMIN` checks use `hasRole`.
- Ministries page, ministry detail client and ministries service filter ministers with
  `hasRole(u, MINISTER)` (fixes the original bursar-as-minister problem).
- `(dashboard)/layout.tsx` does not redirect; it looks up the ministry assignment for
  MINISTER/DELEGATE users to set `ministryId` (drives the sidebar "my ministry" link). The
  lookup now runs when the user has MINISTER or DELEGATE among their roles, and `roles` is
  passed to the sidebar.

## 3. UI

- Users manager create/edit dialogs: multi-select (checkboxes, same plain-`<input>` pattern the
  dialog already uses) of ADMIN (exclusive), BURSAR, FINANCE, MINISTER; at least one required with inline Spanish message.
  `inviteMinister` preselects `[MINISTER]`, otherwise default `[BURSAR]`.
- ADMIN is offered as an exclusive option: checking it clears the other roles, checking another
  role clears it. Editing a DELEGATE user shows a read-only role badge.
- List rows: one badge per role (`ROLE_BADGE_VARIANT`). Grouped view uses
  `u.roles.includes(role)`, so a multi-role user appears under each of their groups.
- Sidebar filters with `user.roles.some((r) => l.roles.includes(r))`; memo depends on
  `user.roles`.
- Profile page, nav-user and impersonation banner use `rolesLabel(roles)`. Audit viewer shows
  roles as "Tesorero, Ministro".

## 4. Tests

- Unit: `hasRole`/`hasAnyRole`, `rolesLabel`, Zod schemas (empty, duplicates, ADMIN/DELEGATE
  rejected), users service create/update with several roles and rejection of edits on
  ADMIN/DELEGATE, `getPermissionsForRoles` union, impersonation target checks.
- RLS integration (`services/__integration__/rls.test.ts`): `{BURSAR, MINISTER}` can do bursar
  actions and minister own-draft actions; `{FINANCE, MINISTER}` reads finance data but cannot
  review intentions; CHECK constraint rejects `{ADMIN, BURSAR}` and an empty array.
- E2E (local only, not a CI gate): extend the user-management spec for the multi-select.

## 5. Ministries become ADMIN-only; budgets get their own page

Ministries (ADMIN-only):
- Data migration removes `MANAGE_MINISTRIES` from BURSAR in `role_permissions`; ADMIN keeps it.
- `ministries` insert/update and `ministry_assignments` insert/update/delete policies go from
  `ADMIN, BURSAR` to `ADMIN` (part of the section 1 policy rewrite).
- `/ministries` drops the budgets tab/tabs wrapper and renders only the ministries list.
- Sidebar "Ministerios" is `roles: ["ADMIN"]`.
- Minister picker uses `hasRole(MINISTER)`, so an admin can assign a bursar+minister.

Budgets (new `/budgets` page):
- Gated by `MANAGE_BUDGETS`; reuses `MinistryBudgetAdmin` and the existing
  `ministryBudgetService` calls. Budget RLS and `app/actions/ministry-budgets.ts` are unchanged.
- Sidebar "Presupuesto" link with `roles: ["ADMIN", "BURSAR"]`. FINANCE (can read summaries in
  RLS, no `MANAGE_BUDGETS`) gets no page (YAGNI).

Bursar+minister sees: full bursar access to requests, payroll and budgets, no ministries list,
plus "Mi ministerio" for their own assigned ministry, where they create requests and settle
expenses as a minister (section 6). Verified: the `ministries/[id]` page already gates on own
assignment when the user lacks `MANAGE_MINISTRIES`, so no guard change is needed there.

Tests: RLS — BURSAR-only and `{BURSAR, MINISTER}` users cannot insert/update `ministries` or
`ministry_assignments`. Unit/e2e — sidebar shows Ministerios only to ADMIN and Presupuesto to
ADMIN and BURSAR; `/ministries` redirects a bursar.

## 6. Workflow scoping for users who both review and request

Several workflow pages/APIs use `can(CREATE_REQUEST)` / `isMinisterWorkflowUser` to mean "this
user is a minister, scope them to their own ministry". With the permission union, a
bursar+minister would silently lose the bursar's full request list and review view.

Rule: **a user keeps the full workflow view unless every one of their roles is MINISTER or
DELEGATE (and they cannot `REVIEW_INTENTIONS`).** A FINANCE+MINISTER keeps FINANCE's read-only
org-wide view and gets minister access to their own ministry via "Mi ministerio". A bursar+minister creates requests and settles
expenses for their own ministry from "Mi ministerio" (`/ministries/[id]`).

- New helper `isOwnMinistryScoped(user)` in `lib/permissions/rbac.ts`:
  `isMinisterWorkflowUser(permissions) && !can(permissions, REVIEW_INTENTIONS)` and every role in
  `user.roles` is MINISTER or DELEGATE (role names are a deliberate exception to `can()`, since
  permissions alone cannot distinguish FINANCE from MINISTER).
- `/requests` page, `GET /api/requests`: minister mode only when
  `can(CREATE_REQUEST) && isOwnMinistryScoped(user)`.
- `/requests/[id]` page: the own-ministry redirect uses `isOwnMinistryScoped`.
- `GET /api/notifications`: minister-side items (approved intentions, own draft/returned
  settlements) and reviewer-side counts are both returned when the user has both sides.
- Side effect (intended): ADMIN holds `CREATE_REQUEST` and `REVIEW_INTENTIONS`, so ADMIN now gets
  the full reviewer view on `/requests` instead of an own-ministry view that was always empty.
- Not addressed (YAGNI, flagged for the owner): nothing stops a bursar+minister from reviewing
  their own ministry's request.
