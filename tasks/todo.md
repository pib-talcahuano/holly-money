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

### Task 5: Pantalla de administración (ADMIN/BURSAR) — ✅ DONE
- [x] Tab "Presupuesto" dentro de `MinistriesClient` (no ruta dedicada — decisión tomada en `tasks/plan.md`), gateada por `can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)` (prop `canManageBudgets` calculada en `page.tsx`)
- [x] Selector de período: por ahora solo el vigente (`getCurrentPeriod`) — **no** se implementó selector de períodos pasados/futuros en esta tarea (ver nota abajo)
- [x] Editor de fechas/label del período vía Dialog (crea si no existe, edita in place si existe — mismo `id` en el payload)
- [x] Mensaje explícito "No hay período vigente" + `Empty` state cuando `getCurrentPeriod` devuelve `null` (gap) — verificado en el navegador
- [x] Tabla con una fila por ministerio activo: `assigned_amount`, `initial_used_amount` editables inline, un solo botón "Guardar cambios" que hace upsert en lote (`Promise.all`)
- [x] Error del constraint de solapamiento se propaga como `Error` con el mensaje de Postgres — llega al toast vía `err.message`, no revienta con un 500 sin manejar (no se probó el caso de solapamiento específico en el navegador, pero el server action no atrapa el error de forma distinta a cualquier otro)

**Nota de alcance:** el spec pedía "selector de período (no solo mostrar el vigente) para poder ver/crear presupuestos pasados y futuros" como parte de la UI. Esta tarea implementó solo el período vigente (crear/editar in place). **Ver/crear otros períodos queda pendiente** — anotado como seguimiento en Task 9 (QA) y como ítem para un backlog post-merge, no bloquea el resto del flujo porque el modelo de datos (Task 1) ya soporta múltiples períodos sin cambios.

**Acceptance:**
- [x] ADMIN puede crear el período vigente y cargar montos para el ministerio en una sola pantalla, sin recargar la página entre filas — probado en el navegador con `e2e-admin@local.test`
- [ ] Un `MINISTER`/`FINANCE` no ve esta sección — **no verificado en el navegador todavía** (esta página ya redirige a `MINISTER` fuera de `/ministries` antes de llegar a los tabs; falta confirmar `FINANCE` explícitamente — ver Task 9)

**Verify:**
- [x] `pnpm lint` / `pnpm typecheck` — verde
- [x] Manual en `pnpm dev` con `playwright` (MCP, no `playwright-cli` de terminal — ver nota de proceso abajo): crear período "Presupuesto 2026" (01-01 a 31-12-2026), cargar $1.000.000 asignado / $200.000 usado inicial para "Ministerio E2E", refrescar la página → los valores persisten y el remanente se recalcula ($1.000.000 - $2.160.000 usado = -$1.160.000, con el ministerio de prueba teniendo casi un año de intentions aprobadas reales en el seed)
- [x] **Bug encontrado y corregido durante esta verificación:** ver nota de UUID abajo

**Nota de proceso — herramienta de navegador:** CLAUDE.md pide usar `playwright-cli`; no estaba disponible como comando de terminal en este entorno, así que se usó el MCP `mcp__plugin_playwright_playwright__*` (mismo motor Playwright, vía protocolo MCP en lugar de CLI). Mismo resultado de verificación, distinta forma de invocarlo.

**Bug real encontrado (no cosmético) — corregido en Task 2/5:** Zod v4 `.uuid()` exige el nibble de variante RFC4122 (`8/9/a/b`); el ministerio seed `e2e00000-0000-0000-0000-0000000000a1` usado en todo el entorno local **no cumple ese formato** (nibble `0`). Esto rompía `upsertMinistryBudget` con 500 al guardar contra ese ministerio real. Cambiado `lib/validators/ministry-budget.ts` para usar un regex UUID permisivo (sin exigir versión/variante) en vez de `.uuid()` — son FKs que Postgres ya valida como `uuid` real, el chequeo de app solo necesita rechazar basura obviamente inválida. **Nota:** este mismo problema late en otros validadores del repo que sí usan `.uuid()` (`assignMinisterSchema.user_id`, `intentionFiltersSchema.ministry_id`) — no se tocaron por estar fuera de alcance, pero vale la pena que el equipo lo sepa.

