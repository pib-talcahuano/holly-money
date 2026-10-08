# Multi-role Users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an ADMIN give a user several roles (BURSAR / FINANCE / MINISTER, plus ADMIN as an exclusive choice), make ministries ADMIN-only, and keep a bursar+minister's full reviewer view.

**Architecture:** `users.roles user_role[]` replaces `users.role`. RLS policies move from `get_my_role()` to a `has_any_role(text[])` helper. Permissions for a user are the union of each role's `role_permissions`. TypeScript asks about roles only through `hasRole` / `hasAnyRole`. Workflow scoping and the ministries/budgets split follow spec sections 5 and 6.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS), Zod v4, React Hook Form, Jest (+ Testing Library), pnpm.

**Spec:** `docs/superpowers/specs/2026-10-02-multi-role-users-design.md`

## Global Constraints

- Always `pnpm`, never `npm`/`yarn`. Migrations via `pnpm supabase migration new`; apply with `pnpm supabase migration up`. **Never `pnpm supabase db reset`.**
- Regenerate DB types with `pnpm types:generate`; never edit `types/database.types.ts` by hand.
- Code style: no semicolons, double quotes, `printWidth` 100, trailing commas off.
- Code identifiers, DB names, file names, API routes are English. Spanish only in UI text, Zod messages and toasts.
- Authorization stays permission-based: `can(permissions, PERMISSIONS.X)`. Role-name checks go through `hasRole` / `hasAnyRole` (the sidebar's role filter is the one deliberate role-name exception).
- Do not add callers of `createSupabaseAdminClient` (CI whitelist). No task here needs one.
- Never push to `main`. Work stays on branch `feat/multi-role-users`. Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- `ADMIN` and `DELEGATE` are never combined with another role (DB CHECK + Zod).
- **The tree does not typecheck between Task 1 and Task 7.** Task 1 drops `users.role` and regenerates types, so every `.role` read breaks until it is migrated. Run only the per-task `pnpm test <path>` commands until Task 7, where `pnpm run ci` must go green. Intermediate commits are work-in-progress on the feature branch.

## Review Focus

Failure modes the spec implies that no single task's happy-path tests cover. Each has a test (or an explicit decision) in the task named.

1. **Invalid roles sent straight to the server action** (empty array, duplicates, `["ADMIN","BURSAR"]`, `["DELEGATE"]` on create), bypassing the UI → Zod rejects and the DB CHECK is the backstop. Tests: Task 2 (validators), Task 8 (CHECK constraint).
2. **A bursar+minister opens `/requests` or the notification bell** and must still get the full reviewer view, plus minister items. Tests: Task 3 (`isOwnMinistryScoped`), Task 5 (notifications route).
3. **Stale permission cache**: `getPermissionsForRole` is cached 24 h, so removing `MANAGE_MINISTRIES` from BURSAR would not apply after deploy. Fix: cache key bump. Check: Task 3 step 4.
4. **Audit diff on an unchanged `roles` array** shows as "changed" (arrays compare by reference) and prints `BURSAR,MINISTER`. Test: Task 7 (audit-diff).
5. **Bursar+minister can review their own ministry's request.** Nothing in the spec blocks it and this plan does not add a guard. It is called out in Task 8's final report for the owner to decide; no test pins it.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `supabase/migrations/<ts>_multi_role_users.sql` | Schema, validity function, `has_any_role`, 44 rewritten policies, function changes, permission data |
| `supabase/seed.sql` | e2e seed users use `roles` |
| `lib/constants/roles.ts` | `hasRole`, `hasAnyRole`, `rolesLabel`, `normalizeRoles`, `EXCLUSIVE_ROLES` |
| `lib/validators/user.ts` | `roles` array schemas for create/update |
| `lib/permissions/rbac.ts` | `mergePermissions`, `isOwnMinistryScoped` |
| `lib/supabase/server.ts` | `loadIdentity` returns `roles`, unions permissions, cache key `role-permissions-v2` |
| `types/user-context.ts` | `roles: UserRole[]` |
| `services/users/users.service.ts` | read/write `roles`, DELEGATE guard |
| `app/actions/users.ts`, `app/actions/impersonation.ts`, `services/impersonation/impersonation.service.ts` | `hasRole` instead of `.role` |
| `app/(dashboard)/requests/page.tsx`, `requests/[id]/page.tsx`, `app/api/requests/route.ts`, `app/api/notifications/route.ts` | reviewer-first scoping |
| `app/(dashboard)/ministries/page.tsx`, `components/ministries/*` | ministries ADMIN-only, no budgets tab |
| `app/(dashboard)/budgets/page.tsx` | new budgets page |
| `components/users/role-multi-select.tsx` | new multi-select with exclusive ADMIN |
| `components/users/users-manager.tsx` | multi-role create/edit/list/groups |
| `components/dashboard/app-sidebar.tsx`, `nav-user.tsx`, `impersonation-banner.tsx`, `app/(dashboard)/layout.tsx`, `profile/page.tsx` | `roles` display and filtering |
| `components/audit/audit-diff.tsx` | array-aware diff, "Roles" label |

---

### Task 1: Database migration, types and seed

**Files:**
- Create: `supabase/migrations/<timestamp>_multi_role_users.sql` (name generated by the CLI)
- Modify: `supabase/seed.sql:33-37`
- Modify (generated): `types/database.types.ts`
- Scratch (not committed): `$SCRATCH/gen_policies.py`, `$SCRATCH/head.sql`, `$SCRATCH/tail.sql`, where `$SCRATCH` is the session scratchpad directory

**Interfaces:**
- Produces: `users.roles: user_role[]` (NOT NULL), SQL `has_any_role(text[]) → boolean`, SQL `users_roles_valid(user_role[]) → boolean`. `users.role` and `get_my_role()` no longer exist.

- [ ] **Step 1: Create the migration file and note its path**

Run: `pnpm supabase migration new multi_role_users`
Expected: prints `Created new migration at supabase/migrations/<timestamp>_multi_role_users.sql`. Use that path as `$MIG` below. Local Supabase must be running (`pnpm supabase status`).

- [ ] **Step 2: Write the policy generator**

Create `$SCRATCH/gen_policies.py`. It reads the live policies that mention `get_my_role` and prints static `DROP POLICY` / `CREATE POLICY` SQL with the expression rewritten to `has_any_role(...)`. Ministry and assignment write policies are narrowed to ADMIN only.

```python
import json, re, subprocess, sys

ADMIN_ONLY = {
    "ministries_insert", "ministries_update",
    "ministry_assignments_insert", "ministry_assignments_update", "ministry_assignments_delete",
}

QUERY = """
select json_agg(row_to_json(t) order by t.tablename, t.policyname) from (
  select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
  from pg_policies
  where qual ilike '%get_my_role%' or with_check ilike '%get_my_role%'
) t
"""

def psql(sql):
    out = subprocess.run(
        ["docker", "exec", "supabase_db_sistema_contable_pibt", "psql", "-U", "postgres", "-At", "-c", sql],
        check=True, capture_output=True, text=True).stdout
    return json.loads(out)

def rewrite(expr, name):
    if expr is None:
        return None
    def arr(m):
        roles = re.findall(r"'(\w+)'::user_role", m.group(1))
        return "has_any_role(ARRAY[" + ", ".join(f"'{r}'" for r in roles) + "])"
    expr = re.sub(r"get_my_role\(\) = ANY \(ARRAY\[(.*?)\]\)", arr, expr, flags=re.S)
    expr = re.sub(r"get_my_role\(\) = '(\w+)'::user_role",
                  lambda m: f"has_any_role(ARRAY['{m.group(1)}'])", expr)
    if "get_my_role" in expr:
        sys.exit(f"unrewritten get_my_role in {name}: {expr}")
    if name in ADMIN_ONLY:
        expr = expr.replace("ARRAY['ADMIN', 'BURSAR']", "ARRAY['ADMIN']")
        assert "BURSAR" not in expr, name
    return expr

def pgroles(roles):
    if isinstance(roles, str):
        roles = roles.strip("{}").split(",")
    return ", ".join(roles)

rows = psql(QUERY)
out = ["-- Policies rewritten from get_my_role() to has_any_role(). Generated from the live",
       "-- pg_policies definitions and reviewed; ministry/assignment writes are now ADMIN-only.", ""]
for r in rows:
    q, w = rewrite(r["qual"], r["policyname"]), rewrite(r["with_check"], r["policyname"])
    tbl = f'{r["schemaname"]}.{r["tablename"]}'
    stmt = f'DROP POLICY "{r["policyname"]}" ON {tbl};\n'
    stmt += (f'CREATE POLICY "{r["policyname"]}" ON {tbl} AS {r["permissive"]} '
             f'FOR {r["cmd"]} TO {pgroles(r["roles"])}')
    if q: stmt += f"\n  USING ({q})"
    if w: stmt += f"\n  WITH CHECK ({w})"
    out.append(stmt + ";\n")
print("\n".join(out))
print(f"-- {len(rows)} policies", file=sys.stderr)
```

- [ ] **Step 3: Generate and review the policy SQL**

Run: `cd $SCRATCH && python3 gen_policies.py > policies.sql`
Expected: stderr `-- 44 policies`, no `unrewritten get_my_role` error. Then run `grep -c "CREATE POLICY" policies.sql` → `44`, and `grep -B1 -A3 '"ministries_insert"\|"ministry_assignments_delete"' policies.sql` → both use `has_any_role(ARRAY['ADMIN'])` with no BURSAR. If the policy count differs from 44 because the DB changed since this plan was written, that is fine as long as no `get_my_role` remains outside the SQL comment.

- [ ] **Step 4: Write the migration head and tail**

`$SCRATCH/head.sql`:

```sql
-- Multi-role users: users.role (single enum) becomes users.roles (user_role[]).
-- ADMIN and DELEGATE stay single-role; BURSAR/FINANCE/MINISTER combine freely.
-- Also makes ministries ADMIN-only (spec section 5): BURSAR loses MANAGE_MINISTRIES and the
-- ministries / ministry_assignments write policies.

-- ── 1. Column + validity rule ────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN roles user_role[];
UPDATE users SET roles = ARRAY[role];
ALTER TABLE users ALTER COLUMN roles SET NOT NULL;
ALTER TABLE users ALTER COLUMN roles SET DEFAULT ARRAY['FINANCE']::user_role[];

-- A function (not an inline expression) because the distinct-count needs a subquery, which
-- CHECK constraints can't contain directly.
CREATE FUNCTION users_roles_valid(p_roles user_role[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(p_roles) >= 1
     AND array_position(p_roles, NULL) IS NULL
     AND cardinality(p_roles) = (SELECT count(DISTINCT r) FROM unnest(p_roles) AS r)
     AND (cardinality(p_roles) = 1 OR NOT (p_roles && ARRAY['ADMIN', 'DELEGATE']::user_role[]))
$$;

ALTER TABLE users ADD CONSTRAINT users_roles_valid_check CHECK (users_roles_valid(roles));

-- ── 2. RLS helper (replaces get_my_role()) ───────────────────────────────────
CREATE OR REPLACE FUNCTION has_any_role(p_roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT roles::text[] && p_roles FROM users WHERE id = auth.uid()), false)
$$;

REVOKE EXECUTE ON FUNCTION has_any_role(text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION has_any_role(text[]) TO authenticated, service_role;

-- ── 3. Policies ──────────────────────────────────────────────────────────────
```

`$SCRATCH/tail.sql`:

```sql

-- ── 4. Drop the single-role helpers and column ───────────────────────────────
DROP FUNCTION get_my_role();
ALTER TABLE users DROP COLUMN role;

-- Unused by the app (users are created via usersService.invite); superseded rather than ported.
DROP FUNCTION IF EXISTS create_user_with_role(TEXT, TEXT, TEXT, user_role);

CREATE OR REPLACE FUNCTION create_initial_admin(p_email TEXT, p_password TEXT, p_full_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    RAISE EXCEPTION 'Initial admin already exists';
  END IF;

  new_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at, role, aud, instance_id
  ) VALUES (
    new_id, p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('full_name', p_full_name),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '', '', '', '', '', '', '', '',
    NOW(), NOW(),
    'authenticated', 'authenticated',
    '00000000-0000-0000-0000-000000000000'
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    new_id, new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', p_email,
    NOW(), NOW(), NOW()
  );

  INSERT INTO users (id, full_name, email, roles, status)
  VALUES (new_id, p_full_name, p_email, ARRAY['ADMIN']::user_role[], 'ACTIVE');

  RETURN new_id;
END;
$$;

-- ── 5. Ministries are ADMIN-only: BURSAR loses MANAGE_MINISTRIES ─────────────
-- (budgets keep their own page and MANAGE_BUDGETS; see the /budgets route)
UPDATE role_permissions SET enabled = false
WHERE role = 'BURSAR' AND permission = 'MANAGE_MINISTRIES';
```

Assemble: `cat $SCRATCH/head.sql $SCRATCH/policies.sql $SCRATCH/tail.sql > $MIG`

- [ ] **Step 5: Dry-run in a rolled-back transaction**

Run (from `$SCRATCH`):

```bash
(echo "BEGIN;"; cat $MIG; cat <<'EOF'
SELECT 'leftover get_my_role policies', count(*) FROM pg_policies WHERE qual ILIKE '%get_my_role%' OR with_check ILIKE '%get_my_role%';
SELECT 'admin+bursar valid', users_roles_valid(ARRAY['ADMIN','BURSAR']::user_role[]);
SELECT 'bursar+minister valid', users_roles_valid(ARRAY['BURSAR','MINISTER']::user_role[]);
SELECT 'duplicate valid', users_roles_valid(ARRAY['BURSAR','BURSAR']::user_role[]);
SELECT 'empty valid', users_roles_valid(ARRAY[]::user_role[]);
ROLLBACK;
EOF
) | docker exec -i supabase_db_sistema_contable_pibt psql -U postgres -v ON_ERROR_STOP=1 2>&1 | tail -25
```

Expected: no `ERROR`; `leftover get_my_role policies | 0`; `admin+bursar valid | f`; `bursar+minister valid | t`; `duplicate valid | f`; `empty valid | f`; ends with `ROLLBACK`.

- [ ] **Step 6: Apply the migration**

Run: `pnpm supabase migration up`
Expected: applies `<timestamp>_multi_role_users.sql` with no error. Then:
`docker exec supabase_db_sistema_contable_pibt psql -U postgres -At -c "select column_name from information_schema.columns where table_schema='public' and table_name='users' and column_name in ('role','roles')"` → only `roles`.

- [ ] **Step 7: Update the seed**

In `supabase/seed.sql`, replace the `public.users` insert (lines 33-37):

```sql
INSERT INTO public.users (id, full_name, email, roles, status) VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'E2E Admin', 'e2e-admin@local.test', ARRAY['ADMIN']::user_role[], 'ACTIVE'),
  ('e2e00000-0000-0000-0000-000000000002', 'E2E Bursar', 'e2e-bursar@local.test', ARRAY['BURSAR']::user_role[], 'ACTIVE'),
  ('e2e00000-0000-0000-0000-000000000003', 'E2E Finance', 'e2e-finance@local.test', ARRAY['FINANCE']::user_role[], 'ACTIVE'),
  ('e2e00000-0000-0000-0000-000000000004', 'E2E Minister', 'e2e-minister@local.test', ARRAY['MINISTER']::user_role[], 'ACTIVE');
```

(The `auth.users` insert at line 14 has its own `role` column for the Supabase auth schema; leave it untouched.)

- [ ] **Step 8: Regenerate types and check the diff**

Run: `pnpm types:generate && git diff --stat types/database.types.ts && grep -n "roles:" types/database.types.ts | head -5`
Expected: `types/database.types.ts` changed; `users` Row has `roles: Database["public"]["Enums"]["user_role"][]` and no `role:` for `users`; `has_any_role` appears under Functions; `get_my_role` is gone.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations supabase/seed.sql types/database.types.ts
git commit -m "feat(db): users.roles array, has_any_role RLS helper, ministries admin-only

WIP: TypeScript still reads users.role until the later tasks land.

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Role helpers and validators

**Files:**
- Modify: `lib/constants/roles.ts`
- Modify: `lib/validators/user.ts`
- Modify: `types/user-context.ts`
- Test: `lib/constants/__tests__/roles.test.ts` (create)
- Test: `lib/validators/__tests__/user.test.ts` (create)

**Interfaces:**
- Produces (from `lib/constants/roles.ts`):
  - `EXCLUSIVE_ROLES: UserRole[]` = `[ADMIN, DELEGATE]`
  - `hasRole(user: { roles: readonly UserRole[] } | null | undefined, role: UserRole): boolean`
  - `hasAnyRole(user: same, roles: readonly UserRole[]): boolean`
  - `rolesLabel(roles: readonly string[]): string` → `"Tesorero · Ministro"`
  - `normalizeRoles(roles: readonly UserRole[]): UserRole[]` (deduped, `ROLE_ORDER` order)
- Produces (from `lib/validators/user.ts`): `createUserSchema` / `updateUserSchema` with `roles: UserRole[]`; `CreateUserInput`, `UpdateUserInput` types.
- Produces (from `types/user-context.ts`): `RealUser.roles` and `SessionUser.roles` as `UserRole[]`.

- [ ] **Step 1: Write the failing helper tests**

Create `lib/constants/__tests__/roles.test.ts`:

```ts
import { USER_ROLES, hasRole, hasAnyRole, rolesLabel, normalizeRoles } from "../roles"

describe("hasRole", () => {
  it("finds a role among several", () => {
    expect(hasRole({ roles: ["BURSAR", "MINISTER"] }, USER_ROLES.MINISTER)).toBe(true)
  })

  it("is false when the role is absent", () => {
    expect(hasRole({ roles: ["BURSAR"] }, USER_ROLES.MINISTER)).toBe(false)
  })

  it("is false for a missing user", () => {
    expect(hasRole(null, USER_ROLES.ADMIN)).toBe(false)
    expect(hasRole(undefined, USER_ROLES.ADMIN)).toBe(false)
  })
})

describe("hasAnyRole", () => {
  it("is true when at least one role overlaps", () => {
    expect(hasAnyRole({ roles: ["FINANCE", "MINISTER"] }, ["BURSAR", "MINISTER"])).toBe(true)
  })

  it("is false when nothing overlaps", () => {
    expect(hasAnyRole({ roles: ["FINANCE"] }, ["BURSAR", "MINISTER"])).toBe(false)
  })
})

describe("rolesLabel", () => {
  it("joins Spanish labels", () => {
    expect(rolesLabel(["BURSAR", "MINISTER"])).toBe("Tesorero · Ministro")
  })

  it("passes unknown roles through", () => {
    expect(rolesLabel(["MYSTERY"])).toBe("MYSTERY")
  })
})

describe("normalizeRoles", () => {
  it("orders by ROLE_ORDER and drops duplicates", () => {
    expect(normalizeRoles(["MINISTER", "BURSAR", "BURSAR"])).toEqual(["BURSAR", "MINISTER"])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/constants/__tests__/roles.test.ts`
Expected: FAIL — `hasRole` / `hasAnyRole` / `rolesLabel` / `normalizeRoles` are not exported.

- [ ] **Step 3: Implement the helpers**

In `lib/constants/roles.ts`, directly after the existing `roleLabel` function, add:

```ts
// Roles that can't be combined with any other (also enforced by users_roles_valid in the DB).
export const EXCLUSIVE_ROLES: UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.DELEGATE]

type WithRoles = { roles: readonly UserRole[] } | null | undefined

// The only way TS code asks "does this user have role X?" — a user can hold several roles.
export function hasRole(user: WithRoles, role: UserRole): boolean {
  return user?.roles.includes(role) ?? false
}

export function hasAnyRole(user: WithRoles, roles: readonly UserRole[]): boolean {
  return roles.some((role) => hasRole(user, role))
}

export function rolesLabel(roles: readonly string[]): string {
  return roles.map(roleLabel).join(" · ")
}

// Stable, de-duplicated order so audit diffs and list badges don't flicker.
export function normalizeRoles(roles: readonly UserRole[]): UserRole[] {
  return ROLE_ORDER.filter((role) => roles.includes(role))
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test lib/constants/__tests__/roles.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 5: Write the failing validator tests**

Create `lib/validators/__tests__/user.test.ts`:

```ts
import { createUserSchema, updateUserSchema } from "../user"

const base = { full_name: "Maria Perez", email: "maria@example.com" }

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((i) => i.message) ?? []
}

