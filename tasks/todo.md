# Task List: Presupuesto por ministerio (Etapa 10)

> Ver [`tasks/plan.md`](./plan.md) para el plan completo (decisiones de arquitectura, riesgos) y [`docs/plans/10-presupuesto-por-ministerio.md`](../docs/plans/10-presupuesto-por-ministerio.md) para el spec. Cada tarea se ejecuta una a la vez, en orden — no saltar dependencias.

---

## Phase 1: Foundation

### Task 1: Migración de schema, RLS, RPC y permiso — ✅ DONE
- [x] Rama nueva: `git fetch origin && git checkout -b feat/ministry-budgets origin/main`
- [x] `pnpm supabase migration new add_ministry_budgets`
- [x] Crear `budget_periods` (con `CREATE EXTENSION IF NOT EXISTS btree_gist`, `CHECK (end_date > start_date)`, `EXCLUDE USING gist (daterange(start_date, end_date, '[]') WITH &&)`)
- [x] Crear `ministry_budgets` (`UNIQUE (ministry_id, budget_period_id)`, `CHECK (assigned_amount > 0)`, `CHECK (initial_used_amount >= 0)`)
- [x] `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` en ambas tablas
- [x] RLS select: visible para `ADMIN`, `BURSAR`, `FINANCE`, y para el `MINISTER` asignado al `ministry_id` (via `get_my_active_ministries()`, helper ya existente)
- [x] RLS insert/update: solo `get_my_role() IN ('ADMIN', 'BURSAR')` — mismo patrón que `movement_categories`
- [x] RPC `get_ministry_budget_summary(p_period_id UUID DEFAULT NULL)` — `SECURITY DEFINER`, `STABLE`, `REVOKE`d de `PUBLIC`, `GRANT`ado solo a `service_role` (mismo patrón que `get_ministry_leftover_summary`; **nota de implementación:** devuelve `JSONB` vía `jsonb_agg`, no `RETURNS TABLE` como decía el plan original — así es como está hecho `get_ministry_leftover_summary` y `get_dashboard_summary`, se ajustó para seguir la convención real del repo)
- [x] Seed `role_permissions`: `('ADMIN', 'MANAGE_BUDGETS', true)`, `('BURSAR', 'MANAGE_BUDGETS', true)`
- [x] Agregar `MANAGE_BUDGETS` a `PERMISSIONS` en `lib/permissions/rbac.ts`

**Acceptance:**
- [x] Insertar dos `budget_periods` con rangos de fecha solapados falla con el constraint de exclusión (verificado por SQL directo, rollback)
- [x] Fixture con `ministry_budgets` (1.000.000 asignado, 200.000 inicial) + una `TRANSFER` aprobada+transferida (100.000), una `REIMBURSEMENT` aprobada (50.000), una `TRANSFER` aprobada SIN transfer (999.999, no debe contar), una `REIMBURSEMENT` `PENDING` (888.888, no debe contar) → `get_ministry_budget_summary()` devolvió `used_amount = 350000.00`, `remaining = 650000.00` — correcto. Probado con `p_period_id` explícito y con `NULL` (resuelve al período vigente), mismo resultado.
- [ ] RLS por rol (`MINISTER` no puede escribir, sí puede leer su propio ministerio) — **diferido a Task 7** (test de integración jest contra Supabase local, más riguroso que psql manual con `SET ROLE`)

**Verify:**
- [x] `pnpm supabase migration up` — sin errores
- [x] `pnpm types:generate` — tipos regenerados, incluye `budget_periods`, `ministry_budgets`, `get_ministry_budget_summary`
- [x] `pnpm run ci` — verde
- [x] `pnpm test` — 27 suites / 168 tests, todo verde (sin regresiones)

**Files:**
- `supabase/migrations/<timestamp>_add_ministry_budgets.sql`
- `lib/permissions/rbac.ts`
- `types/database.types.ts` (generado)

**Dependencies:** None

---

## Checkpoint: Foundation
- [ ] Todo lo anterior verificado antes de seguir a Phase 2

