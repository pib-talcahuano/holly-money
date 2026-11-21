# Presupuesto: sub-ítems, fondo por solicitud, años y eliminar ministerio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sub-ítems de presupuesto con restante visible, fondo elegido por tesorería al aprobar, presupuestos por año (marzo a febrero) y eliminación de ministerios por ADMIN.

**Architecture:** Nueva tabla `budget_sub_items` colgada de `ministry_budgets` o `budget_items`; `budget_intentions` gana `budget_sub_item_id` opcional; los restantes salen de RPC `SECURITY DEFINER` solo para `service_role` (patrón existente). `budget_periods` gana `year` único y las fechas se derivan del año.

**Tech Stack:** Next.js 16 server actions, Supabase (Postgres + RLS), Zod, React Hook Form, Jest.

**Spec:** `docs/superpowers/specs/2026-11-20-budget-subitems-design.md`

## Global Constraints

- Presupuesto informativo: nunca bloquear una solicitud por restante insuficiente.
- Total de un padre con sub-ítems activos = suma de sus `assigned_amount`; no se guarda en columna.
- Año de presupuesto: inicio 1 de marzo del año, fin último día de febrero del año siguiente.
- Restante con signo real (puede ser negativo), nunca recortado a cero.
- Textos de UI, mensajes Zod y toasts en español; identificadores, tablas y columnas en inglés.
- Migraciones con `pnpm supabase migration new <nombre>` y aplicar con `pnpm supabase migration up` (nunca `db reset`); luego `pnpm types:generate`.
- Funciones `SECURITY DEFINER` nuevas: `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role`.
- Mutaciones pasan por la capa de servicio y `auditService.logSystem`. Todo archivo nuevo que importe `createSupabaseAdminClient` se agrega al `ALLOWED` de `.github/workflows/ci.yml`.
- Autorización con `can(user.permissions, PERMISSIONS.X)`, nunca comparando nombres de rol. Estilo: sin punto y coma, comillas dobles, `printWidth` 100.
- Rama nueva desde `origin/main` actualizado; nunca push a `main`; PR por entrega.

## Review Focus

