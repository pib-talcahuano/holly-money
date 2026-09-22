# Etapa 10 — Presupuesto por ministerio y carga de valores iniciales

> Feature nueva, fuera del roadmap original de 8 etapas (ver [`00-roadmap.md`](./00-roadmap.md), completo y mergeado). Surge de feedback post-roadmap, en la línea de [`09-pendientes.md`](./09-pendientes.md), pero con alcance suficiente para su propio plan.

## Contexto

El cliente quiere que cada ministerio tenga un presupuesto fijo por un período de tiempo, configurable y editable (el período puede extenderse o acortarse). Como la app recién entra en uso y el presupuesto de este año ya se definió y ya tiene montos gastados fuera del sistema, se necesita cargar un dato **inicial**: monto asignado originalmente + monto ya utilizado a la fecha de arranque, por ministerio. No se va a cargar historial real de movimientos — solo estos dos números como punto de partida.

**Esto ya existió y fue eliminado a propósito.** `supabase/migrations/20260426000001_expense_approval_workflow.sql` creó `budget_periods` + `ministry_budgets` + un RPC `get_ministry_budget_summary` con el mismo patrón allocated/used/remaining. `supabase/migrations/20260709022754_remove_budget_feature.sql` lo borró todo, incluyendo dos columnas que agregó a `budget_intentions`: `period_id` (FK obligatoria) e `is_over_budget`. El motivo de fondo (confirmado en `07-remanente-por-ministerio.md`, línea 9) es que acoplar cada intention a un período por FK generó fricción — por eso el remanente (Etapa 7) se calculó después con un RPC que filtra por fecha, sin tocar el schema de `budget_intentions`. Esta etapa reintroduce el concepto de presupuesto, pero replicando el patrón de la Etapa 7 (filtro por fecha desde el lado de lectura) en vez del acoplamiento original por FK.

**Indemnización del pastor — no requiere schema nuevo.** `severance_reserve_adjustments` (`services/payroll/severance-reserve.service.ts`) ya es un ledger append-only: `getBalance()` suma todos los `amount_delta`. Cargar un "saldo inicial" es insertar un único ajuste con `period` = primer mes a trackear y `amount_delta` = monto inicial (nota: "saldo inicial"), usando el formulario ya existente en `/payroll`. **Fuera de alcance de esta etapa** — se deja documentado acá para no perderlo, pero no hay trabajo de desarrollo pendiente salvo confirmarlo con el cliente en la práctica.

## Decisiones ya confirmadas con el cliente

1. **Período global, monto por ministerio.** Un solo período activo (ej. 2026-01-01 a 2026-12-31) aplica a todos los ministerios; cada ministerio define su propio monto asignado dentro de ese período.
2. **Cálculo de "usado" hacia adelante:**
   - Camino `TRANSFER` (transferencia anticipada): se descuenta del presupuesto cuando la intention está `APPROVED` **y** tiene una `intention_transfers` registrada (igual regla que ya usa el remanente de la Etapa 7).
   - Camino `REIMBURSEMENT`: se descuenta apenas la intention queda `APPROVED` (no hay dinero "en tránsito" con el ministerio — la aprobación es el evento de gasto, mismo criterio que ya documenta `docs/flows.md` línea 230).
   - El monto inicial cargado (`initial_used_amount`) es el punto de partida; lo automático se suma encima, no lo reemplaza.
3. **Solo informativo en v1.** No hay bloqueo duro al crear una intention que excedería el presupuesto. Se muestra como KPI/indicador (mismo lugar/patrón que el remanente de la Etapa 7).
4. **Administración: ADMIN y BURSAR.** Ambos pueden crear/editar el período y cargar montos por ministerio.

## Diseño

### Schema

Dos tablas nuevas, deliberadamente **sin** `status` de DRAFT/RELEASED (esa máquina de estados existía en el diseño original y no aporta nada bajo la regla "solo informativo, sin bloqueo" — se omite a propósito para minimizar el esfuerzo, tal como pidió el cliente):

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE budget_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,               -- ej. "Presupuesto 2026"
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT budget_periods_dates_check CHECK (end_date > start_date),
  -- Ningún par de períodos puede solaparse en fechas: evita ambigüedad al resolver
  -- "el período vigente" y evita doble conteo si el RPC cruzara por fecha contra
  -- dos períodos a la vez.
  CONSTRAINT budget_periods_no_overlap EXCLUDE USING gist (
    daterange(start_date, end_date, '[]') WITH &&
  )
);

