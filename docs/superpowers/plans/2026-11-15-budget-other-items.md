# Presupuesto: ítems que no son ministerio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `/budgets` budget free-form items (remuneraciones, directorio, asociaciones…) in the same single table as ministries, ministries grouped first.

**Architecture:** New `budget_items` table (per period, optional `movement_categories` link) plus an RPC `get_budget_items_summary` that computes "used" from EXPENSE movements of the linked category. `ministry_budgets` and its RPC are untouched. The page fetches both summaries and `MinistryBudgetAdmin` renders one unified table.

**Tech Stack:** Next.js 16, Supabase/Postgres (RLS + SECURITY DEFINER RPC), Zod, React Hook Form, Jest.

**Spec:** `docs/superpowers/specs/2026-11-15-budget-other-items-design.md`

## Global Constraints

- Identifiers/DB/files in English; UI text, Zod messages, toasts in Spanish.
- Migration via `pnpm supabase migration new budget_items`; apply with `pnpm supabase migration up` (never `db reset`); then `pnpm types:generate` (never edit `types/database.types.ts`).
- RLS uses `has_any_role(ARRAY[...])`, never `get_my_role()`. Permission is `MANAGE_BUDGETS` via `can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)`.
- No physical deletes: items are deactivated (`is_active = false`).
- Budgets stay informational: no blocking of expenses.
- Services never called with a raw Supabase client from routes/actions; every mutation calls `auditService.logSystem`.
- New `createSupabaseAdminClient` callers must be added to the `ALLOWED` grep in `.github/workflows/ci.yml`.
- Style: no semicolons, double quotes, printWidth 100, no trailing commas. `pnpm run ci` and `pnpm test` must pass.
- Work on a feature branch from fresh `origin/main` (never commit to `main`).

## Review Focus

- Movement dated on the period's first/last day (`movement_date` is TIMESTAMPTZ): must count in the period.
- CANCELLED movements and INCOME movements in the linked category: must not count toward "used".
- Two items with the same name in the same period: friendly Spanish error, not a raw constraint message.
- Item linked to a category later deactivated: item still shows, with its category name.
- Linking an INCOME category: rejected with a Spanish message.
- No current period: page still shows the "No hay período vigente" empty state (no items table).
- Item overspent (`remaining < 0`): shown in destructive color, same as ministries.

---

### Task 1: Migration, RLS and generated types

**Files:**
- Create: `supabase/migrations/<timestamp>_budget_items.sql` (via CLI)
- Modify: `types/database.types.ts` (generated), `services/__integration__/rls.test.ts`

**Interfaces:**
- Produces: table `budget_items(id, budget_period_id, name, assigned_amount, initial_used_amount, category_id, notes, is_active, created_by, created_at, updated_at)`; RPC `get_budget_items_summary(p_period_id uuid default null) -> jsonb` array of `{ item_id, name, category_id, category_name, notes, assigned_amount, initial_used_amount, used_amount, remaining }`, active items only, ordered by name.

- [ ] **Step 1: Write the failing integration tests** in `rls.test.ts` (new `describeIfLocal` block mirroring the ministry_budgets one, with a self-contained period fixture torn down in `afterAll`, child rows first): anon cannot read `budget_items`; MINISTER can neither insert nor read `budget_items`; BURSAR can insert and update; admin RPC `get_budget_items_summary` with a period fixture returns `used_amount = initial + sum(EXPENSE, ACTIVE movements in linked category within dates)` — insert fixture movements on the first day, last day, one day outside, one CANCELLED, one INCOME in another linked-category-type, and assert only the first two count.
- [ ] **Step 2: Run** `pnpm test services/__integration__/rls.test.ts` — Expected: FAIL (relation `budget_items` does not exist).
- [ ] **Step 3: Create the migration** with `pnpm supabase migration new budget_items`. Table per Interfaces; `assigned_amount NUMERIC(12,2) CHECK (> 0)`, `initial_used_amount NUMERIC(12,2) DEFAULT 0 CHECK (>= 0)`, `budget_period_id` FK to `budget_periods`, `category_id` nullable FK to `movement_categories`, unique `(budget_period_id, lower(name))`, index on `budget_period_id`. RLS enabled: SELECT for `has_any_role(ARRAY['ADMIN','BURSAR','FINANCE'])`; INSERT/UPDATE for `has_any_role(ARRAY['ADMIN','BURSAR'])`; no DELETE policy. RPC modeled on `get_ministry_budget_summary` (supabase/migrations/20260922132320_add_ministry_budgets.sql): SECURITY DEFINER, `p_period_id` NULL = current period, `'[]'` if none, used = `initial_used_amount + COALESCE(SUM(m.amount),0)` over `movements m` where `m.category_id = bi.category_id AND m.movement_type = 'EXPENSE' AND m.status = 'ACTIVE' AND m.movement_date::date BETWEEN bp.start_date AND bp.end_date`; `REVOKE ... FROM PUBLIC; GRANT ... TO service_role`.
- [ ] **Step 4: Apply and regenerate**: `pnpm supabase migration up && pnpm types:generate`.
- [ ] **Step 5: Run** `pnpm test services/__integration__/rls.test.ts` — Expected: PASS.
- [ ] **Step 6: Commit** `feat(db): add budget_items table and summary RPC`.