---

## Phase 2: Service layer

### Task 2: Validadores Zod — ✅ DONE
- [x] `lib/validators/ministry-budget.ts`: `upsertBudgetPeriodSchema` (`label`, `start_date`, `end_date`, refine `end_date > start_date`), `upsertMinistryBudgetSchema` (`ministry_id`, `assigned_amount` positivo, `initial_used_amount` no negativo, default 0)
- [x] Exportar tipos inferidos (`UpsertBudgetPeriodInput`, `UpsertMinistryBudgetInput`)
- [x] **Nota de implementación:** el proyecto usa Zod v4, cuyo `.uuid()` exige formato RFC4122 estricto (nibble de versión 1-8, nibble de variante 8/9/a/b) — los UUIDs "obviamente falsos" tipo `11111111-1111-1111-1111-111111111111` fallan la validación. Los tests usan `...-4111-8111-...` en su lugar.

**Acceptance:**
- [ ] `end_date <= start_date` rechazado con mensaje en español (consistente con el resto de `lib/validators/`)
- [ ] `assigned_amount <= 0` o `initial_used_amount < 0` rechazados

**Verify:**
- [ ] `pnpm typecheck`
- [ ] Test unitario del schema (puede vivir junto al service test de Task 7, o un archivo propio si se prefiere separar)

**Files:**
- `lib/validators/ministry-budget.ts`

**Dependencies:** Task 1

---

### Task 3: Service layer — ✅ DONE
- [x] `services/ministries/ministry-budget.service.ts`:
  - `upsertPeriod(db, input, userId)` — insert/update sobre `budget_periods`, cliente de sesión normal (RLS gatea el rol), con audit log
  - `upsertBudget(db, input, userId)` — upsert sobre `ministry_budgets` por `(ministry_id, budget_period_id)`, con audit log
  - `getSummary(periodId?: string)` — invoca `get_ministry_budget_summary` vía `createSupabaseAdminClient()` (mismo patrón que `ministry-leftover.service.ts`)
  - `getCurrentPeriod(db)` / `listPeriods(db)` — para el selector de período en la UI
- [x] Agregado `services/ministries/ministry-budget\.service\.ts` al patrón `ALLOWED` del paso "Admin client whitelist check" en `.github/workflows/ci.yml` — verificado localmente corriendo el mismo grep del step

**Acceptance:**
- [x] `getSummary()` sin período vigente (gap) devuelve `[]` (el RPC ya lo garantiza — verificado en Task 1)
- [x] `upsertPeriod`/`upsertBudget` no atrapan el error de Postgres — se deja propagar (`if (error) throw error`, mismo patrón que el resto del repo)

**Verify:**
- [x] `pnpm typecheck` — verde
- [x] Chequeo de whitelist del admin client corrido localmente (mismo grep que el step de CI) — pasa

**Files:**
- `services/ministries/ministry-budget.service.ts`
- `.github/workflows/ci.yml`

**Dependencies:** Task 2

---

### Task 4: Server actions — ✅ DONE
- [x] `app/actions/ministry-budgets.ts`:
  - `upsertBudgetPeriod(input)` — sesión, `can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)`, valida con Task 2 (`parseOrThrow`, mismo patrón que `app/actions/categories.ts`), llama a Task 3 (que hace el audit log internamente)
  - `upsertMinistryBudget(input)` — mismo patrón
- [x] Ambas lanzan `Error` con mensaje en español (permiso o primer issue de Zod), consumible por el form — mismo patrón que `categories.ts`/`ministries.ts`
- [x] `revalidatePath("/ministries")` en ambas + `revalidatePath("/ministries/[id]")` en `upsertMinistryBudget`

**Acceptance:**
- [x] Un usuario sin `MANAGE_BUDGETS` recibe `Error("Sin permisos para gestionar presupuestos")`, no un 500 — cubierto por test
- [x] La validación Zod corre **antes** de tocar el service (test: `end_date` inválido / `assigned_amount` negativo nunca llegan a `ministryBudgetService`)
- [x] Cada mutación exitosa deja una fila en `system_audit_log` (vía Task 3, no duplicado acá)

