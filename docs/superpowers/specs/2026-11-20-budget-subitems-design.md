# Presupuesto: sub-ítems, fondo por solicitud, varios años y eliminar ministerio

Fecha: 2026-11-20. Origen: reunión con la usuaria de la aplicación. Estado: borrador para aprobación.

## Intención

La usuaria arma el presupuesto de la iglesia por año y necesita:

1. Eliminar un ministerio (solo ADMIN).
2. Dividir cada partida del presupuesto (un ministerio, o un ítem que no es ministerio como remuneraciones o directorio) en sub-ítems con monto propio, que se pueden ir agregando.
3. Crear más de un presupuesto, en particular el del año siguiente mientras el actual sigue vigente.
4. Al crear el presupuesto nuevo, ver el anterior como base (solo lectura) para copiarlo o iterarlo.
5. Ver fácilmente cuánto queda por ítem y sub-ítem, en tesorería y en cada ministerio.
6. Que tesorería elija el fondo (sub-ítem) del que se descuenta cada solicitud.

## Metas

- Restante visible por sub-ítem para ADMIN, BURSAR y FINANCE (en `/budgets`) y para cada ministro (en el detalle de su ministerio).
- Preparar el presupuesto del año siguiente sin tocar el vigente.
- Los totales siempre cuadran: el total de un padre con sub-ítems es la suma de ellos.

## No metas y anti-metas

- Sin bloqueo duro: el presupuesto sigue siendo informativo (decisión previa de la Etapa 10). Una solicitud puede superar el restante.
- El ministro no elige ni ve el fondo al solicitar. No se agrega nada al formulario de solicitudes.
- Sin presupuestos simultáneos para las mismas fechas (anual más campaña). La usuaria confirmó que solo necesita uno por año.
- Sin borrado físico de ministerios con historial. Eso rompería auditoría y reportes.
- No se modifican las tablas `ministry_budgets` ni `budget_items` más de lo necesario.

## Restricciones del código actual

- `budget_periods` tiene `EXCLUDE ... daterange WITH &&` (sin solapamiento) y `/budgets` solo muestra el período vigente. Por eso hoy no se puede crear el siguiente.
- `ministry_budgets` (UNIQUE ministerio + período) y `budget_items` (partidas que no son ministerio) son tablas separadas.
- El "usado" de un ministerio sale del RPC `get_ministry_budget_summary`: transferencias TRANSFER aprobadas con transferencia registrada (por fecha de transferencia), más reembolsos REIMBURSEMENT aprobados (por fecha de revisión), más `initial_used_amount`. El "usado" de un ítem sale de los egresos de su categoría vinculada dentro de las fechas del período.
- Los RPC de resumen son `SECURITY DEFINER` y solo los invoca `service_role` (migración `20261115183459`). Los sub-ítems siguen el mismo patrón.
- `budget_intentions` se desacopló a propósito del presupuesto en la Etapa 10. Aquí solo gana una referencia opcional y sin bloqueos.
- Los ministerios tienen `is_active` y varias tablas los referencian por FK (`budget_intentions`, `ministry_assignments`, `ministry_delegates`, `ministry_budgets`).
- Reglas de repo: migraciones con `pnpm supabase migration new`, tipos con `pnpm types:generate`, sin `db reset`, llamadas al cliente admin solo desde archivos autorizados en la CI, permisos con `can()`.

## Enfoques considerados

**Período / año**
- A. Año calendario estricto con fechas decorativas. Descartado: los gastos de enero y febrero caerían en el presupuesto del año siguiente, y los números no calzan con el año de la iglesia (marzo a marzo, confirmado).
- B. El año identifica el presupuesto y las fechas se calculan solas (1 de marzo del año → último día de febrero del año siguiente). Elegido.

**Quién imputa el gasto a un sub-ítem**
- El ministro lo elige al solicitar. Descartado por la usuaria: el ministro no decide a qué va cada monto.
- Valor manual de "usado" por sub-ítem, mantenido por tesorería. Descartado: hay que mantener la cifra a mano.
- Tesorería elige el fondo al aprobar la solicitud. Elegido. Aplica a transferencias y reembolsos, y se guarda en la solicitud, no en la transferencia.

**Relación entre el total del padre y sus sub-ítems**
- A. El total es la suma de los sub-ítems. Elegido.
- B. El padre tiene monto propio y los sub-ítems son un desglose. Descartado: permite que ambos no cuadren.

## Diseño

### 1. Períodos como años (puntos 3 y 4)

- `budget_periods` gana `year INT NOT NULL UNIQUE`. Las fechas se calculan a partir del año con inicio el 1 de marzo y fin el último día de febrero del año siguiente.
- Las fechas se mantienen en la tabla (los cálculos de gasto las usan) y la restricción de no solapamiento se conserva como red de seguridad, pero el formulario deja de pedirlas: el usuario solo elige el año y el `label` se propone ("Presupuesto 2027").
- Migración de datos existentes: el `year` de cada período existente es el año de su `start_date`. **Decisión mía.** Si dos períodos existentes comparten ese año, hay que revisarlos a mano antes de aplicar la migración.
- `/budgets` muestra un selector de años. Por defecto, el año vigente (el que contiene la fecha de hoy). Los años futuros se ven solo en `/budgets`, para quien tiene `MANAGE_BUDGETS`.
- Crear el presupuesto del año siguiente muestra el anterior en un panel de solo lectura al lado. Cada ministerio, cada ítem y cada sub-ítem tiene un botón "copiar", y hay un "copiar todo". Lo copiado queda editable en el nuevo presupuesto y no modifica el anterior. Los montos "usado inicial" no se copian. **Decisión mía.**