### Task 2: Validators and service

**Files:**
- Create: `lib/validators/budget-item.ts`, `services/ministries/budget-items.service.ts`, `lib/validators/__tests__/budget-item.test.ts`, `services/ministries/__tests__/budget-items.service.test.ts`
- Modify: `.github/workflows/ci.yml` (add `services/ministries/budget-items\.service\.ts` to `ALLOWED`)

**Interfaces:**
- Produces (validators): `upsertBudgetItemSchema` (`id?`, `budget_period_id`, `name` min 2, `assigned_amount` coerce positive, `initial_used_amount` coerce >= 0 default 0, `category_id` nullable optional, `notes?`), `setBudgetItemActiveSchema` (`id`, `is_active: boolean`); types `UpsertBudgetItemInput`, `SetBudgetItemActiveInput`. Reuse the uuid/regex helpers pattern from `lib/validators/ministry-budget.ts` (not `z.string().uuid()`).
- Produces (service): `type BudgetItemSummaryRow` (fields as in Task 1 RPC; `category_id`/`category_name`/`notes` nullable); `budgetItemsService.upsertItem(db: DB, input: UpsertBudgetItemInput, userId: string)`, `.setActive(db: DB, input: SetBudgetItemActiveInput, userId: string)`, `.getSummary(periodId?: string): Promise<BudgetItemSummaryRow[]>`, `.listExpenseCategories(db: DB): Promise<{ id: string; name: string }[]>`.

- [ ] **Step 1: Write failing validator tests**: name of 1 char → "El nombre debe tener al menos 2 caracteres"; `assigned_amount: 0` → "El monto asignado debe ser mayor a 0"; negative initial → "El monto inicial utilizado no puede ser negativo"; `category_id: null` accepted.
- [ ] **Step 2: Write failing service tests** (mock admin client and `auditService`, following `services/*/__tests__` patterns): `upsertItem` inserts when no `id` and updates when `id`; Postgres unique violation (code `23505`) is rethrown as `Error("Ya existe un ítem con ese nombre en este período")`; selecting a category whose `movement_type` is `INCOME` throws `Error("Solo se pueden vincular categorías de egreso")` before writing; each mutation calls `auditService.logSystem` with entity `BUDGET_ITEM` and actions `BUDGET_ITEM_CREATED` / `BUDGET_ITEM_UPDATED` / `BUDGET_ITEM_DEACTIVATED` / `BUDGET_ITEM_ACTIVATED`; `getSummary` calls rpc `get_budget_items_summary` with `{ p_period_id }`.
- [ ] **Step 3: Run** `pnpm test lib/validators/__tests__/budget-item.test.ts services/ministries/__tests__/budget-items.service.test.ts` — Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** the validators and service. Mutations use the passed server `db` (RLS-enforced) exactly like `ministryBudgetService.upsertBudget`; `getSummary` uses the admin client like `ministryBudgetService.getSummary`; `listExpenseCategories` selects active `movement_categories` with `movement_type = 'EXPENSE'` ordered by name. Category type check queries `movement_categories` by id.
- [ ] **Step 5: Run** the same command plus `pnpm lint` — Expected: PASS, zero warnings.
- [ ] **Step 6: Commit** `feat(budgets): budget items validators and service`.

### Task 3: Server actions

**Files:**
- Create: `app/actions/budget-items.ts`, `app/actions/__tests__/budget-items.test.ts`

**Interfaces:**
- Consumes: Task 2 schemas and `budgetItemsService`.
- Produces: `upsertBudgetItem(input: UpsertBudgetItemInput)` and `setBudgetItemActive(input: SetBudgetItemActiveInput)`, both `"use server"`, returning the row.

