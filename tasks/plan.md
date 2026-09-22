# Implementation Plan: Presupuesto por ministerio (Etapa 10)

> Spec de referencia: [`docs/plans/10-presupuesto-por-ministerio.md`](../docs/plans/10-presupuesto-por-ministerio.md) — leer antes de ejecutar cualquier tarea, ahí están las decisiones ya confirmadas con el cliente (período global, cálculo de "usado", solo informativo, ADMIN+BURSAR administran, multi-período + expiración implícita).

## Overview

Reintroducir presupuesto por ministerio (`budget_periods` + `ministry_budgets`) sin repetir el error de diseño original (acoplar `budget_intentions` por FK). El RPC de lectura cruza por rango de fechas, igual que el remanente de la Etapa 7 (`get_ministry_leftover_summary`). Incluye la carga de valores iniciales (`assigned_amount` + `initial_used_amount` por ministerio) y una pantalla de administración simple para ADMIN/BURSAR, más un KPI de solo lectura en el detalle de ministerio.

## Architecture Decisions

- **Cruce por fecha, no por FK.** `budget_intentions` no gana columnas. El RPC `get_ministry_budget_summary` filtra `intention_transfers.transfer_date` / `budget_intentions.reviewed_at` contra `budget_periods.start_date/end_date`. Mismo patrón que Etapa 7, mismo motivo (evitar el acoplamiento que se eliminó en `20260709022754_remove_budget_feature.sql`).
- **Sin máquina de estados.** Ni `budget_periods` ni `ministry_budgets` tienen `status`. Un período expira solo por fecha (`end_date < CURRENT_DATE`); no hay DRAFT/RELEASED como en el diseño original — se confirmó "solo informativo, sin bloqueo" con el cliente.
- **No-solapamiento a nivel DB.** `EXCLUDE USING gist` sobre `daterange(start_date, end_date, '[]')` en `budget_periods` (requiere `btree_gist`). Esto es lo que permite que "período vigente" resuelva sin ambigüedad.
- **RPC `SECURITY DEFINER`, invocado vía admin client** — mismo patrón que `get_ministry_leftover_summary`: revocado de `anon`/`authenticated` (ver `20260501000003_revoke_security_definer_grants.sql`), y `services/ministries/ministry-budget.service.ts` se agrega a la whitelist del admin client en CI. **Implementado (Task 1):** el RPC devuelve `JSONB` (`jsonb_agg`), no `RETURNS TABLE` — así están hechos tanto `get_ministry_leftover_summary` como `get_dashboard_summary`; se siguió esa convención real en vez de lo que decía el borrador original del plan. Las escrituras (crear/editar período, cargar montos) **no** usan admin client — pasan por el cliente de sesión normal, con RLS restringiendo insert/update a `ADMIN`/`BURSAR` (mismo patrón que `movement_categories`, `get_my_role() IN ('ADMIN','BURSAR')`).
- **Permiso propio `MANAGE_BUDGETS`**, seedeado a `ADMIN`+`BURSAR`, separable en runtime desde Settings → Permisos sin tocar código.
- **Visibilidad de lectura más amplia que la de escritura.** El SELECT de `ministry_budgets`/`budget_periods` (y el resultado del RPC) debe ser legible por `ADMIN`, `BURSAR`, `FINANCE` (visibilidad read-only del workflow, ya establecida en CLAUDE.md) y por el `MINISTER` asignado a ese ministerio específico — mismo criterio que ya aplica a `leftover` en `/ministries/[id]` (se muestra a cualquiera que pueda ver esa página, no solo a quien administra). Esto no estaba en la lista original de "quién administra" (esa pregunta era sobre quién *escribe*), pero es necesario para que el KPI de solo-lectura tenga sentido — confirmar con el cliente si genera dudas, pero sigue el patrón ya existente en el código.
- **No hay test de RLS para `ministry-leftover` (precedente)** — pero para esta feature sí conviene sumar casos a `services/__integration__/rls.test.ts`, porque acá la escritura sí está gateada por rol (`MANAGE_BUDGETS`), a diferencia del remanente que es puramente de lectura agregada.

## Decisión tomada para desbloquear implementación (antes pregunta abierta del spec)