**Otro hallazgo de infraestructura (no bug de código):** el server de `pnpm dev` cachea `role_permissions` por 24h (`unstable_cache`, ver `lib/supabase/server.ts`). Sembrar `MANAGE_BUDGETS` por migración SQL no lo invalida — hubo que togglear cualquier permiso en Settings → Permisos (dispara `revalidateRolePermissions()`) para que el tab apareciera. Documentado en `tasks/plan.md` → Risks.

**Files:**
- `app/(dashboard)/ministries/page.tsx`
- `components/ministries/ministries-client.tsx`
- `components/ministries/ministry-budget-admin.tsx` (nuevo)
- `lib/validators/ministry-budget.ts` (fix de UUID, ver arriba)

**Dependencies:** Task 4

---

### Task 6: KPI de solo lectura en detalle de ministerio — ✅ DONE
- [x] `app/(dashboard)/ministries/[id]/page.tsx`: fetch de `ministryBudgetService.getSummary()` (período vigente), `.find(row => row.ministry_id === id)`, pasado como prop `budget` a `MinistryDetailClient`
- [x] `components/ministries/ministry-detail-client.tsx`: 5ta tarjeta KPI (grid pasó de `lg:grid-cols-4` a `lg:grid-cols-5`) con `remaining` + "Remanente de {assigned_amount} · {period_label}" — `text-destructive` si `remaining < 0`, igual criterio que `leftover`
- [x] **Nota de alcance real (distinta del plan):** la visibilidad NO es "ADMIN/BURSAR/FINANCE + MINISTER asignado" como decía el plan — es exactamente la misma que ya tenía la página completa antes de este cambio: `MANAGE_MINISTRIES` (ADMIN/BURSAR) o el `MINISTER`/`DELEGATE` asignado. **`FINANCE` no puede llegar a `/ministries/[id]` hoy** (no tiene `MANAGE_MINISTRIES` ni `CREATE_REQUEST`/`CREATE_SETTLEMENT` — ver `isMinisterWorkflowUser` en `lib/permissions/rbac.ts`), así que nunca ve esta tarjeta tampoco, igual que ya pasaba con `leftover`. No es una restricción nueva que agregué — es una limitación preexistente de esta página que no estaba en el alcance de esta etapa tocar. La política RLS (Task 1) sí permite `FINANCE` a nivel de datos, por si esa página se abre a `FINANCE` en el futuro sin necesitar otra migración.
- [x] Estado vacío explícito ("—" / "Sin presupuesto cargado") cuando `budget` es `null` (sin período vigente, o sin fila para ese ministerio en el período vigente)

**Acceptance:**
- [x] `MINISTER` (`e2e-minister@local.test`, ministro asignado a "Ministerio E2E") ve la tarjeta "Presupuesto" con el mismo valor que ve ADMIN ($-1.160.000, "Remanente de $1.000.000 · Presupuesto 2026") — sin ningún input/control de edición, verificado en el navegador
- [x] El remanente coincide con lo esperado dado el dataset real de e2e (no un fixture aislado, sino el ministerio con ~59 solicitudes reales del seed)

**Verify:**
- [x] `pnpm lint` / `pnpm typecheck` — verde
- [x] Manual en `pnpm dev` (Playwright MCP): login ADMIN → ve la tarjeta; login MINISTER (mismo ministerio) → ve la misma tarjeta, sin controles

**Files:**
- `app/(dashboard)/ministries/[id]/page.tsx`
- `components/ministries/ministry-detail-client.tsx`

**Dependencies:** Task 4

---