- [ ] **Step 1: Write failing tests** following `app/actions/__tests__/ministry-budgets.test.ts` (same mocks): throws `"Sin permisos para gestionar presupuestos"` without `MANAGE_BUDGETS`; throws first Zod issue message on invalid input; on success calls the service with `(db, parsed, user.id)` and `revalidatePath("/budgets")`.
- [ ] **Step 2: Run** `pnpm test app/actions/__tests__/budget-items.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** both actions mirroring `app/actions/ministry-budgets.ts` (same `assertBudgetsAccess`/`parseOrThrow` shape; extract them to a shared local module only if it avoids duplication without touching the existing file's behavior).
- [ ] **Step 4: Run** the test file — Expected: PASS.
- [ ] **Step 5: Commit** `feat(budgets): budget item server actions`.

### Task 4: Page and unified table

**Files:**
- Modify: `app/(dashboard)/budgets/page.tsx`, `components/ministries/ministry-budget-admin.tsx`
- Create: `components/ministries/budget-item-dialog.tsx`, `components/ministries/__tests__/budget-rows.test.ts` (pure helper test), `components/ministries/budget-rows.ts` (pure helper)

**Interfaces:**
- Consumes: `BudgetItemSummaryRow`, `upsertBudgetItem`, `setBudgetItemActive`, `budgetItemsService.getSummary/listExpenseCategories`.
- Produces: `buildBudgetRows(ministries, ministrySummary, itemSummary): BudgetRow[]` and `sumTotals(rows: BudgetRow[]): { assigned: number; used: number; remaining: number }` where `BudgetRow = { kind: "ministry" | "item"; id: string; name: string; categoryName?: string | null; assigned: number | null; initial: number; used: number | null; remaining: number | null }`. Ministries (active only, by name) first, then items (by name). `MinistryBudgetAdmin` gains props `itemSummary: BudgetItemSummaryRow[]` and `expenseCategories: { id: string; name: string }[]`.

- [ ] **Step 1: Write failing helper tests**: ministries always precede items regardless of names; inactive ministries excluded; ministry without a budget row has `assigned: null` and is excluded from totals; totals sum assigned/used/remaining across both kinds; a ministry and an item with the same name both appear.
- [ ] **Step 2: Run** `pnpm test components/ministries/__tests__/budget-rows.test.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** `budget-rows.ts`.
- [ ] **Step 4: Update `page.tsx`**: also fetch `budgetItemsService.getSummary()` and `listExpenseCategories(db)` in the existing `Promise.all`; pass new props; change the subtitle to "Presupuesto por ministerio y otros ítems para el período vigente."
- [ ] **Step 5: Update `MinistryBudgetAdmin`**: render ONE table from `buildBudgetRows` (single header, add a "Tipo" chip column: "Ministerio"/"Otro", no section headings). Item rows use the same editable Asignado/Usado inicial inputs as ministries, show category name under the item name when linked, and an actions cell with edit (opens `BudgetItemDialog`) and desactivar (calls `setBudgetItemActive`, toast "Ítem desactivado"). Last body row is a "+ Agregar ítem" button opening the dialog in create mode; a footer row "Total" uses `sumTotals`. "Guardar cambios" saves ministry budgets (existing behavior) and changed item rows via `upsertBudgetItem`. Keep the "No hay período vigente" empty state and hide the add button there. Mobile: keep `overflow-x-auto` and raise `min-w` for the extra column.
- [ ] **Step 6: Implement `BudgetItemDialog`** (React Hook Form + `upsertBudgetItemSchema`, fields Nombre, Categoría opcional select from `expenseCategories` with a "Sin categoría (manual)" option, Asignado, Usado inicial, Notas); on success toast "Ítem guardado" and `router.refresh()`; errors from the action shown via toast.
- [ ] **Step 7: Verify**: `pnpm run ci && pnpm test` pass; run the app (`pnpm dev`), open `/budgets` with `pnpm test:e2e`-seeded data, add an item linked to "Remuneraciones", and confirm Usado matches that category's movements in the period. Capture a screenshot for the PR.
- [ ] **Step 8: Commit** `feat(budgets): unified budget table with non-ministry items`.

### Task 5: PR

- [ ] **Step 1:** `git fetch origin && git rebase origin/main`; run `pnpm run ci && pnpm test`.
- [ ] **Step 2:** `git push -u origin <branch>` and `gh pr create --base main` with a summary, the screenshot, and the PR footer from the attribution rules. Do not merge.