**Verify:**
- [x] `pnpm typecheck` — verde
- [x] `pnpm test` — sin regresiones (178/178 tests, incluye los nuevos de este archivo)
- [x] Tests nuevos: `app/actions/__tests__/ministry-budgets.test.ts` (10 tests: permiso, validación Zod pre-service, revalidatePath, schemas) — adelantado desde Task 7 siguiendo el mismo patrón que `ministries.test.ts`

**Files:**
- `app/actions/ministry-budgets.ts`

**Dependencies:** Task 3

---

## Checkpoint: Service layer
- [ ] `pnpm typecheck` y `pnpm test` verdes
- [ ] Prueba manual (consola/script puntual): crear período + presupuesto de un ministerio, confirmar fila en `system_audit_log`

---

## Phase 3: UI

### Task 5: Pantalla de administración (ADMIN/BURSAR)
- [ ] Sección/tab "Presupuesto" en `app/(dashboard)/ministries/page.tsx`, gateada por `can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)`
- [ ] Selector de período (vigente por defecto vía `getCurrentPeriod`/`listPeriods`; opción de ver otro pasado/futuro)
- [ ] Editor de fechas/label del período (crear si no existe uno vigente, editar in place si existe)
- [ ] Mensaje explícito "no hay período vigente, crear uno" cuando `listPeriods`/RPC no encuentra uno vigente (gap) — nunca una tabla vacía silenciosa
- [ ] Tabla con una fila por ministerio activo: `assigned_amount`, `initial_used_amount` editables inline, guardado vía `upsertMinistryBudget` (Task 4)
- [ ] Errores del constraint de solapamiento (Task 1) se muestran como mensaje de form legible, no un 500

**Acceptance:**
- [ ] ADMIN o BURSAR pueden crear el período vigente y cargar montos para todos los ministerios en una sola pantalla, sin recargar la página entre filas
- [ ] Un `MINISTER`/`FINANCE` no ve esta sección (ni el botón/tab que lleva a ella)

**Verify:**
- [ ] `pnpm lint` / `pnpm typecheck`
- [ ] Manual en `pnpm dev` con `playwright-cli`: crear período, cargar montos de 2+ ministerios, confirmar persistencia tras refresh

**Files:**
- `app/(dashboard)/ministries/page.tsx`
- Nuevo componente cliente (ej. `components/ministries/ministry-budget-admin.tsx`)

**Dependencies:** Task 4

---

### Task 6: KPI de solo lectura en detalle de ministerio
- [ ] `app/(dashboard)/ministries/[id]/page.tsx`: fetch de `ministryBudgetService.getSummary()` filtrado al `ministry_id`, pasado como prop nueva a `MinistryDetailClient`
- [ ] `components/ministries/ministry-detail-client.tsx`: nueva tarjeta KPI (mismo grid/patrón visual que las 4 existentes, ~línea 519) con `assigned_amount`, `used_amount`, `remaining` — color de alerta si `remaining < 0`, igual criterio que `leftover`
- [ ] Visible para `ADMIN`, `BURSAR`, `FINANCE`, y el `MINISTER` asignado a ese ministerio (mismo control de acceso que ya tiene `leftover` en esa página — no depende de `MANAGE_BUDGETS`, que es solo para escritura)
- [ ] Si no hay período vigente para ese ministerio, la tarjeta muestra un estado vacío explícito, no `$0` engañoso

**Acceptance:**
- [ ] Un `MINISTER` ve el KPI de su propio ministerio pero no puede editarlo (no hay controles de edición en esta vista)
- [ ] El monto remanente coincide con el cálculo manual verificado en Task 1

**Verify:**
- [ ] `pnpm lint` / `pnpm typecheck`
- [ ] Manual en `pnpm dev`: login como `MINISTER` de un ministerio con presupuesto cargado, confirmar que el KPI aparece correcto y sin controles de edición