## Checkpoint: UI
- [ ] `pnpm run ci` verde
- [ ] Recorrido manual completo con `playwright-cli`: ADMIN crea período + montos → BURSAR edita un monto → MINISTER ve su KPI → FINANCE ve el KPI de cualquier ministerio (solo lectura) → intento de solapar período muestra error legible

---

## Phase 4: Tests, docs y QA final

### Task 7: Tests unitarios y de integración RLS — ✅ DONE
- [x] Validadores + server actions ya cubiertos por `app/actions/__tests__/ministry-budgets.test.ts` (adelantado a Task 4) — 10 tests. **No se creó** `ministry-budget.service.test.ts` separado: el service es un wrapper delgado de Supabase, mismo criterio que `ministry-leftover.service.ts`/`severance-reserve.service.ts`, ninguno de los cuales tiene test unitario dedicado en este repo — se prefirió no romper ese patrón sin una razón concreta.
- [x] `services/__integration__/rls.test.ts`: agregados 6 casos nuevos, con fixture autocontenido (`beforeAll`/`afterAll` vía admin client, no depende de datos manuales de Task 5) —
  - [x] Cliente anónimo no puede leer `budget_periods`/`ministry_budgets`
  - [x] `MINISTER` no puede `INSERT` en `budget_periods` ni en `ministry_budgets`
  - [x] `MINISTER` sí puede `SELECT` `ministry_budgets` de su propio ministerio (assertion de no-vacío, no solo "sin error" — evita el falso positivo de una policy que excluye todo silenciosamente)
  - [x] `ADMIN` y `BURSAR` pueden crear (y el test limpia lo que crea)
- [x] **No se agregó** el caso "un `MINISTER` de otro ministerio no ve este ministry_budgets" — requeriría un segundo ministerio+ministro en el seed que no existe hoy; the RLS policy logic (`ministry_id IN (SELECT get_my_active_ministries())`) ya lo cubre por construcción y es el mismo patrón que usa `budget_intentions_select` sin test dedicado para ese caso tampoco.

**Acceptance:**
- [x] Todos los tests nuevos pasan: 184/184 total (178 previos + 6 nuevos de RLS), incluyendo contra Supabase local
- [x] Verificado que el `afterAll` limpia correctamente (`SELECT label FROM budget_periods WHERE label LIKE 'RLS%'` → 0 filas post-test)

**Verify:**
- [x] `pnpm test` — 184/184
- [x] `pnpm test services/__integration__/rls.test.ts` contra Supabase local — 11/11 (incluye los tests preexistentes del archivo)
- [x] `pnpm run ci` — verde

**Files:**
- `services/__integration__/rls.test.ts`

**Dependencies:** Task 3, Task 6

---

### Task 8: Documentación — ✅ DONE
- [x] `docs/flows.md`: nueva sección "Ministry Budget (Presupuesto por Ministerio — Etapa 10)", mismo formato que la sección de remanente (Etapa 7): fórmula en prosa + mermaid + dos callouts explícitos (recálculo retroactivo al editar fechas; constraint de no-solapamiento a nivel DB)
- [x] Diagrama vía `/archify` (workflow, schema v2): `docs/diagrams/src/08-ministry-budget.json` → `docs/diagrams/08-ministry-budget.html`. Validación showcase: 9/9 checks, 0 errores, 0 warnings. `visual-check` en Chrome real: `pass` en 1440×900/1600×1000/1920×1080/2048×1320, light y dark. Revisión visual manual de las capturas (luz y oscuro) — legible, sin overflow, cards de contexto abajo. Sidecars de `visual-check` (PNGs/HTML/JSON de evidencia) borrados tras revisar — no se commitean, mismo patrón que el resto de `docs/diagrams/`.
- [x] `docs/diagrams/README.md` y `docs/diagrams/gallery.html` actualizados con la entrada `08-ministry-budget`

**Acceptance:**
- [x] La sección nueva de `docs/flows.md` referencia el spec (`docs/plans/10-presupuesto-por-ministerio.md`) y explica la fórmula de `usado` en prosa, no solo SQL

