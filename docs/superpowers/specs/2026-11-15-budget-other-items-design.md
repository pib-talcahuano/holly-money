# Presupuesto: ítems que no son ministerio — diseño

## Intención
Hoy `/budgets` solo presupuesta ministerios. La iglesia también gasta en cosas que no son un
ministerio (remuneraciones, asociaciones, directorio, etc.). Se quiere ver el presupuesto
completo en un solo lugar, pudiendo agregar ítems libres.

## Objetivos
- Una **sola tabla** en `/budgets`: filas de ministerios juntas primero, luego los ítems
  libres. Sin encabezados de sección; un chip "Ministerio" / "Otro" por fila.
- Poder crear, editar y desactivar ítems libres por período.
- Un total general al final (suma de asignado, usado y remanente de todas las filas).

## No objetivos / anti-objetivos
- No tocar `ministry_budgets` ni `get_ministry_budget_summary`, ni el comportamiento de los
  ministerios.
- No bloquear gastos por presupuesto (sigue siendo solo informativo).
- Sin borrado físico: un ítem se desactiva (`is_active = false`).

## Restricciones
- Mismo permiso `MANAGE_BUDGETS` y mismo período (`budget_periods`).
- Convenciones del repo: identificadores en inglés, UI en español, capa de servicio, Zod en
  `lib/validators/`, auditoría vía `auditService`, migración con `pnpm supabase migration new`,
  tipos con `pnpm types:generate`.

## Enfoques considerados
- **A. Tabla nueva `budget_items`** (elegida): ministerios intactos; la página une ambas fuentes.
- B. Unificar en una tabla con `ministry_id` opcional: exige migrar datos y reescribir el RPC;
  más riesgo sin beneficio visible.
- C. Solo manual, sin categorías: más simple, pero el "usado" se desactualiza y se pierde el
  dato real de movimientos.

## Diseño
**Datos.** Tabla `budget_items`: `id`, `budget_period_id` (FK), `name`, `assigned_amount`
(> 0), `initial_used_amount` (>= 0, default 0), `category_id` (FK nullable a categorías de
movimientos), `notes`, `is_active`, `created_by`, timestamps. Único por (`budget_period_id`,
`name`). RLS espejo de `ministry_budgets`: leer ADMIN/BURSAR/FINANCE, escribir ADMIN/BURSAR
(vía `has_any_role`, no `get_my_role()`).

**Usado.** Si el ítem tiene `category_id`: `initial_used_amount` + suma de movimientos de egreso
no cancelados de esa categoría con fecha dentro del período. Si no tiene categoría: solo el
usado inicial (editable a mano). Calculado en un RPC `get_budget_items_summary(p_period_id)`
(SECURITY DEFINER, solo service_role, mismo patrón que el RPC de ministerios).

**Servicio.** Extender `services/ministries/ministry-budget.service.ts` o crear
`services/budgets/budget-items.service.ts` con `list`, `upsert`, `setActive` y `getSummary`;
cada mutación audita.

**UI.** `MinistryBudgetAdmin` pasa a renderizar una lista unificada de filas
(`kind: "ministry" | "item"`), ministerios primero (orden por nombre), luego ítems. Las filas de
ítem tienen editar nombre/categoría y desactivar; una última fila "+ Agregar ítem". Una fila
de total. "Guardar cambios" guarda ambos tipos.

## Decisiones del builder (mías, a confirmar)
- Los ítems viven dentro de cada período (empiezan de cero cada año). Posible extra, fuera de
  alcance inicial: "copiar ítems del período anterior".
- Categoría opcional; solo se ofrecen categorías de egreso.
- El orden de los ítems es por nombre.
- Los ítems inactivos se ocultan de la tabla.

## Pruebas
Jest para validadores y servicio; prueba de integración RLS en `services/__integration__/`
para `budget_items`; verificación visual con `pnpm test:e2e`.