**Ubicación de la UI de administración:** pestaña/sección nueva dentro de `app/(dashboard)/ministries/page.tsx` (no ruta dedicada). Razón: menos superficie nueva (no hay que resolver layout/breadcrumbs de una ruta aparte), y la lista de ministerios ya es el lugar natural para ver todos a la vez con sus montos — que es exactamente el caso de uso ("cargar valores iniciales sin mucho esfuerzo"). Si en la revisión el cliente prefiere una ruta dedicada, es un cambio de bajo costo dentro de la Tarea 6 (misma lógica de datos, solo cambia el contenedor).

## Notas operativas (no son tareas, son recordatorios de proceso del repo)

- Rama nueva desde `main` actualizado (`git fetch origin && git checkout -b feat/ministry-budgets origin/main`) — **no** seguir sobre `feat/minister-leftover-kpi`, que es una rama de feature no relacionada todavía sin mergear.
- Migraciones: `pnpm supabase migration new add_ministry_budgets`, luego `pnpm supabase migration up` (nunca `db reset` — ver memoria del proyecto).
- Después de aplicar la migración: `pnpm types:generate`.
- `pnpm run ci` (lint + typecheck) y `pnpm test` deben pasar antes de cada checkpoint.

## Task List

### Phase 1: Foundation (schema)

- [ ] **Task 1: Migración de schema, RLS, RPC y permiso**
  Crea `budget_periods`, `ministry_budgets`, el RPC `get_ministry_budget_summary`, las políticas RLS (select amplio, insert/update `ADMIN`/`BURSAR`), y el seed de `role_permissions` para `MANAGE_BUDGETS`.

### Checkpoint: Foundation
- [ ] `pnpm supabase migration up` aplica sin error
- [ ] `pnpm types:generate` regenera `types/database.types.ts` sin diffs manuales pendientes
- [ ] Verificación manual en `supabase studio` / `psql` local: insertar dos períodos con fechas solapadas falla por el constraint; el RPC devuelve filas correctas para datos de prueba (una intention `TRANSFER` aprobada+transferida, una `REIMBURSEMENT` aprobada, dentro y fuera del rango del período)
- [ ] `pnpm run ci` sigue verde (no debería haber consumidores todavía, así que esto es solo para confirmar que la migración no rompió nada existente)

### Phase 2: Service layer

- [ ] **Task 2: Validadores Zod**
  `lib/validators/ministry-budget.ts` — schema de período (`label`, `start_date`, `end_date`, con `end_date > start_date`) y schema de ítem de presupuesto (`ministry_id`, `assigned_amount > 0`, `initial_used_amount >= 0`).

- [ ] **Task 3: Service layer**
  `services/ministries/ministry-budget.service.ts` — CRUD de período (create/update, cliente de sesión normal, RLS gatea el rol), upsert de `ministry_budgets` por `(ministry_id, budget_period_id)`, y `getSummary(periodId?: string)` que invoca el RPC vía admin client (mismo patrón que `ministry-leftover.service.ts`). Agrega el archivo a la whitelist de `.github/workflows/ci.yml` (paso "Admin client whitelist check").

- [ ] **Task 4: Server actions**
  `app/actions/ministry-budgets.ts` — `upsertBudgetPeriod`, `upsertMinistryBudget`. Cada una: lee sesión, valida con Zod (Task 2), chequea `can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)`, llama al service (Task 3), registra `auditService.logSystem(...)` con el patrón ya usado en `severance-reserve.service.ts` (`entity`, `action`, `user_id`, `entity_id`, `new_value`).

### Checkpoint: Service layer
- [ ] `pnpm typecheck` pasa
- [ ] `pnpm test` pasa (aunque todavía no haya tests nuevos, no debe romper nada existente)
- [ ] Server action probada manualmente (ej. vía consola de Next.js o un test unitario rápido) creando un período y un presupuesto, y confirmando que el registro de auditoría queda insertado

### Phase 3: UI

- [ ] **Task 5: Pantalla de administración (ADMIN/BURSAR)**
  Nueva sección/tab "Presupuesto" en `app/(dashboard)/ministries/page.tsx`, visible solo con `MANAGE_BUDGETS`. Selector de período (vigente por defecto, con opción de ver pasados/crear futuro — ver Task 1 RPC), editor de fechas del período, tabla de ministerios con `assigned_amount`/`initial_used_amount` editables inline, guardado vía server actions de Task 4. Mensaje explícito cuando no hay período vigente ("no hay período vigente, crear uno") en vez de tabla vacía.