describe("createUserSchema roles", () => {
  it("accepts a combination of roles", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["BURSAR", "MINISTER"] }).success).toBe(
      true
    )
  })

  it("accepts ADMIN on its own", () => {
    expect(createUserSchema.safeParse({ ...base, roles: ["ADMIN"] }).success).toBe(true)
  })

  it("rejects an empty list", () => {
    const result = createUserSchema.safeParse({ ...base, roles: [] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Selecciona al menos un rol")
  })

  it("rejects duplicates", () => {
    const result = createUserSchema.safeParse({ ...base, roles: ["BURSAR", "BURSAR"] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Roles duplicados")
  })

  it("rejects ADMIN combined with another role", () => {
    const result = createUserSchema.safeParse({ ...base, roles: ["ADMIN", "BURSAR"] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Este rol no se puede combinar con otros")
  })

  it("does not allow creating a DELEGATE here", () => {
    const result = createUserSchema.safeParse({ ...base, roles: ["DELEGATE"] })
    expect(result.success).toBe(false)
    expect(messages(result)).toContain("Rol no permitido")
  })
})

describe("updateUserSchema roles", () => {
  const update = { id: "u-1", full_name: "Maria Perez", status: "ACTIVE" as const }

  it("lets a DELEGATE user resubmit their own role", () => {
    expect(updateUserSchema.safeParse({ ...update, roles: ["DELEGATE"] }).success).toBe(true)
  })

  it("still rejects DELEGATE combined with another role", () => {
    expect(updateUserSchema.safeParse({ ...update, roles: ["DELEGATE", "BURSAR"] }).success).toBe(
      false
    )
  })

  it("rejects an empty list", () => {
    expect(updateUserSchema.safeParse({ ...update, roles: [] }).success).toBe(false)
  })
})
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm test lib/validators/__tests__/user.test.ts`
Expected: FAIL — the schemas still use `role`.

- [ ] **Step 7: Implement the validators**

Replace the top of `lib/validators/user.ts` (the imports through `updateUserSchema`) with:

```ts
import { z } from "zod"
import { USER_ROLES, ROLE_ORDER, EXCLUSIVE_ROLES } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"

const userRoleEnum = ROLE_ORDER as [UserRole, ...UserRole[]]

// DELEGATE is created only by the ministries flow, never from the users dialog.
const CREATABLE_ROLES: UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.BURSAR,
  USER_ROLES.FINANCE,
  USER_ROLES.MINISTER
]

function rolesSchema(allowed: readonly UserRole[]) {
  return z
    .array(z.enum(userRoleEnum))
    .min(1, "Selecciona al menos un rol")
    .refine((roles) => roles.every((role) => allowed.includes(role)), "Rol no permitido")
    .refine((roles) => new Set(roles).size === roles.length, "Roles duplicados")
    .refine(
      (roles) => roles.length === 1 || !roles.some((role) => EXCLUSIVE_ROLES.includes(role)),
      "Este rol no se puede combinar con otros"
    )
}

export const createUserSchema = z.object({
  full_name: z.string().min(3, "Nombre requerido"),
  email: z.email("Email inválido"),
  roles: rolesSchema(CREATABLE_ROLES)
})

export const updateUserSchema = z.object({
  id: z.string().min(1),
  full_name: z.string().min(3, "Nombre requerido"),
  // Update accepts every role so a DELEGATE (or ADMIN) user can resubmit the dialog unchanged;
  // usersService.update refuses to change a DELEGATE user's roles.
  roles: rolesSchema(ROLE_ORDER),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING_ACTIVATION", "PENDING_RESET"])
})
```

Leave `updateOwnProfileSchema` and the exported types below it unchanged.

- [ ] **Step 8: Run to verify it passes**

Run: `pnpm test lib/validators/__tests__/user.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 9: Update the session types**

In `types/user-context.ts` change both `role: UserRole` lines to `roles: UserRole[]`, so the file reads:

```ts
import type { UserRole } from "@/types/auth"

export interface RealUser {
  id: string
  email: string
  name: string
  roles: UserRole[]
}

export interface SessionUser {
  id: string
  email: string
  name: string
  roles: UserRole[]
  status: string
  permissions: string[]
  impersonatorId: string | null
  realUser: RealUser | null
}
```

- [ ] **Step 10: Commit**

```bash
git add lib/constants lib/validators types/user-context.ts
git commit -m "feat(roles): hasRole helpers and multi-role validators

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Identity, permission union and scoping helper

**Files:**
- Modify: `lib/permissions/rbac.ts`
- Modify: `lib/supabase/server.ts:37-76` and the `realUser` literal near line 146
- Test: `lib/permissions/__tests__/rbac.test.ts` (create)

**Interfaces:**
- Consumes: `UserRole` from `@/types/auth`.
- Produces:
  - `mergePermissions(lists: ReadonlyArray<ReadonlyArray<string>>): Set<string>`
  - `isOwnMinistryScoped(permissions: Set<string> | undefined): boolean` — true for a minister-style workflow user who cannot review.
  - `getCurrentUser()` / `getRealUser()` return `roles: UserRole[]` instead of `role`.

- [ ] **Step 1: Write the failing tests**

Create `lib/permissions/__tests__/rbac.test.ts`:

```ts
import { PERMISSIONS, isOwnMinistryScoped, mergePermissions } from "../rbac"

const P = PERMISSIONS
const minister = [P.CREATE_REQUEST, P.CREATE_SETTLEMENT, P.VIEW_WORKFLOW]
const bursar = [P.CREATE_MOVEMENT, P.REVIEW_INTENTIONS, P.VIEW_WORKFLOW, P.MANAGE_BUDGETS]

describe("mergePermissions", () => {
  it("unions permissions across roles without duplicates", () => {
    const merged = mergePermissions([bursar, minister])
    expect(merged.has(P.REVIEW_INTENTIONS)).toBe(true)
    expect(merged.has(P.CREATE_REQUEST)).toBe(true)
    expect(merged.size).toBe(new Set([...bursar, ...minister]).size)
  })

  it("is empty for no roles", () => {
    expect(mergePermissions([]).size).toBe(0)
  })
})

describe("isOwnMinistryScoped", () => {
  it("is true for a plain minister", () => {
    expect(isOwnMinistryScoped(new Set(minister))).toBe(true)
  })

  it("is false for a bursar+minister (keeps the reviewer view)", () => {
    expect(isOwnMinistryScoped(mergePermissions([bursar, minister]))).toBe(false)
  })

  it("is false for finance (read-only workflow, not minister-scoped)", () => {
    expect(isOwnMinistryScoped(new Set([P.VIEW_WORKFLOW]))).toBe(false)
  })

  it("is false for no permissions", () => {
    expect(isOwnMinistryScoped(undefined)).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test lib/permissions/__tests__/rbac.test.ts`
Expected: FAIL — `mergePermissions` / `isOwnMinistryScoped` not exported.

- [ ] **Step 3: Implement the helpers**

Append to `lib/permissions/rbac.ts`:

```ts
// A user's effective permissions are the union of every role they hold.
export function mergePermissions(lists: ReadonlyArray<ReadonlyArray<string>>): Set<string> {
  return new Set(lists.flat())
}

// Own-ministry scoping (minister-style request/settlement views) applies only to workflow
// users who can't review. A reviewer (BURSAR, ADMIN) who also holds MINISTER keeps the full
// reviewer view and gets the minister view of their own ministry from /ministries/[id].
export function isOwnMinistryScoped(permissions: Set<string> | undefined): boolean {
  return isMinisterWorkflowUser(permissions) && !can(permissions, PERMISSIONS.REVIEW_INTENTIONS)
}
```

- [ ] **Step 4: Update identity loading and bust the permission cache**

In `lib/supabase/server.ts`:

1. Add `mergePermissions` to the rbac import (add the import if the file has none: `import { mergePermissions } from "@/lib/permissions/rbac"`).
2. Change the cache key so the BURSAR `MANAGE_MINISTRIES` removal applies on deploy instead of after the 24 h TTL. In the `getPermissionsForRole` definition replace `["role-permissions"],` with `["role-permissions-v2"],` and keep `tags: ["role-permissions"]` unchanged (the tag is what `revalidateRolePermissions` invalidates).
3. Replace `loadIdentity`'s select and return:

```ts
  const { data: profile } = await admin
    .from("users")
    .select("id, full_name, email, roles, status")
    .eq("id", userId)
    .single()

  if (!profile || profile.status !== "ACTIVE") return null

  const permissions = mergePermissions(
    await Promise.all(profile.roles.map((role) => getPermissionsForRole(role)))
  )

  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    roles: profile.roles,
    status: profile.status,
    permissions
  }
```

4. In `getCurrentUser`, change the impersonation return's `realUser` literal to `realUser: { id: realUser.id, email: realUser.email, name: realUser.name, roles: realUser.roles }`.

Verify the cache bump: `grep -n "role-permissions" lib/supabase/server.ts` → shows `["role-permissions-v2"]` for the key and `"role-permissions"` for the tag/`revalidateTag`.

- [ ] **Step 5: Run to verify tests pass**

Run: `pnpm test lib/permissions/__tests__/rbac.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add lib/permissions lib/supabase/server.ts
git commit -m "feat(auth): load roles array, union permissions, reviewer-first scoping helper

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Users service, actions and impersonation

**Files:**
- Modify: `services/users/users.service.ts`
- Modify: `app/actions/users.ts:40,57`
- Modify: `app/actions/impersonation.ts:13,23`
- Modify: `services/impersonation/impersonation.service.ts:20-34`
- Modify: `services/ministries/ministries.service.ts:170`
- Modify: `services/settlements/settlements.service.ts:457`, `services/intentions/intentions.service.ts:355`, `services/audit/audit.service.ts:76`
- Modify test: `app/actions/__tests__/users.test.ts`
- Test: `services/users/__tests__/users.service.test.ts` (create), `services/impersonation/__tests__/impersonation.service.test.ts` (create)

**Interfaces:**
- Consumes: `hasRole`, `normalizeRoles`, `USER_ROLES` (Task 2); `CreateUserInput` / `UpdateUserInput` with `roles` (Task 2).
- Produces: `usersService.invite(input: { full_name: string; email: string; roles: UserRole[] }, actingUserId)`; `usersService.update(input: UpdateUserInput, actingUserId)` which refuses to change a DELEGATE user's roles or to make anyone a DELEGATE.

- [ ] **Step 1: Write the failing users-service tests**

Create `services/users/__tests__/users.service.test.ts`:

```ts
/**
 * @jest-environment node
 */
const mockFrom = jest.fn()
const mockGenerateLink = jest.fn()
const mockLogSystem = jest.fn()

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { admin: { generateLink: (...args: unknown[]) => mockGenerateLink(...args) } }
  })
}))
jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: (...args: unknown[]) => mockLogSystem(...args) }
}))
jest.mock("@/services/email/resend.service", () => ({
  sendInviteEmail: jest.fn(),
  sendResetEmail: jest.fn()
}))
jest.mock("@/services/auth/link-wrapper", () => ({ wrapAuthLink: (link: string) => link }))
jest.mock("@/services/storage/attachment-storage.service", () => ({
  attachmentStorageService: { removeMany: jest.fn() }
}))
jest.mock("@/lib/utils", () => ({ getSiteUrl: () => "http://localhost:3000" }))

import { usersService } from "../users.service"

// A thenable query-builder stub: every chained call returns itself, terminal calls resolve.
function chain(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null }
  const c: Record<string, jest.Mock> & { then?: unknown } = {}
  for (const method of ["select", "eq", "update", "insert", "order", "limit"]) {
    c[method] = jest.fn(() => c)
  }
  c.single = jest.fn(async () => resolved)
  c.maybeSingle = jest.fn(async () => resolved)
  c.then = (resolve: (value: unknown) => unknown) => resolve(resolved)
  return c
}

const UPDATED = { id: "u-1", full_name: "Maria", roles: ["BURSAR", "MINISTER"], status: "ACTIVE" }

describe("usersService.update — roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("writes normalized roles", async () => {
    const current = chain({ data: { id: "u-1", roles: ["BURSAR"] } })
    const write = chain({ data: UPDATED })
    mockFrom.mockReturnValueOnce(current).mockReturnValueOnce(write)

    await usersService.update(
      { id: "u-1", full_name: "Maria", roles: ["MINISTER", "BURSAR"], status: "ACTIVE" },
      "admin-1"
    )

    expect(write.update).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["BURSAR", "MINISTER"] })
    )
  })

  it("refuses to change a DELEGATE user's roles", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: "u-1", roles: ["DELEGATE"] } }))

    await expect(
      usersService.update(
        { id: "u-1", full_name: "Maria", roles: ["BURSAR"], status: "ACTIVE" },
        "admin-1"
      )
    ).rejects.toThrow("El rol de un delegado no se puede modificar")
  })

  it("refuses to turn a regular user into a DELEGATE", async () => {
    mockFrom.mockReturnValueOnce(chain({ data: { id: "u-1", roles: ["BURSAR"] } }))

    await expect(
      usersService.update(
        { id: "u-1", full_name: "Maria", roles: ["DELEGATE"], status: "ACTIVE" },
        "admin-1"
      )
    ).rejects.toThrow("El rol de delegado solo se asigna desde Ministerios")
  })

  it("lets a DELEGATE user be saved with the same role", async () => {
    const current = chain({ data: { id: "u-1", roles: ["DELEGATE"] } })
    const write = chain({ data: { ...UPDATED, roles: ["DELEGATE"] } })
    mockFrom.mockReturnValueOnce(current).mockReturnValueOnce(write)

    await usersService.update(
      { id: "u-1", full_name: "Maria", roles: ["DELEGATE"], status: "INACTIVE" },
      "admin-1"
    )

    expect(write.update).toHaveBeenCalledWith(expect.objectContaining({ roles: ["DELEGATE"] }))
  })
})

describe("usersService.invite — roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("stores normalized roles on the new profile", async () => {
    const lookup = chain({ data: null })
    const insert = chain()
    const profile = chain({ data: { id: "new-1", full_name: "Ana", roles: ["BURSAR", "MINISTER"] } })
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(insert).mockReturnValueOnce(profile)
    mockGenerateLink.mockResolvedValue({
      data: { user: { id: "new-1" }, properties: { action_link: "http://link" } },
      error: null
    })

    await usersService.invite(
      { full_name: "Ana", email: "ana@example.com", roles: ["MINISTER", "BURSAR"] },
      "admin-1"
    )

    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ roles: ["BURSAR", "MINISTER"], status: "PENDING_ACTIVATION" })
    )
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test services/users/__tests__/users.service.test.ts`
Expected: FAIL — the service still reads/writes `role`.

- [ ] **Step 3: Update the users service**

In `services/users/users.service.ts`:

1. Imports — add:

```ts
import { USER_ROLES, normalizeRoles } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"
```

2. Add above `export const usersService`:

```ts
// `invite` is also called by the ministries flow with ["DELEGATE"], which the users-dialog
// schema deliberately doesn't allow — so the service takes plain roles, not CreateUserInput.
export type InviteUserInput = Pick<CreateUserInput, "full_name" | "email"> & {
  roles: UserRole[]
}
```

3. Change every select of `role` to `roles`: in `getById` and `list` (`"id, full_name, email, roles, status, created_at, updated_at"`), in `delete` (`"full_name, email, roles, status"`), in `invite`'s final profile select and `update`'s `.select(...)` (`"id, full_name, roles, status, created_at, updated_at"`).
4. `invite(input: InviteUserInput, ...)`. In its insert replace `role: input.role,` with `roles: normalizeRoles(input.roles),`; in the audit `new_value` replace `role: input.role` with `roles: normalizeRoles(input.roles)`.
5. In `update`, after the `if (fetchError || !current) throw ...` line and before the `.update(...)`, add:

```ts
    const currentRoles = current.roles as UserRole[]
    const nextRoles = normalizeRoles(input.roles)
    const currentIsDelegate = currentRoles.includes(USER_ROLES.DELEGATE)
    if (currentIsDelegate && nextRoles.join() !== normalizeRoles(currentRoles).join()) {
      throw new Error("El rol de un delegado no se puede modificar")
    }
    if (!currentIsDelegate && nextRoles.includes(USER_ROLES.DELEGATE)) {
      throw new Error("El rol de delegado solo se asigna desde Ministerios")
    }
```

and in the `.update({...})` payload replace `role: input.role,` with `roles: nextRoles,`.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test services/users/__tests__/users.service.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Point the ministries delegate invite at the new shape**

In `services/ministries/ministries.service.ts` line 170 replace
`{ full_name: input.full_name, email: input.email, role: "DELEGATE" },`
with
`{ full_name: input.full_name, email: input.email, roles: ["DELEGATE"] },`.

- [ ] **Step 6: Update the join selects that read `users.role`**

Replace `role` with `roles` in these PostgREST selects (no consumer reads the value, so nothing else changes):
- `services/settlements/settlements.service.ts:457` → `.select("*, users(id, full_name, roles)")`
- `services/intentions/intentions.service.ts:355` → `.select("*, users(id, full_name, roles)")`
- `services/audit/audit.service.ts:76` → both embedded selects: `users!system_audit_log_user_id_fkey(id, full_name, email, roles)` and `impersonator:users!system_audit_log_impersonator_id_fkey(id, full_name, email, roles)`

- [ ] **Step 7: Write the failing impersonation test**

Create `services/impersonation/__tests__/impersonation.service.test.ts`:

```ts
/**
 * @jest-environment node
 */
const mockFrom = jest.fn()

jest.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: (...args: unknown[]) => mockFrom(...args) })
}))
jest.mock("@/services/audit/audit.service", () => ({
  auditService: { logSystem: jest.fn() }
}))

import { impersonationService } from "../impersonation.service"

function targetRow(roles: string[], status = "ACTIVE") {
  const c: Record<string, jest.Mock> = {}
  c.select = jest.fn(() => c)
  c.eq = jest.fn(() => c)
  c.single = jest.fn(async () => ({
    data: { id: "t-1", full_name: "T", email: "t@example.com", roles, status },
    error: null
  }))
  return c
}

describe("impersonationService.start — target roles", () => {
  beforeEach(() => jest.clearAllMocks())

  it("refuses an ADMIN target", async () => {
    mockFrom.mockReturnValueOnce(targetRow(["ADMIN"]))
    await expect(impersonationService.start("admin-1", "t-1")).rejects.toThrow(
      "No se puede suplantar a otro administrador"
    )
  })

  it("does not refuse a bursar+minister target on role grounds", async () => {
    mockFrom.mockReturnValueOnce(targetRow(["BURSAR", "MINISTER"]))
    // The next query (existing session lookup) has no stub, so start() fails there —
    // reaching it proves the role check passed.
    await expect(impersonationService.start("admin-1", "t-1")).rejects.not.toThrow(
      "No se puede suplantar a otro administrador"
    )
  })
})
```

- [ ] **Step 8: Run to verify it fails**

Run: `pnpm test services/impersonation/__tests__/impersonation.service.test.ts`
Expected: FAIL — the service selects/reads `role`.

- [ ] **Step 9: Update impersonation**

In `services/impersonation/impersonation.service.ts`: change the target select to `"id, full_name, email, roles, status"`, import `hasRole` (`import { USER_ROLES, hasRole } from "@/lib/constants/roles"`), and replace `if (target.role === USER_ROLES.ADMIN) {` with `if (hasRole(target, USER_ROLES.ADMIN)) {`.

In `app/actions/impersonation.ts`: import `hasRole`, then
- `assertRealAdmin`: `if (!realUser || !hasRole(realUser, USER_ROLES.ADMIN)) {`
- `listImpersonationTargets`: `(u) => u.id !== realUser.id && !hasRole(u, USER_ROLES.ADMIN) && u.status === "ACTIVE"`

- [ ] **Step 10: Run to verify it passes**

Run: `pnpm test services/impersonation`
Expected: PASS (2 tests).

- [ ] **Step 11: Update the user actions and their tests**

In `app/actions/users.ts`: import `hasRole` alongside `USER_ROLES` (`import { USER_ROLES, hasRole } from "@/lib/constants/roles"`), then replace both `user.role !== USER_ROLES.ADMIN` checks with `!hasRole(user, USER_ROLES.ADMIN)`.

In `app/actions/__tests__/users.test.ts`:
- Add `import type { UserRole } from "@/types/auth"` at the top.
- Line 47: `role: "MINISTER" as const` → `roles: ["MINISTER"] as UserRole[]`.
- Line 51: `role: "MINISTER" as const,` → `roles: ["MINISTER"] as UserRole[],`.
- Lines 120, 143, 174, 195: `role: "ADMIN"` → `roles: ["ADMIN"]`. Lines 131, 184: `role: "BURSAR"` → `roles: ["BURSAR"]`.
- Add one test inside the existing hard-delete describe block (next to the BURSAR rejection at line ~131), reusing its mocks:

```ts
  it("rejects a hard delete from a user who has ADMIN nowhere in their roles", async () => {
    const bursarMinister = { ...mockUser, roles: ["BURSAR", "MINISTER"] }
    mockGetCurrentUser.mockResolvedValue(bursarMinister)
    mockCan.mockReturnValue(true)

    const result = await deleteUser("u-2", { hardDelete: true })

    expect(result).toEqual({
      error: "Solo un administrador puede eliminar usuarios permanentemente"
    })
    expect(mockDelete).not.toHaveBeenCalled()
  })
```

- [ ] **Step 12: Run the whole group**

Run: `pnpm test app/actions/__tests__/users.test.ts services/users services/impersonation`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add services app/actions
git commit -m "feat(users): read and write roles arrays; DELEGATE stays system-assigned

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Workflow scoping for reviewers who are also ministers

**Files:**
- Modify: `app/(dashboard)/requests/page.tsx`
- Modify: `app/(dashboard)/requests/[id]/page.tsx:27`
- Modify: `app/api/requests/route.ts:23`
- Modify (rewrite): `app/api/notifications/route.ts`
- Test: `app/api/notifications/__tests__/route.test.ts` (create)

**Interfaces:**
- Consumes: `isOwnMinistryScoped`, `can`, `PERMISSIONS.REVIEW_INTENTIONS` (Task 3).
- Produces: `GET /api/notifications` returns `{ count, items }` where a user with both sides gets the union of minister items and reviewer items.

- [ ] **Step 1: Write the failing notifications test**

Create `app/api/notifications/__tests__/route.test.ts`:

```ts
/**
 * @jest-environment node
 */
const mockGetCurrentUser = jest.fn()
const mockGetMinistryForUser = jest.fn()
const mockIntentionsList = jest.fn()
const mockIntentionsPending = jest.fn()
const mockSettlementsList = jest.fn()
const mockSettlementsPending = jest.fn()
const mockMissingTransfers = jest.fn()

jest.mock("@/lib/supabase/server", () => ({
  getCurrentUser: () => mockGetCurrentUser(),
  createSupabaseServerClient: async () => ({})
}))
jest.mock("@/services/ministries/ministries.service", () => ({
  ministriesService: { getMinistryForUser: (...a: unknown[]) => mockGetMinistryForUser(...a) }
}))
jest.mock("@/services/intentions/intentions.service", () => ({
  intentionsService: {
    list: (...a: unknown[]) => mockIntentionsList(...a),
    getPendingCount: (...a: unknown[]) => mockIntentionsPending(...a),
    getMissingTransfersCount: (...a: unknown[]) => mockMissingTransfers(...a)
  }
}))
jest.mock("@/services/settlements/settlements.service", () => ({
  settlementsService: {
    list: (...a: unknown[]) => mockSettlementsList(...a),
    getPendingCount: (...a: unknown[]) => mockSettlementsPending(...a)
  }
}))

import { GET } from "../route"

const MINISTER = ["CREATE_REQUEST", "CREATE_SETTLEMENT", "VIEW_WORKFLOW"]
const BURSAR = ["REVIEW_INTENTIONS", "VIEW_WORKFLOW", "CREATE_MOVEMENT"]

function asUser(permissions: string[]) {
  mockGetCurrentUser.mockResolvedValue({ id: "u-1", permissions: new Set(permissions) })
}

describe("GET /api/notifications", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetMinistryForUser.mockResolvedValue({ ministry_id: "m-1" })
    mockIntentionsList.mockResolvedValue([
      { id: "i-1", purpose: "Retiro", updated_at: "2026-10-01T00:00:00Z" }
    ])
    mockSettlementsList.mockResolvedValue([])
    mockIntentionsPending.mockResolvedValue(2)
    mockSettlementsPending.mockResolvedValue(1)
    mockMissingTransfers.mockResolvedValue(0)
  })

  it("gives a plain minister only their own items", async () => {
    asUser(MINISTER)
    const body = await (await GET()).json()

    expect(body.items.map((i: { type: string }) => i.type)).toEqual(["INTENTION_APPROVED"])
    expect(body.count).toBe(1)
    expect(mockIntentionsPending).not.toHaveBeenCalled()
  })

  it("gives a plain bursar only reviewer counts", async () => {
    asUser(BURSAR)
    const body = await (await GET()).json()

    expect(body.items.map((i: { type: string }) => i.type)).toEqual([
      "INTENTIONS_PENDING",
      "SETTLEMENTS_PENDING"
    ])
    expect(body.count).toBe(3)
    expect(mockGetMinistryForUser).not.toHaveBeenCalled()
  })

  it("gives a bursar+minister both sides", async () => {
    asUser([...BURSAR, ...MINISTER])
    const body = await (await GET()).json()

    expect(body.items.map((i: { type: string }) => i.type)).toEqual([
      "INTENTION_APPROVED",
      "INTENTIONS_PENDING",
      "SETTLEMENTS_PENDING"
    ])
    expect(body.count).toBe(4)
  })

  it("keeps finance on the reviewer-style counts", async () => {
    asUser(["VIEW_WORKFLOW"])
    const body = await (await GET()).json()

    expect(body.count).toBe(3)
  })

  it("returns an empty minister result when no ministry is assigned", async () => {
    asUser(MINISTER)
    mockGetMinistryForUser.mockResolvedValue(null)
    const body = await (await GET()).json()

    expect(body).toEqual({ count: 0, items: [] })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test app/api/notifications/__tests__/route.test.ts`
Expected: FAIL — the bursar+minister case returns only minister items (the current route returns early for anyone minister-scoped).

- [ ] **Step 3: Rewrite the notifications route**

Replace the whole of `app/api/notifications/route.ts` with:

```ts
import { NextResponse } from "next/server"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import {
  PERMISSIONS,
  can,
  canAccessWorkflow,
  isMinisterWorkflowUser
} from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { settlementsService } from "@/services/settlements/settlements.service"
import { ministriesService } from "@/services/ministries/ministries.service"

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function ministerSide(db: Db, userId: string) {
  const assignment = await ministriesService.getMinistryForUser(db, userId)
  if (!assignment) return { count: 0, items: [] }

  // Only DRAFT and RETURNED_FOR_CORRECTION need the minister's own action — PENDING and
  // IN_REVIEW are already out of their hands, waiting on tesorería.
  const [intentionsPending, settlementsDraft, settlementsReturned] = await Promise.all([
    intentionsService.list(db, { ministryId: assignment.ministry_id, status: "APPROVED" }),
    settlementsService.list(db, { status: "DRAFT", submittedBy: userId }),
    settlementsService.list(db, { status: "RETURNED_FOR_CORRECTION", submittedBy: userId })
  ])

  const items = [
    ...intentionsPending.map((i) => ({
      type: "INTENTION_APPROVED" as const,
      id: i.id,
      description: i.purpose,
      href: `/requests/${i.id}`,
      created_at: i.updated_at
    })),
    ...settlementsDraft.map((s) => ({
      type: "SETTLEMENT_DRAFT" as const,
      id: s.id,
      description: s.description,
      href: `/requests/${s.intention_id}`,
      created_at: s.created_at
    })),
    ...settlementsReturned.map((s) => ({
      type: "SETTLEMENT_RETURNED" as const,
      id: s.id,
      description: s.description,
      href: `/requests/${s.intention_id}`,
      created_at: s.created_at
    }))
  ]

  return { count: items.length, items }
}

async function reviewerSide(db: Db) {
  const [intentionCount, settlementCount, missingTransfers] = await Promise.all([
    intentionsService.getPendingCount(db),
    settlementsService.getPendingCount(db),
    intentionsService.getMissingTransfersCount(db)
  ])

  const items = [
    intentionCount > 0
      ? { type: "INTENTIONS_PENDING", count: intentionCount, href: "/requests?status=PENDING" }
      : null,
    settlementCount > 0
      ? {
          type: "SETTLEMENTS_PENDING",
          count: settlementCount,
          href: "/requests?tab=settlements&status=PENDING"
        }
      : null,
    missingTransfers > 0
      ? { type: "MISSING_TRANSFERS", count: missingTransfers, href: "/requests?tab=transfers" }
      : null
  ].filter(Boolean)

  return { count: intentionCount + settlementCount + missingTransfers, items }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user || !canAccessWorkflow(user.permissions)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const db = await createSupabaseServerClient()

  // A user can have both sides (e.g. bursar+minister): they get both sets of items. Anyone who
  // isn't minister-style (finance, bursar) gets the reviewer-style counts, as before.
  const hasMinisterSide = isMinisterWorkflowUser(user.permissions)
  const hasReviewerSide = can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS) || !hasMinisterSide

  const [minister, reviewer] = await Promise.all([
    hasMinisterSide ? ministerSide(db, user.id) : null,
    hasReviewerSide ? reviewerSide(db) : null
  ])

  const parts = [minister, reviewer].filter((part) => part !== null)
  return NextResponse.json({
    count: parts.reduce((sum, part) => sum + part.count, 0),
    items: parts.flatMap((part) => part.items)
  })
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test app/api/notifications/__tests__/route.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Reviewer-first scoping in the requests list page and API**

In `app/(dashboard)/requests/page.tsx` replace
`if (can(user.permissions, PERMISSIONS.CREATE_REQUEST)) {`
with
```ts
  // Reviewers (bursar, admin) keep the full list even when they also hold MINISTER; they create
  // requests for their own ministry from /ministries/[id].
  if (
    can(user.permissions, PERMISSIONS.CREATE_REQUEST) &&
    !can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS)
  ) {
```

In `app/api/requests/route.ts` (GET, line 23) make the same replacement of
`if (can(user.permissions, PERMISSIONS.CREATE_REQUEST)) {` with
```ts
  if (
    can(user.permissions, PERMISSIONS.CREATE_REQUEST) &&
    !can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS)
  ) {
```
Only the GET handler's `if` changes; the POST handler's `CREATE_REQUEST` check stays.

- [ ] **Step 6: Reviewer-first scoping on the request detail page**

In `app/(dashboard)/requests/[id]/page.tsx` change the import to include `isOwnMinistryScoped` (replacing `isMinisterWorkflowUser` if it is no longer used elsewhere in the file) and replace
`if (isMinisterWorkflowUser(user.permissions)) {`
with
`if (isOwnMinistryScoped(user.permissions)) {`.

- [ ] **Step 7: Run the affected tests**

Run: `pnpm test app/api app/actions/__tests__/requests.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/api app/\(dashboard\)/requests
git commit -m "fix(requests): reviewers keep the full workflow view when they also hold MINISTER

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ministries ADMIN-only and the budgets page

**Files:**
- Modify: `app/(dashboard)/ministries/page.tsx`
- Modify: `components/ministries/ministries-client.tsx`
- Modify: `components/ministries/ministry-detail-client.tsx:74-80,152`
- Create: `app/(dashboard)/budgets/page.tsx`
- Modify: `app/actions/ministry-budgets.ts:30-33`
- Modify: `components/dashboard/app-sidebar.tsx` (nav + exported visibility function; user prop moves to `roles` in Task 7)
- Test: `components/dashboard/__tests__/app-sidebar.test.tsx` (create)

**Interfaces:**
- Consumes: `hasRole`, `USER_ROLES`.
- Produces: `getVisibleGroups(roles: readonly string[], ministryId?: string | null)` exported from `components/dashboard/app-sidebar.tsx`, returning the filtered `NavGroup[]`; `NAV_GROUPS` includes `/budgets` for `["ADMIN","BURSAR"]` and `/ministries` for `["ADMIN"]` only.

- [ ] **Step 1: Write the failing sidebar-visibility test**

Create `components/dashboard/__tests__/app-sidebar.test.tsx`:

```tsx
import { getVisibleGroups } from "../app-sidebar"

function hrefs(roles: string[], ministryId?: string | null) {
  return getVisibleGroups(roles, ministryId).flatMap((g) => g.links.map((l) => l.href))
}

describe("getVisibleGroups", () => {
  it("shows Ministerios and Presupuesto to ADMIN", () => {
    const links = hrefs(["ADMIN"])
    expect(links).toContain("/ministries")
    expect(links).toContain("/budgets")
  })

  it("hides Ministerios from a bursar but keeps Presupuesto", () => {
    const links = hrefs(["BURSAR"])
    expect(links).not.toContain("/ministries")
    expect(links).toContain("/budgets")
  })

  it("gives a bursar+minister their own ministry, not the list", () => {
    const links = hrefs(["BURSAR", "MINISTER"], "m-1")
    expect(links).toContain("/ministries/m-1")
    expect(links).not.toContain("/ministries")
    expect(links).toContain("/budgets")
  })

  it("hides Mi ministerio when there is no assignment", () => {
    expect(hrefs(["BURSAR", "MINISTER"], null).some((h) => h.startsWith("/ministries/"))).toBe(
      false
    )
  })

  it("gives a plain minister neither Ministerios nor Presupuesto", () => {
    const links = hrefs(["MINISTER"], "m-1")
    expect(links).not.toContain("/ministries")
    expect(links).not.toContain("/budgets")
    expect(links).toContain("/ministries/m-1")
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test components/dashboard/__tests__/app-sidebar.test.tsx`
Expected: FAIL — `getVisibleGroups` is not exported.

- [ ] **Step 3: Update the sidebar nav and extract the visibility function**

In `components/dashboard/app-sidebar.tsx`:

1. Add `Wallet` to the lucide-react import list.
2. In `NAV_GROUPS`, "Finanzas" group, add after the Remuneraciones link:
```ts
      {
        href: "/budgets",
        label: "Presupuesto",
        icon: Wallet,
        roles: ["ADMIN", "BURSAR"]
      }
```
3. Change the ministries link to `{ href: "/ministries", label: "Ministerios", icon: Landmark, roles: ["ADMIN"] },`.
4. Above `export function AppSidebar`, add:
```ts
export function getVisibleGroups(roles: readonly string[], ministryId?: string | null): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    links: group.links
      .filter((l) => !l.roles || l.roles.some((role) => roles.includes(role)))
      .filter((l) => l.href !== MY_MINISTRY_HREF || ministryId)
      .map((l) => (l.href === MY_MINISTRY_HREF ? { ...l, href: `/ministries/${ministryId}` } : l))
  })).filter((group) => group.links.length > 0)
}
```
5. Change the component's `user` prop type field `role: string` to `roles: string[]` and replace the `visibleGroups` memo body with:
```ts
  const visibleGroups = useMemo(
    () => getVisibleGroups(user.roles, user.ministryId),
    [user.roles, user.ministryId]
  )
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test components/dashboard/__tests__/app-sidebar.test.tsx`
Expected: PASS (5 tests).

- [ ] **Step 5: Strip budgets out of the ministries page**

Replace `app/(dashboard)/ministries/page.tsx` with:

```tsx
import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { usersService } from "@/services/users/users.service"
import { MinistriesClient } from "@/components/ministries/ministries-client"
import { USER_ROLES, hasRole } from "@/lib/constants/roles"

export default async function MinistriesPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_MINISTRIES)) redirect("/dashboard")

  const db = await createSupabaseServerClient()
  const [ministries, currentAssignments, users] = await Promise.all([
    ministriesService.list(db),
    ministriesService.listCurrentAssignments(db),
    usersService.list()
  ])

  // A user with MINISTER among several roles (e.g. bursar+minister) can be assigned too.
  const ministers = users.filter((u) => hasRole(u, USER_ROLES.MINISTER))

  return (
    <MinistriesClient
      initialMinistries={ministries}
      initialCurrentAssignments={currentAssignments}
      ministers={ministers}
    />
  )
}
```

In `components/ministries/ministries-client.tsx`:
- Remove the imports of `Tabs, TabsList, TabsTrigger, TabsContent`, `MinistryBudgetAdmin` and `MinistryBudgetSummaryRow`.
- Remove the `BudgetPeriod` type; reduce `Props` to `initialMinistries`, `initialCurrentAssignments`, `ministers`; reduce the component's destructured params the same way.
- Replace the whole `{canManageBudgets ? ( <Tabs ...> ) : ( ministriesList )}` block at the bottom with `{ministriesList}`.

If `Tabs`-related imports were the only users of a lucide/ui import, ESLint (`pnpm lint`) will flag the leftovers in Task 7's CI run; remove any now-unused import it reports.

- [ ] **Step 6: Create the budgets page**

Create `app/(dashboard)/budgets/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"
import { MinistryBudgetAdmin } from "@/components/ministries/ministry-budget-admin"

export default async function BudgetsPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)) redirect("/dashboard")

  const db = await createSupabaseServerClient()
  const [ministries, currentPeriod, budgetSummary] = await Promise.all([
    ministriesService.list(db),
    ministryBudgetService.getCurrentPeriod(db),
    ministryBudgetService.getSummary()
  ])

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
          Presupuesto
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          Presupuesto por ministerio para el período vigente.
        </p>
      </div>

      <MinistryBudgetAdmin
        ministries={ministries}
        currentPeriod={currentPeriod}
        summary={budgetSummary}
      />
    </section>
  )
}
```

In `app/actions/ministry-budgets.ts`, make `revalidateBudgetConsumers` also refresh the new page:

```ts
function revalidateBudgetConsumers(ministryId?: string) {
  revalidatePath("/budgets")
  revalidatePath("/ministries")
  if (ministryId) revalidatePath(`/ministries/${ministryId}`)
}
```

- [ ] **Step 7: Minister picker on the ministry detail page**

In `components/ministries/ministry-detail-client.tsx`: change the `MinistryUser` type's `role: string` to `roles: string[]`; change line 152 to
`const ministers = users.filter((u) => hasRole(u as { roles: UserRole[] }, USER_ROLES.MINISTER))`
and update the roles import to `import { USER_ROLES, hasRole } from "@/lib/constants/roles"` (add `import type { UserRole } from "@/types/auth"` if not already imported).

- [ ] **Step 8: Run the ministries-related tests**

Run: `pnpm test app/actions/__tests__/ministries.test.ts app/actions/__tests__/ministry-budgets.test.ts components/dashboard`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add app components
git commit -m "feat(ministries): ADMIN-only ministries, budgets on their own page

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Users UI, role displays and green CI

**Files:**
- Create: `components/users/role-multi-select.tsx`
- Test: `components/users/__tests__/role-multi-select.test.tsx` (create)
- Modify: `components/users/users-manager.tsx`
- Modify: `app/(dashboard)/layout.tsx:28-44`
- Modify: `components/dashboard/nav-user.tsx`, `components/dashboard/impersonation-banner.tsx`, `app/(dashboard)/profile/page.tsx`
- Modify: `components/audit/audit-diff.tsx`
- Test: `components/audit/__tests__/audit-diff.test.tsx` (create)

**Interfaces:**
- Consumes: `ROLE_LABEL`, `USER_ROLES`, `hasRole`, `hasAnyRole`, `rolesLabel` (Task 2); `getVisibleGroups` / sidebar `roles` prop (Task 6).
- Produces: `toggleRole(current: UserRole[], role: UserRole): UserRole[]` and `<RoleMultiSelect id value onChange disabled? />` from `components/users/role-multi-select.tsx`.

- [ ] **Step 1: Write the failing multi-select tests**

Create `components/users/__tests__/role-multi-select.test.tsx`:

```tsx
import { render, screen, fireEvent } from "@testing-library/react"
import { RoleMultiSelect, toggleRole } from "../role-multi-select"

describe("toggleRole", () => {
  it("adds a role", () => {
    expect(toggleRole(["BURSAR"], "MINISTER")).toEqual(["BURSAR", "MINISTER"])
  })

  it("removes a selected role", () => {
    expect(toggleRole(["BURSAR", "MINISTER"], "BURSAR")).toEqual(["MINISTER"])
  })

  it("ADMIN replaces everything", () => {
    expect(toggleRole(["BURSAR", "MINISTER"], "ADMIN")).toEqual(["ADMIN"])
  })

  it("picking another role clears ADMIN", () => {
    expect(toggleRole(["ADMIN"], "BURSAR")).toEqual(["BURSAR"])
  })
})

describe("RoleMultiSelect", () => {
  it("reports the new selection when a box is checked", () => {
    const onChange = jest.fn()
    render(<RoleMultiSelect id="roles" value={["BURSAR"]} onChange={onChange} />)

    fireEvent.click(screen.getByLabelText(/Ministro/))

    expect(onChange).toHaveBeenCalledWith(["BURSAR", "MINISTER"])
  })

  it("reflects the current selection", () => {
    render(<RoleMultiSelect id="roles" value={["BURSAR", "MINISTER"]} onChange={jest.fn()} />)

    expect(screen.getByLabelText(/Tesorero/)).toBeChecked()
    expect(screen.getByLabelText(/Ministro/)).toBeChecked()
    expect(screen.getByLabelText(/Finanzas/)).not.toBeChecked()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test components/users/__tests__/role-multi-select.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the component**

Create `components/users/role-multi-select.tsx`:

```tsx
"use client"

import { USER_ROLES, ROLE_LABEL } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"

const OPTIONS: { role: UserRole; hint: string }[] = [
  { role: USER_ROLES.ADMIN, hint: "Acceso total (no se combina)" },
  { role: USER_ROLES.BURSAR, hint: "Ingreso y aprobación" },
  { role: USER_ROLES.FINANCE, hint: "Gestión contable" },
  { role: USER_ROLES.MINISTER, hint: "Solicitudes de fondos" }
]

// ADMIN is exclusive (mirrors users_roles_valid): checking it clears the rest, and checking
// any other role clears it.
export function toggleRole(current: UserRole[], role: UserRole): UserRole[] {
  if (current.includes(role)) return current.filter((r) => r !== role)
  if (role === USER_ROLES.ADMIN) return [USER_ROLES.ADMIN]
  return [...current.filter((r) => r !== USER_ROLES.ADMIN), role]
}

export function RoleMultiSelect({
  id,
  value,
  onChange,
  disabled
}: {
  id: string
  value: UserRole[]
  onChange: (roles: UserRole[]) => void
  disabled?: boolean
}) {
  return (
    <div id={id} role="group" aria-label="Roles" className="grid gap-2">
      {OPTIONS.map(({ role, hint }) => (
        <label
          key={role}
          className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-border px-3 py-2 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
        >
          <input
            type="checkbox"
            className="size-4"
            checked={value.includes(role)}
            disabled={disabled}
            onChange={() => onChange(toggleRole(value, role))}
          />
          <span className="font-bold">{ROLE_LABEL[role]}</span>
          <span className="text-muted-foreground">— {hint}</span>
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test components/users/__tests__/role-multi-select.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Convert the users manager**

In `components/users/users-manager.tsx`:

1. Imports: add `hasRole` to the `@/lib/constants/roles` import and add
   `import { RoleMultiSelect } from "@/components/users/role-multi-select"`.
2. `UserRow`: `role: UserRole` → `roles: UserRole[]`.
3. In `UserListItem`, replace the single role `<Badge>` with:
```tsx
        {user.roles.map((role) => (
          <Badge
            key={role}
            variant={ROLE_BADGE_VARIANT[role]}
            className="hidden sm:inline-flex uppercase tracking-wide"
          >
            {ROLE_LABEL[role]}
          </Badge>
        ))}
```
   and replace `user.role !== USER_ROLES.ADMIN && user.status === "ACTIVE"` with `!hasRole(user, USER_ROLES.ADMIN) && user.status === "ACTIVE"` (same change for `editingUser.role !== USER_ROLES.ADMIN` in the account-actions block).
4. `groups` memo: `members: filtered.filter((u) => u.roles.includes(role))` (a multi-role user appears in each of their groups).
5. Create form: `defaultValues: { full_name: "", email: "", roles: inviteMinister ? [USER_ROLES.MINISTER] : [USER_ROLES.BURSAR] }`; replace `const selectedRole = useWatch({ control: createForm.control, name: "role" })` with `const selectedRoles = useWatch({ control: createForm.control, name: "roles" }) ?? []`.
6. Create dialog: replace the `<NativeSelect id="new-role" ...>...</NativeSelect>` block and the four `selectedRole === ...` Alerts with:
```tsx
              <Field data-invalid={!!createForm.formState.errors.roles || undefined}>
                <FieldLabel htmlFor="new-role">Nivel de acceso</FieldLabel>
                <RoleMultiSelect
                  id="new-role"
                  value={selectedRoles}
                  onChange={(roles) =>
                    createForm.setValue("roles", roles, { shouldValidate: true })
                  }
                />
                <FieldError errors={[createForm.formState.errors.roles]} />
              </Field>

              {selectedRoles.map((role) => {
                const help = ROLE_HELP[role]
                return help ? (
                  <Alert key={role} variant="info">
                    <AlertTitle>{help.title}</AlertTitle>
                    <AlertDescription>{help.description}</AlertDescription>
                  </Alert>
                ) : null
              })}
```
   (Remove the now-duplicated `<Field>` / `<FieldLabel htmlFor="new-role">` that wrapped the old select.) Define `ROLE_HELP` above `UsersManager`, reusing the existing alert texts verbatim:
```tsx
const ROLE_HELP: Partial<Record<UserRole, { title: string; description: string }>> = {
  ADMIN: {
    title: "Acceso total al sistema",
    description:
      "Puede invitar y eliminar usuarios, ver todos los movimientos, crear y anular registros contables, y acceder a los reportes. Asigna este rol solo a personas de plena confianza."
  },
  BURSAR: {
    title: "Tesorero — Ingreso y aprobación",
    description:
      "Puede crear, editar y anular movimientos contables, y aprobar o rechazar solicitudes de fondos de ministros. No puede gestionar usuarios ni configurar el sistema."
  },
  FINANCE: {
    title: "Finanzas — Monitoreo de registros",
    description:
      "Puede consultar movimientos y el flujo de solicitudes, pero no puede crear, editar ni aprobar ningún registro. Rol de supervisión financiera."
  },
  MINISTER: {
    title: "Solicitudes de fondos",
    description:
      "Puede enviar solicitudes de fondos para su ministerio y rendir los gastos correspondientes. No tiene acceso a movimientos contables ni configuración."
  }
}
```
7. `openEdit`: `editForm.reset({ id: user.id, full_name: user.full_name, roles: user.roles, status: user.status })`. Add `const editRoles = useWatch({ control: editForm.control, name: "roles" }) ?? []` beside `selectedRoles`.
8. Edit dialog: replace the `<Field>` containing `<NativeSelect id="edit-role" ...>` with:
```tsx
                  <Field data-invalid={!!editForm.formState.errors.roles || undefined}>
                    <FieldLabel htmlFor="edit-role">Roles</FieldLabel>
                    {editingUser.roles.includes(USER_ROLES.DELEGATE) ? (
                      <Badge variant={ROLE_BADGE_VARIANT[USER_ROLES.DELEGATE]}>
                        {ROLE_LABEL[USER_ROLES.DELEGATE]}
                      </Badge>
                    ) : (
                      <RoleMultiSelect
                        id="edit-role"
                        value={editRoles}
                        onChange={(roles) =>
                          editForm.setValue("roles", roles, { shouldValidate: true })
                        }
                      />
                    )}
                    <FieldError errors={[editForm.formState.errors.roles]} />
                  </Field>
```
   (`editingUser` is non-null inside the dialog body; if TypeScript complains, use `editingUser?.roles.includes(...)`.) The `NativeSelect` import stays — the status field still uses it. If `ROLE_ORDER` is no longer referenced anywhere but the group memo, keep its import; remove any import `pnpm lint` reports unused.
9. `currentUser.role === USER_ROLES.ADMIN` → `hasRole(currentUser, USER_ROLES.ADMIN)`.

- [ ] **Step 6: Role displays elsewhere**

- `app/(dashboard)/layout.tsx`: import `hasAnyRole`, replace
  `if (user.role === "MINISTER" || user.role === "DELEGATE") {`
  with
  `if (hasAnyRole(user, ["MINISTER", "DELEGATE"])) {`
  and in the `AppSidebar` user prop replace `role: user.role,` with `roles: user.roles,`.
- `components/dashboard/nav-user.tsx`: prop type `role: string` → `roles: string[]`; `{roleLabel(user.role)}` → `{rolesLabel(user.roles)}`; swap `roleLabel` for `rolesLabel` in its import. Update the one place that passes the prop (the sidebar already passes `user` through; if it builds an object, use `roles: user.roles`).
- `components/dashboard/impersonation-banner.tsx`: `{roleLabel(user.role)}` → `{rolesLabel(user.roles)}` (and the import).
- `app/(dashboard)/profile/page.tsx`: `{roleLabel(user.role)}` → `{rolesLabel(user.roles)}` (and the import).

- [ ] **Step 7: Write the failing audit-diff test**

Create `components/audit/__tests__/audit-diff.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react"
import { AuditDiff } from "../audit-diff"

describe("AuditDiff roles", () => {
  it("does not report an unchanged roles array as changed", () => {
    const { container } = render(
      <AuditDiff
        previous={{ roles: ["BURSAR", "MINISTER"], status: "ACTIVE" }}
        next={{ roles: ["BURSAR", "MINISTER"], status: "ACTIVE" }}
      />
    )

    expect(container).toBeEmptyDOMElement()
  })

  it("shows roles as Spanish labels, before and after", () => {
    render(
      <AuditDiff
        previous={{ roles: ["BURSAR"] }}
        next={{ roles: ["BURSAR", "MINISTER"] }}
      />
    )

    expect(screen.getByText("Roles:")).toBeInTheDocument()
    expect(screen.getByText("Tesorero")).toBeInTheDocument()
    expect(screen.getByText("Tesorero · Ministro")).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Run to verify it fails**

Run: `pnpm test components/audit/__tests__/audit-diff.test.tsx`
Expected: FAIL — the unchanged array renders a row, and the label is `Roles` title-cased from the key but the value prints `BURSAR,MINISTER`.

- [ ] **Step 9: Make the audit diff array-aware**

In `components/audit/audit-diff.tsx`:
- Import `rolesLabel`: `import { rolesLabel } from "@/lib/constants/roles"`.
- Add to `KEY_LABEL`: `roles: "Roles",` (keep `role: "Rol"` for old audit rows).
- In `formatValue`, add before the final `return String(value)`:
```ts
  if (key === "roles" && Array.isArray(value)) return rolesLabel(value.map(String))
```
- In `AuditDiff`'s key filter replace `(key) => prev[key] !== nxt[key]` with
  `(key) => JSON.stringify(prev[key]) !== JSON.stringify(nxt[key])`.

- [ ] **Step 10: Run to verify it passes**

Run: `pnpm test components/audit components/users`
Expected: PASS.

- [ ] **Step 11: Make CI green**

Run: `pnpm run ci`
Expected: lint (zero warnings) and typecheck both pass. Fix every remaining `role` reference they report (unused imports from earlier tasks, `user.role` reads in files this plan missed). For each file reported, apply the same pattern: `.role` → `.roles` / `hasRole` / `rolesLabel`. Do not use `any` or `@ts-expect-error` to silence a real mismatch.

Then run: `pnpm test`
Expected: every suite passes. The two files under `services/__integration__/` still insert `role` — they are fixed in Task 8 and are skipped automatically only when Supabase is not local; if they fail here, that is expected until Task 8.

- [ ] **Step 12: Commit**

```bash
git add app components lib
git commit -m "feat(users): multi-role create/edit dialogs and role displays

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 8: RLS integration tests, e2e, docs and final verification

**Files:**
- Modify: `services/__integration__/purge-user.test.ts:36`
- Create: `services/__integration__/multi-role-rls.test.ts`
- Modify: `e2e/09-user-purge.spec.ts:32`, `e2e/08-account-recovery.spec.ts:34`, `e2e/04-ministries.spec.ts:5`
- Modify: `docs/roles.md`, `docs/architecture.md`, `CLAUDE.md` (role/ministries/budgets sentences)

**Interfaces:**
- Consumes: the migrated local DB from Task 1; `has_any_role` RPC; `users_roles_valid` CHECK.

- [ ] **Step 1: Fix the existing integration and e2e inserts**

- `services/__integration__/purge-user.test.ts:36`: `role: "FINANCE"` → `roles: ["FINANCE"]`.
- `e2e/09-user-purge.spec.ts:32`: `role: "FINANCE"` → `roles: ["FINANCE"]`.
- `e2e/08-account-recovery.spec.ts:34`: `role: "ADMIN",` → `roles: ["ADMIN"],`.
- `e2e/04-ministries.spec.ts:5`: describe title `"Ministries (ADMIN/BURSAR) + Remanente (Etapa 7)"` → `"Ministries (ADMIN) + Remanente (Etapa 7)"`.
- `e2e/fixtures/users.ts` has a `role:` field on the fixture objects used only as a label; leave it.

- [ ] **Step 2: Write the RLS integration test**

Create `services/__integration__/multi-role-rls.test.ts`:

```ts
/**
 * @jest-environment node
 *
 * Multi-role RLS integration tests. Require a running local Supabase instance.
 * Skipped automatically when NEXT_PUBLIC_SUPABASE_URL is not set or not local.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""
const PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ""
const SECRET_KEY = process.env.SUPABASE_SECRET_KEY ?? ""

const isLocal =
  SUPABASE_URL.startsWith("http://127.0.0.1") || SUPABASE_URL.startsWith("http://localhost")

const describeIfLocal = isLocal && SUPABASE_URL && SECRET_KEY ? describe : describe.skip

type Role = Database["public"]["Enums"]["user_role"]
const PASSWORD = "Testing123!multi"

describeIfLocal("RLS: users with several roles", () => {
  let adminClient: SupabaseClient<Database> | undefined
  const getAdmin = () => (adminClient ??= createClient<Database>(SUPABASE_URL, SECRET_KEY))
  const createdIds: string[] = []
  const createdPaymentMethodIds: string[] = []

  // Creates an auth user + profile with the given roles and returns a client signed in as them.
  async function signedInAs(label: string, roles: Role[]) {
    const email = `multirole-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`
    const { data, error } = await getAdmin().auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true
    })
    expect(error).toBeNull()
    const id = data.user!.id
    createdIds.push(id)

    const { error: profileError } = await getAdmin()
      .from("users")
      .insert({ id, full_name: `Multi ${label}`, email, roles, status: "ACTIVE" })
    expect(profileError).toBeNull()

    const client = createClient<Database>(SUPABASE_URL, PUBLISHABLE_KEY)
    const { error: signInError } = await client.auth.signInWithPassword({
      email,
      password: PASSWORD
    })
    expect(signInError).toBeNull()
    return client
  }

  afterAll(async () => {
    for (const id of createdPaymentMethodIds) {
      await getAdmin().from("payment_methods").delete().eq("id", id)
    }
    for (const id of createdIds) {
      await getAdmin().rpc("purge_user", { p_user_id: id })
    }
  })

  it("has_any_role matches when any one of the user's roles overlaps", async () => {
    const client = await signedInAs("bm", ["BURSAR", "MINISTER"])

    const bursar = await client.rpc("has_any_role", { p_roles: ["BURSAR"] })
    const minister = await client.rpc("has_any_role", { p_roles: ["MINISTER"] })
    const admin = await client.rpc("has_any_role", { p_roles: ["ADMIN"] })

    expect(bursar.data).toBe(true)
    expect(minister.data).toBe(true)
    expect(admin.data).toBe(false)
  })

  it("a bursar+minister keeps bursar write access", async () => {
    const client = await signedInAs("bm-write", ["BURSAR", "MINISTER"])

    const { data, error } = await client
      .from("payment_methods")
      .insert({ name: `multi-role-${Date.now()}` })
      .select("id")
      .single()

    expect(error).toBeNull()
    if (data) createdPaymentMethodIds.push(data.id)
  })

  it("a finance+minister cannot do bursar writes", async () => {
    const client = await signedInAs("fm", ["FINANCE", "MINISTER"])

    const { error } = await client.from("payment_methods").insert({ name: "should-fail" })

    expect(error?.message).toMatch(/row-level security/i)
  })

  it("a bursar+minister cannot create ministries (ADMIN-only)", async () => {
    const client = await signedInAs("bm-min", ["BURSAR", "MINISTER"])

    const { error } = await client.from("ministries").insert({ name: "should-fail" })

    expect(error?.message).toMatch(/row-level security/i)
  })

  it("an ADMIN can still create ministries", async () => {
    const client = await signedInAs("adm", ["ADMIN"])

    const { data, error } = await client
      .from("ministries")
      .insert({ name: `multi-role-admin-${Date.now()}` })
      .select("id")
      .single()

    expect(error).toBeNull()
    if (data) await getAdmin().from("ministries").delete().eq("id", data.id)
  })

  it("the CHECK constraint rejects invalid role sets", async () => {
    const id = (await getAdmin().auth.admin.createUser({
      email: `multirole-check-${Date.now()}@example.test`,
      email_confirm: true
    })).data.user!.id
    createdIds.push(id)

    const base = { id, full_name: "Check", email: `check-${id}@example.test`, status: "ACTIVE" as const }
    for (const roles of [[], ["ADMIN", "BURSAR"], ["DELEGATE", "MINISTER"], ["BURSAR", "BURSAR"]]) {
      const { error } = await getAdmin()
        .from("users")
        .insert({ ...base, roles: roles as Role[] })
      expect(error?.message).toMatch(/users_roles_valid_check/)
    }
  })
})
```

- [ ] **Step 3: Run the integration tests against the local DB**

Run: `set -a; source .env.local 2>/dev/null; set +a; pnpm test services/__integration__`
(If the env vars are already exported in your shell, skip the `source`.) Expected: PASS for `multi-role-rls`, `purge-user` and `rls`. If the suite reports as skipped, `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` are not set to the local stack — take the values from `pnpm supabase status` and re-run.

- [ ] **Step 4: Update the docs**

- `CLAUDE.md`: in **Architecture → Roles**, add after the four-role sentence: "A user can hold several of `BURSAR`/`FINANCE`/`MINISTER` (`users.roles` is an array; `ADMIN` and `DELEGATE` are never combined). Permissions are the union of the roles. RLS checks roles with `has_any_role(ARRAY[...])`, never `get_my_role()`. TS code uses `hasRole`/`hasAnyRole` from `lib/constants/roles.ts`." In **Ministries**, change "Managed at `/ministries`" to "Managed by ADMIN only at `/ministries`; budgets live at `/budgets` (`MANAGE_BUDGETS`)". In **Database schema** nothing else changes.
- `docs/roles.md` and `docs/architecture.md`: wherever they describe the single `role` column, `get_my_role()` or `create_user_with_role`, update to `roles`, `has_any_role` and `usersService.invite`; mention that BURSAR no longer holds `MANAGE_MINISTRIES`. Find the lines with `grep -n "get_my_role\|create_user_with_role\|users.role\|MANAGE_MINISTRIES" docs/roles.md docs/architecture.md`.

- [ ] **Step 5: Final verification**

Run each and confirm the output, not just the exit code:
1. `pnpm run ci` → lint and typecheck pass with zero warnings.
2. `pnpm test` → all suites pass; the integration suites ran (not skipped) because the local stack is up.
3. `grep -rn "get_my_role" app lib services components --include='*.ts' --include='*.tsx'` → no matches.
4. `grep -rnE "\.role\b" app lib services components --include='*.ts' --include='*.tsx' | grep -v __tests__ | grep -v database.types` → only matches that are unrelated to `users.role` (for example Supabase `auth` objects or `aria` `role=` attributes). Investigate any `user.role` / `u.role` hit.
5. Manual check in the running app (`pnpm dev`, local stack seeded): sign in as `e2e-admin@local.test`, open Users → Editar on the e2e bursar, tick Ministro, save; reopen and confirm both roles persist and show as two badges; open Ministerios → the ministry → assign that user as minister (they now appear in the picker).
6. Optional (local only, not a CI gate): `pnpm test:e2e e2e/04-ministries.spec.ts e2e/09-user-purge.spec.ts e2e/08-account-recovery.spec.ts` against `pnpm dev`.

- [ ] **Step 6: Commit**

```bash
git add services/__integration__ e2e docs CLAUDE.md
git commit -m "test(roles): multi-role RLS integration tests, docs and e2e fixes

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 7: Report to the owner**

In the hand-off message, state plainly:
- Verification results from Step 5 (what passed, what was skipped and why).
- The decisions the owner should confirm: (a) a bursar+minister can review their own ministry's request — nothing blocks it; (b) `ministry_delegates` write policies still allow BURSAR (the spec only narrowed `ministries` and `ministry_assignments`); (c) ADMIN now sees the full reviewer view on `/requests`; (d) `create_user_with_role` was dropped as unused.
- That the branch is not pushed and no PR was opened.