### 2. Sub-ítems (punto 2)

Nueva tabla `budget_sub_items`:

- `id`, `name`, `assigned_amount` (> 0), `notes`, `is_active`, `created_by`, `created_at`, `updated_at`.
- El padre es `ministry_budget_id` o `budget_item_id`, exactamente uno de los dos (CHECK). Ambos con FK.
- Nombre único por padre entre los activos (mismo criterio que `budget_items`).
- Los sub-ítems se desactivan, no se borran (igual que `budget_items`).
- Para un sub-ítem de un ítem que no es ministerio, `category_id` opcional (categoría de egreso), con la misma regla que `budget_items`.
- RLS: lectura para ADMIN, BURSAR y FINANCE. Un MINISTER ve los sub-ítems de los ministerios a los que está asignado (`get_my_active_ministries()`). Escritura para quienes tienen `MANAGE_BUDGETS`.

Total del padre: mientras un padre tenga sub-ítems activos, su monto asignado es la suma y ya no se edita a mano. Mientras no tenga sub-ítems, el monto sigue editándose como hoy. Se calcula en el RPC de resumen. No se duplica en una columna. **Decisión mía.**

### 3. Fondo por solicitud (punto 6)

- `budget_intentions` gana `budget_sub_item_id UUID NULL REFERENCES budget_sub_items(id)`.
- Solo permite sub-ítems del ministerio de la solicitud (validación en el servicio y en un CHECK/trigger).
- Tesorería lo elige al aprobar (acción de `REVIEW_INTENTIONS`). Es opcional. **Decisión mía.** Si queda vacío, el gasto cuenta en "sin asignar" del ministerio.
- Se puede cambiar mientras la solicitud no esté rendida. Cada cambio deja auditoría.
- El ministro no ve el selector. Sí ve el restante resultante.

### 4. Restante (punto 5)

- Un RPC nuevo `get_budget_sub_items_summary(p_period_id)`, solo `service_role`. Devuelve por sub-ítem: asignado, usado y restante.
  - Sub-ítem de ministerio: usado = suma de las solicitudes con ese fondo, con las mismas reglas de transferencia y reembolso que el RPC actual.
  - Sub-ítem de un ítem que no es ministerio: usado = egresos de la categoría vinculada dentro de las fechas del período.
  - Restante con signo real (puede ser negativo).
- El resumen del ministerio suma sus sub-ítems y agrega una línea "sin asignar" con el gasto de solicitudes sin fondo. El restante del ministerio = suma de sub-ítems − (usado de sub-ítems + sin asignar).
- Un ministerio sin sub-ítems se comporta como hoy.
- Pantallas:
  - `/budgets`: filas expandibles por padre con sus sub-ítems.
  - Detalle del ministerio (`ministries/[id]`): tabla de sub-ítems con asignado, usado y restante, visible para el ministro asignado.

### 5. Eliminar ministerio (punto 1)

- Solo ADMIN (permiso nuevo o existente, por decidir en el plan; no se compara el nombre del rol).
- Si el ministerio no tiene historial (solicitudes, presupuestos, delegados, asignaciones, movimientos vinculados), se elimina físicamente tras confirmar escribiendo el nombre. Si tiene historial, la acción lo impide y ofrece desactivarlo. **Decisión mía.**
- Se registra en `system_audit_log`. Va por el servicio de ministerios, con comprobación previa y de nuevo dentro de una función de base de datos para evitar condiciones de carrera.
- Excepción documentada: CLAUDE.md dice "No deletions" para movimientos. Esto aplica a ministerios y no cambia esa regla.

## Para quien construye

- Orden sugerido: (a) eliminar ministerio, independiente; (b) períodos por año y selector; (c) sub-ítems y RPC de resumen; (d) fondo por solicitud; (e) panel "copiar desde el año anterior".
- Pendientes que decide quien construye: nombre del permiso para eliminar ministerios; textos en español; diseño visual de las filas expandibles; cómo mostrar un restante negativo (el criterio actual es mostrar el signo real).
- Cada cambio de esquema es una migración con `pnpm supabase migration new`, con tipos regenerados. Las funciones nuevas con `SECURITY DEFINER` revocan `EXECUTE` a `anon` y `authenticated`.
- Cada mutación de presupuesto y de solicitud pasa por `auditService`.
- Cada archivo nuevo que use `createSupabaseAdminClient` se agrega al `ALLOWED` del chequeo de la CI.
- Pruebas: Jest para el servicio y el cálculo; RLS en `services/__integration__/rls.test.ts` para `budget_sub_items` y `budget_intentions`.