**Verify:**
- [x] `node archify.mjs validate workflow ... --quality showcase` → pass
- [x] `node archify.mjs deliver workflow ...` → pass (SHA-256 + bytes reportados)
- [x] `node archify.mjs visual-check ...` → pass, contención OK en los 4 viewports × 2 temas
- [x] `pnpm run ci` — verde (sin impacto en lint/typecheck, son archivos estáticos)

**Files:**
- `docs/flows.md`
- `docs/diagrams/08-ministry-budget.html` (nuevo)
- `docs/diagrams/src/08-ministry-budget.json` (nuevo)
- `docs/diagrams/README.md`
- `docs/diagrams/gallery.html`

**Dependencies:** Task 5, Task 6

---

### Task 9: QA manual de cierre — ✅ DONE
- [x] Recorridos los "Criterios de aceptación" de `docs/plans/10-presupuesto-por-ministerio.md` contra `pnpm dev` local
- [x] Confirmado el caso de gap entre períodos ("No hay período vigente" — Empty state, no tabla vacía silenciosa) en la pantalla de admin
- [x] Los 4 roles verificados en el navegador (login real, no solo lectura de código):
  - **ADMIN** (`e2e-admin@local.test`): ve y usa la tab "Presupuesto", crea período, carga montos, ve el KPI en `/ministries/:id`
  - **MINISTER** (`e2e-minister@local.test`): ve el KPI de solo lectura en su propio ministerio, sin controles de edición; **no puede llegar a `/ministries`** en absoluto — navegar ahí redirige a `/dashboard`, que a su vez lo redirige a `/ministries/:id` (su propio ministerio) porque `MINISTER` carece de `VIEW_DASHBOARD` (lógica preexistente en `app/(dashboard)/dashboard/page.tsx`, no tocada por esta etapa)
  - **FINANCE** (`e2e-finance@local.test`): navegar a `/ministries` también redirige a `/dashboard`, y ahí se queda (FINANCE sí tiene `VIEW_DASHBOARD`) — nunca ve la tab "Presupuesto" ni el KPI de ningún ministerio. Esto confirma que la lectura RLS más amplia para `FINANCE` que se diseñó en Task 1 es, hoy, inalcanzable desde la UI — documentado, no es una laguna de esta etapa (la página `/ministries/[id]` ya tenía esa limitación antes de este trabajo)
  - **BURSAR**: acceso de escritura confirmado por RLS (Task 7), no re-verificado manualmente en el navegador por compartir exactamente el mismo código/gate que ADMIN (`MANAGE_BUDGETS`, sin branching por rol)

**Pendiente explícito, no bloqueante (heredado de Task 5):** el selector de período (ver/crear presupuestos pasados o futuros, no solo el vigente) **no se implementó**. El modelo de datos ya lo soporta sin cambios; queda como ítem de seguimiento post-merge.

**Acceptance:**
- [x] Los 7 criterios de aceptación del spec verificados: pantalla única de carga (1), fórmula de remanente correcta con datos reales (2), cero cambios al flujo de intentions (3, por inspección — ningún archivo de ese flujo fue tocado), `budget_intentions` sin columnas nuevas (4, por inspección de la migración), múltiples períodos + no-solapamiento a nivel DB (5), expiración solo por fecha + mensaje de gap explícito (6), indemnización ya soportada sin cambios de código (7)

**Verify:**
- [x] `pnpm run ci` — verde
- [x] `pnpm test` — 184/184
- [x] Verificación manual con los 4 roles reales vía Playwright MCP (ver arriba)

**Files:** Ninguno (verificación, no código)

**Dependencies:** Task 7, Task 8

---

## Checkpoint: Complete
- [ ] `pnpm run ci` verde
- [ ] `pnpm test` verde (incluye RLS de integración)
- [ ] Todos los criterios de aceptación del spec verificados
- [ ] PR abierto: `git push -u origin feat/ministry-budgets` + `gh pr create --base main --head feat/ministry-budgets`