1. Un ministerio con monto asignado y sin sub-ítems recibe su primer sub-ítem: el total pasa a ser la suma y el monto anterior deja de contar. La UI debe avisarlo antes de guardar.
2. Crear un año que ya existe: error claro en español, no el error crudo de unicidad de Postgres.
3. Fin de período en año bisiesto: el presupuesto 2027 termina el 29 de febrero de 2028.
4. Eliminar un ministerio que solo tiene historial "oculto" (asignación desactivada, delegado removido, ministerio con presupuesto de años pasados): debe bloquearse, no borrar.
5. Fondo apuntando a un sub-ítem de otro ministerio, o a uno desactivado después de asignarse: lo primero se rechaza; lo segundo sigue contando en el restante.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/<ts>_delete_ministry.sql` | Función `delete_ministry_if_unused` |
| `supabase/migrations/<ts>_budget_period_year.sql` | `budget_periods.year`, backfill, unicidad |
| `supabase/migrations/<ts>_budget_sub_items.sql` | Tabla, RLS, `budget_intentions.budget_sub_item_id` + trigger |
| `supabase/migrations/<ts>_budget_summary_with_sub_items.sql` | RPC `get_budget_sub_items_summary` y ajustes a los resúmenes de padres |
| `services/ministries/ministries.service.ts` | `delete(db, id, userId)` |
| `services/ministries/ministry-budget.service.ts` | `createPeriodForYear`, `listPeriods`, `copyFromPeriod` |
| `services/ministries/budget-sub-items.service.ts` (nuevo) | CRUD de sub-ítems y resumen |
| `services/intentions/intentions.service.ts` | `review` acepta fondo; `setFund` |
| `lib/validators/budget-sub-item.ts` (nuevo) | Schemas Zod de sub-ítems |
| `lib/validators/ministry-budget.ts`, `lib/validators/intention.ts` | Schema por año; `fund_sub_item_id` en revisión |
| `app/actions/budget-sub-items.ts` (nuevo), `ministry-budgets.ts`, `ministries.ts`, `requests.ts` | Acciones |
| `components/ministries/*`, `components/intentions/intention-detail-client.tsx` | UI |

---

### Task 1: Eliminar ministerio

**Files:**
- Create: migración `delete_ministry`
- Modify: `services/ministries/ministries.service.ts`, `app/actions/ministries.ts`, `lib/validators/ministry.ts`, `components/ministries/ministries-client.tsx`
- Test: `services/ministries/__tests__/ministries.service.test.ts` (nuevo), `services/__integration__/rls.test.ts`

**Interfaces:**
- Produces: SQL `delete_ministry_if_unused(p_ministry_id UUID) RETURNS JSONB` → `{ "deleted": true }` o `{ "deleted": false, "blockers": { "<tabla>": <n> } }`. `ministriesService.delete(db: DB, id: string, userId: string): Promise<{ deleted: true } | { deleted: false; blockers: Record<string, number> }>`. Action `deleteMinistry(id: string, confirmName: string)`.

- [ ] **Step 1: Test del servicio** `ministriesService.delete`: con RPC devolviendo `{ deleted: true }` registra auditoría `MINISTRY_DELETED` con el nombre; con `{ deleted: false, blockers: { budget_intentions: 2 } }` no registra auditoría y devuelve los bloqueos.
- [ ] **Step 2: Correr** `pnpm test services/ministries/__tests__/ministries.service.test.ts` → FAIL (método no existe).
- [ ] **Step 3: Migración.** La función cuenta filas en `budget_intentions`, `ministry_assignments`, `ministry_delegates`, `ministry_budgets` y en `movements` si éstos referencian al ministerio (buscar con `grep -n "ministry" supabase/migrations/*.sql` cualquier otra FK a `ministries`). Si todo es cero borra y devuelve `deleted: true`; si no, devuelve los conteos. `SECURITY DEFINER`, permisos solo `service_role`.
- [ ] **Step 4: Implementar** `ministriesService.delete` llamando el RPC con el cliente admin (agregar `services/ministries/ministries.service.ts` al `ALLOWED` de CI) y `auditService.logSystem({ entity: "MINISTRY", action: "MINISTRY_DELETED", ... })`.
- [ ] **Step 5: Acción** `deleteMinistry`: exige `can(permissions, PERMISSIONS.MANAGE_MINISTRIES)` (ya es solo ADMIN, **decisión mía**: no crear permiso nuevo); verifica que `confirmName` sea igual al nombre; si hay bloqueos lanza `Error("No se puede eliminar: tiene historial. Puedes desactivarlo.")`.
- [ ] **Step 6: UI.** En la edición del ministerio, botón "Eliminar ministerio" con diálogo que pide escribir el nombre; si la acción informa bloqueos, el diálogo ofrece "Desactivar" (usa `updateMinistry` con `is_active: false`).
- [ ] **Step 7: Verificar** `pnpm test`, `pnpm run ci`. Esperado: todo verde.
- [ ] **Step 8: Commit** `feat(ministries): eliminar ministerio sin historial (ADMIN)`.

### Task 2: Presupuestos por año

**Files:**
- Create: migración `budget_period_year`
- Modify: `services/ministries/ministry-budget.service.ts`, `lib/validators/ministry-budget.ts`, `app/actions/ministry-budgets.ts`, `app/(dashboard)/budgets/page.tsx`, `components/ministries/ministry-budget-admin.tsx`
- Test: `services/ministries/__tests__/ministry-budget.service.test.ts` (nuevo), `lib/validators/__tests__/ministry-budget.test.ts`

**Interfaces:**
- Produces: `budgetPeriodRange(year: number): { start_date: string; end_date: string }` en `lib/utils/budget-period.ts` (`2026` → `2026-03-01` / `2027-02-28`; `2027` → `2027-03-01` / `2028-02-29`). `ministryBudgetService.createPeriodForYear(db, year: number, userId: string)` y `listPeriods(db)` ordenado por `year` desc. `createBudgetPeriodSchema = { year: int 2000..2100 }`.

- [ ] **Step 1: Tests** de `budgetPeriodRange` (los tres valores de arriba, más 2024→`2025-02-28`) y de `createPeriodForYear`: año existente lanza `Error("Ya existe un presupuesto para ese año")` ante el código `23505`.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Migración.** Agregar `year INT`, backfill con `EXTRACT(year FROM start_date)`; antes del `SET NOT NULL`/`UNIQUE`, un bloque `DO` que falle con mensaje listando años duplicados (Review Focus: resolver a mano). Mantener la restricción `budget_periods_no_overlap`.
- [ ] **Step 4: Implementar** `budgetPeriodRange` y `createPeriodForYear` (label `Presupuesto {year}`; auditoría `BUDGET_PERIOD_CREATED`). `upsertBudgetPeriod` y su schema se reemplazan por la creación por año; se quita el formulario de fechas.
- [ ] **Step 5: UI.** `/budgets` recibe `?year=` y lista los períodos en un selector (por defecto el que contiene hoy; si no hay, el más reciente). Botón "Crear presupuesto {año}" (año sugerido: siguiente al máximo existente). Los servicios de resumen (`getSummary`, `budgetItemsService.getSummary`) reciben el `period_id` del año seleccionado.
- [ ] **Step 6: Verificar** `pnpm test`, `pnpm run ci`.
- [ ] **Step 7: Commit** `feat(budgets): presupuestos por año con fechas de marzo a febrero`.

### Task 3: Sub-ítems (tabla, RLS, servicio)

**Files:**
- Create: migración `budget_sub_items` (parte tabla/RLS), `lib/validators/budget-sub-item.ts`, `services/ministries/budget-sub-items.service.ts`, `app/actions/budget-sub-items.ts`
- Test: `services/ministries/__tests__/budget-sub-items.service.test.ts`, `services/__integration__/rls.test.ts`

**Interfaces:**
- Produces: tabla `budget_sub_items(id, ministry_budget_id NULL, budget_item_id NULL, name, assigned_amount NUMERIC(12,2) CHECK > 0, category_id NULL, notes, is_active, created_by, created_at, updated_at)` con `CHECK ((ministry_budget_id IS NULL) <> (budget_item_id IS NULL))` e índice único `(coalesce(ministry_budget_id, budget_item_id), lower(name)) WHERE is_active`. `upsertSubItemSchema`, `setSubItemActiveSchema`. `budgetSubItemsService.upsert(db, input, userId)`, `setActive(db, input, userId)`, `list(db, parent: { ministry_budget_id } | { budget_item_id })`.
- Consumes: `assertExpenseCategory` (extraer de `budget-items.service.ts` a un módulo compartido `services/ministries/budget-category.ts`).

- [ ] **Step 1: Tests.** `upsert` con `ministry_budget_id` y `budget_item_id` a la vez falla en el schema; con categoría que no es de egreso lanza `"Solo se pueden vincular categorías de egreso"`; categoría en sub-ítem de ministerio se rechaza (solo aplica a ítems que no son ministerio); nombre duplicado activo lanza `"Ya existe un sub-ítem con ese nombre"`. Auditoría `BUDGET_SUB_ITEM_CREATED/UPDATED/DEACTIVATED`.
- [ ] **Step 2: Test RLS** (`rls.test.ts`): ADMIN y BURSAR insertan; FINANCE lee pero no inserta; MINISTER lee solo los de su ministerio asignado; sin política DELETE.
- [ ] **Step 3: Correr y ver fallar.**
- [ ] **Step 4: Migración y servicio** siguiendo el patrón de `20261115175814_budget_items.sql` y `budget-items.service.ts`. Las políticas usan `has_any_role(ARRAY[...])` y `get_my_active_ministries()`, nunca `get_my_role()`.
- [ ] **Step 5: Acciones** con `assertBudgetsAccess` como en `app/actions/budget-items.ts`.
- [ ] **Step 6: Verificar** (`pnpm supabase migration up`, `pnpm types:generate`, `pnpm test`, `pnpm run ci`).
- [ ] **Step 7: Commit** `feat(budgets): sub-ítems de presupuesto`.

### Task 4: Resúmenes con sub-ítems y restante

**Files:**
- Create: migración `budget_summary_with_sub_items`
- Modify: `services/ministries/budget-sub-items.service.ts`, `services/ministries/ministry-budget.service.ts`, `services/ministries/budget-items.service.ts`
- Test: `services/ministries/__tests__/budget-sub-items.service.test.ts` (resumen), `services/__integration__/rls.test.ts` (RPC)

**Interfaces:**
- Produces: RPC `get_budget_sub_items_summary(p_period_id UUID DEFAULT NULL) RETURNS JSONB` con filas `{ sub_item_id, parent_type: "MINISTRY"|"ITEM", ministry_id, budget_item_id, name, assigned_amount, used_amount, remaining }`. `budgetSubItemsService.getSummary(periodId?: string): Promise<BudgetSubItemSummaryRow[]>`. Los resúmenes de ministerio y de ítems devuelven `assigned_amount` = suma de sub-ítems activos si existen, y `ministry_summary.unassigned_used: number` (gasto de solicitudes sin fondo).

- [ ] **Step 1: Tests de la lógica de agregación** (función pura en `services/ministries/budget-rows.ts` o equivalente) con valores concretos: ministerio con sub-ítems 300 y 200, usado 120 en el primero y 50 sin asignar → padre asignado 500, usado 170, restante 330; un sub-ítem desactivado con 100 gastados sigue sumando su gasto; padre sin sub-ítems se comporta como hoy.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Migración.** Tomar la definición **vigente** de `get_ministry_budget_summary` (`grep -n "get_ministry_budget_summary" supabase/migrations/*.sql` y usar la última) y reutilizar sus reglas: TRANSFER aprobada con transferencia registrada por fecha de transferencia, REIMBURSEMENT aprobada por fecha de revisión, ambas dentro del período, ahora filtradas además por `budget_intentions.budget_sub_item_id`. Sub-ítems de ítems que no son ministerio usan los egresos de su `category_id` dentro de las fechas. Misma política de permisos (`service_role`).
- [ ] **Step 4: Servicio** `getSummary` y adaptar los dos servicios de resumen para que el padre calcule su total desde los sub-ítems.
- [ ] **Step 5: Verificar** `pnpm test`, `pnpm run ci`.
- [ ] **Step 6: Commit** `feat(budgets): restante por sub-ítem y total del padre como suma`.

### Task 5: Fondo por solicitud

**Files:**
- Create: migración (columna y trigger; puede ir en la de Task 3 si aún no se aplicó)
- Modify: `lib/validators/intention.ts`, `services/intentions/intentions.service.ts`, `app/actions/requests.ts`, `components/intentions/intention-detail-client.tsx`
- Test: `services/intentions/__tests__/intentions.service.test.ts`, `services/__integration__/rls.test.ts`

**Interfaces:**
- Consumes: `budget_sub_items` (Task 3).
- Produces: `budget_intentions.budget_sub_item_id UUID NULL REFERENCES budget_sub_items(id)`; trigger `BEFORE INSERT OR UPDATE OF budget_sub_item_id` que exige que el sub-ítem pertenezca a un `ministry_budgets` con el mismo `ministry_id`. `reviewIntentionSchema` gana `fund_sub_item_id: uuidSchema(...).optional()`. `intentionsService.setFund(db, id, subItemId: string | null, userId): Promise<void>`; rechaza si ya existe fila en `expense_settlements` para la solicitud (**decisión mía**: más simple y estricta que "no rendida").

- [ ] **Step 1: Tests.** `review` con `action: "APPROVED"` y `fund_sub_item_id` guarda el fondo y lo incluye en la auditoría; con `REJECTED` ignora el fondo; `setFund` con rendición existente lanza `"No se puede cambiar el fondo: la solicitud ya tiene rendición"`; sub-ítem de otro ministerio → error del trigger traducido a `"El fondo no pertenece al ministerio de la solicitud"`.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** migración, servicio y acción (`REVIEW_INTENTIONS`). Cambios de fondo registran `previous_value`/`new_value` en `system_audit_log`.
- [ ] **Step 4: UI.** En el diálogo de aprobación de `intention-detail-client.tsx`, selector "Fondo" con los sub-ítems activos del ministerio (carga desde el servidor, solo visible con `REVIEW_INTENTIONS`) y opción "Sin asignar". Mostrar el fondo actual en el detalle con botón "Cambiar" mientras `setFund` lo permita. El ministro no ve el selector.
- [ ] **Step 5: Verificar** `pnpm test`, `pnpm run ci`.
- [ ] **Step 6: Commit** `feat(requests): tesorería elige el fondo al aprobar`.

### Task 6: UI de sub-ítems y restante

**Files:**
- Modify: `components/ministries/ministry-budget-admin.tsx`, `components/ministries/budget-rows.ts`, `components/ministries/ministry-detail-client.tsx`, `app/(dashboard)/ministries/[id]/page.tsx`, `app/(dashboard)/budgets/page.tsx`
- Create: `components/ministries/sub-item-dialog.tsx`
- Test: `components/ministries/__tests__/budget-rows.test.ts`, e2e manual con `pnpm test:e2e`

**Interfaces:**
- Consumes: `budgetSubItemsService.getSummary`, acciones de Task 3.

- [ ] **Step 1: Tests** de `buildBudgetRows` con sub-ítems: fila padre con `children`, línea "Sin asignar", restante negativo conserva el signo.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: `/budgets`:** filas expandibles por padre con sus sub-ítems (asignado, usado, restante), botón "Agregar sub-ítem" que abre `sub-item-dialog.tsx`; al agregar el primero a un padre con monto asignado, diálogo de aviso: "El total de este ministerio pasará a ser la suma de sus sub-ítems" (Review Focus 1).
- [ ] **Step 4: Detalle del ministerio:** tabla de solo lectura con sub-ítems, "sin asignar" y totales, visible para el ministro asignado (el servidor valida con `getMinistryForUser`; no se carga para otros ministerios).
- [ ] **Step 5: Verificar** con `pnpm dev` y `pnpm test:e2e` (usuarios de `e2e/README.md`): ADMIN, BURSAR y un MINISTER ven lo esperado y el MINISTER no ve otros ministerios. Usar `playwright-cli`, no el MCP de Chrome.
- [ ] **Step 6: Commit** `feat(budgets): sub-ítems y restante en presupuesto y detalle de ministerio`.

### Task 7: Copiar desde el año anterior

**Files:**
- Modify: `services/ministries/ministry-budget.service.ts`, `app/actions/ministry-budgets.ts`, `components/ministries/ministry-budget-admin.tsx`
- Create: `components/ministries/budget-copy-panel.tsx`
- Test: `services/ministries/__tests__/ministry-budget.service.test.ts`

**Interfaces:**
- Consumes: servicios de sub-ítems y de ítems.
- Produces: `ministryBudgetService.copyFromPeriod(db, { from_period_id, to_period_id, scope: "ALL" | { ministry_id } | { budget_item_id } | { sub_item_id } }, userId)`: crea en el destino los padres, ítems y sub-ítems faltantes con el mismo `assigned_amount` y `initial_used_amount = 0`; omite los que ya existen por nombre; no modifica el origen.

- [ ] **Step 1: Tests.** `scope: "ALL"` copia padres y sub-ítems con `initial_used_amount: 0` y sin tocar el origen; copiar dos veces no duplica; origen igual a destino lanza `"El período de origen y destino deben ser distintos"`.
- [ ] **Step 2: Correr y ver fallar.**
- [ ] **Step 3: Implementar** `copyFromPeriod` y la acción (`MANAGE_BUDGETS`); auditoría `BUDGET_COPIED` con conteos.
- [ ] **Step 4: UI.** Al estar en un año sin datos o al crearlo, panel lateral de solo lectura con el año anterior, botón "Copiar" por fila y "Copiar todo".
- [ ] **Step 5: Verificar** `pnpm test`, `pnpm run ci`.
- [ ] **Step 6: Commit** `feat(budgets): copiar presupuesto desde el año anterior`.

---

## Self-Review

- **Spec coverage:** puntos 1 (Task 1), 2 (Tasks 3, 4, 6), 3 y año marzo–febrero (Task 2), 4 (Task 7), restante visible (Tasks 4, 6), fondo por tesorería (Task 5).
- **Decisiones mías** (ya marcadas en el spec): backfill de año, "usado inicial" no se copia, fondo opcional. Nuevas en este plan: reutilizar `MANAGE_MINISTRIES` para eliminar; bloquear cambio de fondo si ya hay rendición.
- **Tipos:** `budgetPeriodRange`, `createPeriodForYear`, `getSummary`, `setFund` y `copyFromPeriod` se nombran igual en todas las tareas.
- **Orden y entregas:** cada tarea deja la app compilando y con pruebas verdes; Tasks 1 y 2 pueden ir en PRs independientes. Tasks 3–6 comparten esquema; ir en un mismo PR o en PRs encadenados.