CREATE TABLE ministry_budgets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id          UUID NOT NULL REFERENCES ministries(id),
  budget_period_id     UUID NOT NULL REFERENCES budget_periods(id),
  assigned_amount      NUMERIC(12,2) NOT NULL CHECK (assigned_amount > 0),
  initial_used_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (initial_used_amount >= 0),
  notes                TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ministry_id, budget_period_id)
);
```

`budget_intentions` **no se toca** — sin `period_id`, sin `is_over_budget`. El cruce entre intention y período se hace por fecha en el RPC de lectura, igual que el remanente.

**"Editable si se extiende o acorta":** se edita `start_date`/`end_date` del `budget_periods` existente in place — no hace falta crear un período nuevo para eso. Un período nuevo (ej. el presupuesto de 2027) sí se crea como fila nueva cuando corresponda; el diseño no asume "un solo período para siempre".

**Múltiples presupuestos y expiración — confirmado, no queda como pregunta abierta:**

- `budget_periods` admite N filas: pasadas, vigente, futuras. No hay columna de `status` — un período **expira implícitamente** en cuanto `CURRENT_DATE > end_date`, sin necesidad de un job ni un flag que mantener sincronizado.
- El constraint `budget_periods_no_overlap` impide crear un período cuyo rango se solape con uno existente, así que "vigente" siempre resuelve a **como máximo una fila** (la que contiene `CURRENT_DATE`) — sin ambigüedad para el RPC.
- `ministry_budgets` ya soporta múltiples presupuestos por ministerio de forma nativa: `UNIQUE (ministry_id, budget_period_id)` permite una fila por combinación, así que cada ministerio puede tener un monto distinto en cada período (2026, 2027, etc.) sin cambios de schema adicionales.
- **Gap entre períodos** (ej. termina el de 2026 el 31/12 y el de 2027 no se ha creado todavía): con `p_period_id = NULL` el RPC no encuentra ningún período que contenga `CURRENT_DATE` y devuelve un set vacío — la UI debe manejar ese caso mostrando "no hay período vigente, crear uno" en vez de una tabla vacía silenciosa. No se auto-extiende el período anterior ni se infiere uno nuevo.
- Períodos pasados quedan visibles y consultables (selector de período en la UI, no solo "el vigente") pero de solo lectura una vez que expiraron — su `assigned_amount`/`initial_used_amount` se puede seguir editando igual que cualquier fila (no hay bloqueo de escritura por fecha), pero no tiene sentido de negocio hacerlo salvo corrección de un error de carga.

Nuevo permiso `MANAGE_BUDGETS` (`lib/permissions/rbac.ts`), seedeado a `ADMIN` y `BURSAR` en la migración inicial vía `role_permissions` — mismo patrón que `MANAGE_MINISTRIES` (`20260429151749_add_role_permissions_table.sql`). Se prefiere un permiso propio en vez de reusar `MANAGE_MINISTRIES` para que quede separable desde Settings → Permisos sin tocar código, consistente con que los permisos son runtime-configurables.

### RPC de lectura — `get_ministry_budget_summary`

Mismo patrón que `get_ministry_leftover_summary` (tabla de resultados, no JSONB único, para poder listar todos los ministerios de una vez):

```sql
CREATE OR REPLACE FUNCTION get_ministry_budget_summary(
  p_period_id UUID DEFAULT NULL  -- NULL = período vigente (rango que contiene CURRENT_DATE)
)
RETURNS TABLE (
  ministry_id      UUID,
  ministry_name    TEXT,
  period_id        UUID,
  assigned_amount  NUMERIC,
  used_amount      NUMERIC,   -- initial_used_amount + consumo automático
  remaining        NUMERIC
)
...
```

Consumo automático dentro del rango de fechas del período:

```
usado = initial_used_amount
      + SUM(it.amount)  -- TRANSFER: aprobada y con transferencia registrada
          FROM intention_transfers it JOIN budget_intentions bi ON bi.id = it.intention_id
          WHERE bi.ministry_id = ministry_budgets.ministry_id
            AND bi.funding_method = 'TRANSFER' AND bi.status = 'APPROVED'
            AND it.transfer_date BETWEEN period.start_date AND period.end_date
      + SUM(bi.amount)  -- REIMBURSEMENT: aprobada
          FROM budget_intentions bi
          WHERE bi.ministry_id = ministry_budgets.ministry_id
            AND bi.funding_method = 'REIMBURSEMENT' AND bi.status = 'APPROVED'
            AND bi.reviewed_at::date BETWEEN period.start_date AND period.end_date