- [ ] **Task 6: KPI de solo lectura en detalle de ministerio**
  En `app/(dashboard)/ministries/[id]/page.tsx` + `components/ministries/ministry-detail-client.tsx`: nueva tarjeta KPI (mismo patrón visual que las 4 tarjetas existentes, ej. línea ~519 de `ministry-detail-client.tsx`) mostrando `assigned_amount`, `used_amount`, `remaining` del período vigente para ese ministerio — visible para `ADMIN`/`BURSAR`/`FINANCE` y para el `MINISTER` asignado (mismo criterio de acceso que ya tiene `leftover` en esa página). Reusa `ministryBudgetService.getSummary()` filtrado por `ministry_id`.

### Checkpoint: UI
- [ ] `pnpm lint` y `pnpm typecheck` pasan
- [ ] Manual en `pnpm dev` (usar `playwright-cli` por convención del repo, no Claude-in-Chrome): como ADMIN, crear un período, cargar monto + monto inicial usado para al menos 2 ministerios, confirmar que el remanente se ve correcto; como MINISTER de uno de esos ministerios, confirmar que ve el KPI pero no puede editarlo; probar que crear un período con fechas solapadas muestra error legible en el form, no un 500

### Phase 4: Tests, docs y QA final

- [ ] **Task 7: Tests unitarios**
  `services/ministries/__tests__/ministry-budget.service.test.ts` (o ubicación equivalente bajo `__tests__/`, siguiendo el patrón de los ~47 archivos existentes) — cubrir: validadores (rechazo de `end_date <= start_date`, montos negativos), el mapeo del resultado del RPC a los tipos del service. Agregar casos a `services/__integration__/rls.test.ts`: un usuario `MINISTER` no puede insertar/editar `ministry_budgets`/`budget_periods`; `ADMIN`/`BURSAR` sí pueden; el SELECT es visible para `FINANCE` y para el `MINISTER` asignado a ese ministerio.

- [ ] **Task 8: Documentación**
  Actualizar `docs/flows.md` con una sección "presupuesto por ministerio: carga inicial + consumo automático" (mismo formato que la sección de remanente ya agregada en la Etapa 7). Generar el diagrama correspondiente con `/archify`, commitear a `docs/diagrams/` — no usar un artifact de Claude para esto (memoria del proyecto).

- [ ] **Task 9: QA manual de cierre**
  Recorrido completo de los "Criterios de aceptación" del spec (`docs/plans/10-presupuesto-por-ministerio.md`) contra la app corriendo localmente, con los 4 roles relevantes (`ADMIN`, `BURSAR`, `FINANCE`, `MINISTER`).

### Checkpoint: Complete
- [ ] `pnpm run ci` (lint + typecheck) verde
- [ ] `pnpm test` verde, incluyendo `services/__integration__/rls.test.ts` contra Supabase local
- [ ] Todos los criterios de aceptación del spec verificados manualmente
- [ ] Listo para PR (`git push -u origin feat/ministry-budgets` + `gh pr create`) — **nunca push directo a `main`**

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| `btree_gist` no habilitado en el proyecto Supabase remoto | Alto — migración falla en CI/prod | Es una extensión contrib estándar, normalmente disponible; `CREATE EXTENSION IF NOT EXISTS` es idempotente. Verificar en el primer `supabase db push` a un entorno real antes de mergear a `main`. |
| RPC `SECURITY DEFINER` expone datos entre ministerios si se llama sin filtrar por rol en la capa de servicio | Alto — fuga de datos | Igual que `ministry-leftover.service.ts`: el filtrado por permiso/ministerio ocurre en el `page.tsx`/service antes de llamar al RPC, y el RPC está `REVOKE`d de `anon`/`authenticated`. Cubrir con test de integración (Task 7). |
| Editar las fechas de un período cambia retroactivamente el "usado" calculado (no es un valor congelado) | Medio — puede sorprender si el cliente esperaba inmutabilidad histórica | Es una consecuencia esperada del diseño (cálculo en lectura, no ledger). Documentar explícitamente en `docs/flows.md` (Task 8) para que quede claro que acortar/extender un período recalcula el consumo, no solo el tope. |
| Trabajar sobre la rama `feat/minister-leftover-kpi` existente por error | Medio — mezcla features no relacionadas en un mismo PR | Rama nueva desde `main` actualizado, explícito en "Notas operativas" arriba. |

## Open Questions

- Ninguna bloqueante. La única pendiente del spec (ubicación de la UI) se resolvió arriba con una decisión por defecto (tab en `/ministries`), a confirmar en la revisión de este plan antes de arrancar la Tarea 5.