**Files:**
- `app/(dashboard)/ministries/[id]/page.tsx`
- `components/ministries/ministry-detail-client.tsx`

**Dependencies:** Task 4 (puede correr en paralelo a Task 5 — archivos distintos)

---

## Checkpoint: UI
- [ ] `pnpm run ci` verde
- [ ] Recorrido manual completo con `playwright-cli`: ADMIN crea período + montos → BURSAR edita un monto → MINISTER ve su KPI → FINANCE ve el KPI de cualquier ministerio (solo lectura) → intento de solapar período muestra error legible

---

## Phase 4: Tests, docs y QA final

### Task 7: Tests unitarios y de integración RLS
- [ ] `services/ministries/__tests__/ministry-budget.service.test.ts` (o ubicación análoga bajo `__tests__/`): validadores (Task 2) + mapeo del resultado del RPC en `getSummary`
- [ ] `services/__integration__/rls.test.ts`: agregar casos —
  - [ ] `MINISTER` no puede `INSERT`/`UPDATE` en `budget_periods`/`ministry_budgets`
  - [ ] `ADMIN` y `BURSAR` sí pueden
  - [ ] `SELECT` visible para `FINANCE` y para el `MINISTER` asignado a ese ministerio específico (y **no** visible para un `MINISTER` de otro ministerio, si aplica el mismo criterio de scoping que el resto del workflow)

**Acceptance:**
- [ ] Todos los tests nuevos pasan en CI, incluyendo contra Supabase local para el archivo de integración

**Verify:**
- [ ] `pnpm test`
- [ ] `pnpm test services/__integration__/rls.test.ts` contra Supabase local corriendo

**Files:**
- `services/ministries/__tests__/ministry-budget.service.test.ts`
- `services/__integration__/rls.test.ts`

**Dependencies:** Task 3, Task 6 (para saber el scoping final de lectura implementado)

---

### Task 8: Documentación
- [ ] `docs/flows.md`: nueva sección "presupuesto por ministerio: carga inicial + consumo automático", mismo formato que la sección de remanente (Etapa 7). Documentar explícitamente que editar las fechas de un período recalcula el consumo histórico (no es un valor congelado — ver Risks en `tasks/plan.md`)
- [ ] Diagrama vía `/archify`, committeado en `docs/diagrams/` (no un artifact de Claude)

**Acceptance:**
- [ ] La sección nueva de `docs/flows.md` referencia el spec (`docs/plans/10-presupuesto-por-ministerio.md`) y explica la fórmula de `usado` en prosa, no solo SQL

**Verify:**
- [ ] Revisión visual del diagrama generado (`pnpm docs`)

**Files:**
- `docs/flows.md`
- `docs/diagrams/` (nuevo archivo)

**Dependencies:** Task 5, Task 6

---

### Task 9: QA manual de cierre
- [ ] Recorrer uno por uno los "Criterios de aceptación" de `docs/plans/10-presupuesto-por-ministerio.md` contra `pnpm dev` local, con los 4 roles (`ADMIN`, `BURSAR`, `FINANCE`, `MINISTER`)
- [ ] Confirmar explícitamente el caso de gap entre períodos (sin período vigente) en ambas pantallas (admin y KPI de detalle)

**Acceptance:**
- [ ] Todos los criterios de aceptación del spec marcados como verificados, sin pendientes

**Verify:**
- [ ] Checklist de criterios de aceptación completo (copiar la lista del spec acá y tildarla, o dejar constancia en el PR)

**Files:** Ninguno (verificación, no código)

**Dependencies:** Task 7, Task 8

---

## Checkpoint: Complete
- [ ] `pnpm run ci` verde
- [ ] `pnpm test` verde (incluye RLS de integración)
- [ ] Todos los criterios de aceptación del spec verificados
- [ ] PR abierto: `git push -u origin feat/ministry-budgets` + `gh pr create --base main --head feat/ministry-budgets`