remanente = assigned_amount - usado   -- se muestra con signo real, sin recortar a cero (mismo criterio que la Etapa 7)
```

### Carga de valores iniciales — UX

Objetivo explícito del cliente: mínimo esfuerzo para cargar esto una sola vez (y volver a editar si cambia). Una sola pantalla:

- Nueva pestaña/sección "Presupuesto" en `app/(dashboard)/ministries/page.tsx` (o vista dedicada `/ministries/budget`, a definir en la fase de plan técnico), visible solo con `MANAGE_BUDGETS`.
- Arriba: selector/editor del período vigente (label, fecha inicio, fecha fin) — crear uno si no existe, editar si ya existe.
- Abajo: una fila por ministerio activo, con `assigned_amount` e `initial_used_amount` editables inline, guardado por fila o en lote. Nada de importación CSV — la cantidad de ministerios no lo justifica.
- El KPI de remanente/uso (`remaining`, con indicador visual si está bajo o negativo) se muestra en la misma vista y/o en el detalle de ministerio (`/ministries/[id]`), junto al KPI de leftover que ya existe ahí.

### Archivos clave

- Migración `supabase/migrations/<ts>_add_ministry_budgets.sql` — tablas + RPC + seed de `MANAGE_BUDGETS`.
- `lib/permissions/rbac.ts` — agregar `MANAGE_BUDGETS`.
- `lib/validators/ministry-budget.ts` — schemas Zod para período e ítems de presupuesto.
- `services/ministries/ministry-budget.service.ts` — CRUD de período + montos, + wrapper del RPC (mismo patrón que `ministry-leftover.service.ts`).
- `app/actions/ministry-budgets.ts` — server actions (crear/editar período, upsert montos por ministerio).
- UI: nueva sección en `app/(dashboard)/ministries/` + componente de KPI reusando el patrón de `components/dashboard/dashboard-charts.tsx` / la tarjeta de remanente ya agregada en `/ministries/[id]`.
- `pnpm types:generate` después de aplicar la migración.
- `docs/flows.md` — nueva sección "presupuesto por ministerio: carga inicial + consumo automático", con diagrama en `docs/diagrams/` vía `/archify` (memoria: los diagramas de flujo van al repo, no a un artifact).

## Depende de / Alimenta a

**Depende de:** Etapa 4 (funding_method) y Etapa 7 (patrón de RPC por fecha, ya mergeadas). No depende de nada pendiente.
**Alimenta a:** eventual Etapa 8 extendida (dashboard consolidado) si se quiere sumar el KPI de presupuesto ahí también — no obligatorio para esta etapa.

## Boundaries

- **Siempre:** filtrar por fecha en el RPC (no agregar FK/columna de período a `budget_intentions`); permisos vía `can()` + `MANAGE_BUDGETS`, nunca comparación de rol; audit log (`auditService`) en cada creación/edición de período o monto, igual que el resto de mutaciones.
- **Preguntar primero:** cualquier cambio que implique bloqueo duro (rechazar una intention por exceder presupuesto) — explícitamente fuera de alcance de v1, se confirmó "solo informativo".
- **Nunca:** reintroducir `period_id`/`is_over_budget` en `budget_intentions`, ni resucitar el estado DRAFT/RELEASED de `ministry_budgets`/`budget_periods` que se sacó a propósito de este diseño.

## Criterios de aceptación

- ADMIN o BURSAR pueden crear/editar el período vigente (fechas) y el monto asignado + monto inicial usado por ministerio, desde una sola pantalla.
- El remanente mostrado por ministerio refleja: `assigned_amount - (initial_used_amount + transferencias TRANSFER aprobadas y registradas + reembolsos REIMBURSEMENT aprobados)`, todo dentro del rango de fechas del período.
- Ningún flujo existente de creación/aprobación de intentions se bloquea ni cambia de comportamiento — el presupuesto es solo lectura/KPI.
- `budget_intentions` no gana columnas nuevas.
- Se pueden crear múltiples períodos (pasados, vigente, futuros) y cada ministerio puede tener un monto distinto por período; dos períodos no pueden solaparse en fechas (constraint a nivel DB, no solo validación de UI).
- Un período expira solo por fecha (`end_date` < hoy) — sin job, sin flag manual. Si no hay período vigente (gap), la UI lo comunica explícitamente en vez de mostrar una tabla vacía.
- Carga de saldo inicial de indemnización confirmada como ya soportada por el flujo existente de `/payroll` (sin cambios de código en esta etapa).

## Preguntas abiertas

- ¿Dónde vive exactamente la UI — pestaña nueva en `/ministries`, o ruta dedicada `/ministries/budget`? Se decide en la fase de plan técnico (Fase 2), no bloquea el spec. Debe incluir, en cualquier caso, un selector de período (no solo mostrar el vigente) para poder ver/crear presupuestos pasados y futuros.
