# Multi-role users — design

## Goal

Let an ADMIN assign several roles to one user (e.g. MINISTER + BURSAR, MINISTER + FINANCE) at
user creation or edit time. Today `users.role` is a single enum, so a bursar can never appear in
the ministers list or be assigned to a ministry.

## Agreed scope

- Only ADMINs can set roles, in the create and edit user dialogs (page already requires
  `MANAGE_USERS`; server actions re-check).
- Assignable roles: `BURSAR`, `FINANCE`, `MINISTER`. Any non-empty combination.
- `ADMIN` and `DELEGATE` stay single-role and are not offered in the multi-select. DELEGATE is
  still created by the ministries flow.
- Effective permissions = union of the permissions of each of the user's roles.
- Every "is this user a minister?" check must work when MINISTER is one of several roles.
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
- Rewrite every live policy that uses `get_my_role()` (~100 expressions: mostly
  `IN ('ADMIN','BURSAR')`, plus `= 'ADMIN'`, `IN ('ADMIN','FINANCE')`,
  `= 'MINISTER' AND submitted_by/requested_by = auth.uid()`, `IN ('MINISTER','DELEGATE')`) with
  explicit `DROP POLICY` / `CREATE POLICY`, not a regexp over `pg_policies`.
  First plan step: enumerate live policies and functions from the local DB (25 migrations touch
  them; history is not the source of truth).
- `create_user_with_role` gets a `p_roles user_role[]` signature.
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
- `loadIdentity` / `getCurrentUser()` fetches `roles` and loads permissions via
  `getPermissionsForRoles(roles)` (single `IN` query) into the existing `Set<string>`. `can()`
  and `rbac.ts` are unchanged; Settings → Permisos still edits per role.
- Validators (`lib/validators/user.ts`): `roles: z.array(z.enum(ASSIGNABLE_ROLES)).min(1,
  "Selecciona al menos un rol")`, deduplicated, for create and update. The service rejects role
  edits on ADMIN and DELEGATE users.
- Users service/actions write `roles`, pass `p_roles`, same ADMIN gate. Audit
  `old_value`/`new_value` record `roles` as an array; audit-diff label becomes "Roles".
- Impersonation, hard delete and other `user.role !== ADMIN` checks use `hasRole`.
- Ministries page, ministry detail client and ministries service filter ministers with
  `hasRole(u, MINISTER)` (fixes the original bursar-as-minister problem).
- `(dashboard)/layout.tsx` does not redirect; it looks up the ministry assignment for
  MINISTER/DELEGATE users to set `ministryId` (drives the sidebar "my ministry" link). The
  lookup now runs when the user has MINISTER or DELEGATE among their roles, and `roles` is
  passed to the sidebar.

## 3. UI

- Users manager create/edit dialogs: multi-select (checkbox/toggle chips, existing Base UI
  patterns) of BURSAR, FINANCE, MINISTER; at least one required with inline Spanish message.
  `inviteMinister` preselects `[MINISTER]`, otherwise default `[BURSAR]`.
- Editing an ADMIN or DELEGATE user shows a read-only role badge and a note that it cannot be
  combined.
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
