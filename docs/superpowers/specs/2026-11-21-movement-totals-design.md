# Totales de ingresos y egresos de la búsqueda

Fecha: 2026-11-21. Estado: borrador para aprobación. Origen: lista de mejoras de la usuaria ("sumas por tipo de ítem": que en las tablas y en el buscador salga el monto sumado de los registros de la búsqueda global histórica, para un acceso más rápido). Decisiones de la usuaria: solo en `/movements` y en el buscador global; ingresos y egresos por separado. Mockups en el canvas "Holly Money: buscador global" (artboards "Escritorio: resultados y totales", "Móvil: resultados y totales" y "Movimientos: totales de la búsqueda").

## Intención

Hoy la lista muestra 50 filas por página y el buscador 20. Para saber cuánto suman, por ejemplo, los diezmos de una persona, hay que recorrer el historial a mano. Los totales deben salir de **todos** los registros que coinciden con la búsqueda, no solo de los visibles.

## Metas

- `/movements`: sobre la tabla, tarjetas de Ingresos, Egresos y Neto con la suma y la cantidad de registros de todo lo que coincide con el filtro actual (texto y tipo), sin importar la página.
- Buscador global (⌘/Ctrl+K): una franja de totales encima del pie con la suma de todo lo coincidente con el texto buscado.
- Los totales son exactos sobre todo el historial y rápidos (una consulta agregada, sin bajar filas).
- Los movimientos anulados nunca suman.

## No metas y anti-metas

- No hay totales en otras tablas (ministerios, presupuesto, solicitudes, remuneraciones).
- No se mezclan ingresos y egresos en un solo total sin separar: el neto se muestra aparte, nunca como "el total".
- No cambia la lista, su orden ni su paginación.
- Anti-meta: que el total del buscador o de `/movements` difiera de la lista que se ve al abrir "Ver todos los resultados" con el mismo texto.

## Enfoques considerados

- **A. Función SQL (RPC) que agrega, con los ids de categorías y subcategorías resueltos antes en el servicio. Elegido.** Exacta sobre todo el historial y sin bajar filas. Cuesta una migración y una segunda implementación, en SQL, de la regla de coincidencia sobre `delivered_by`, notas y monto.
- **B. Traer solo la columna `amount` con tope de 10.000 filas y sumar en el servicio.** Sin migración, pero baja filas en cada búsqueda y deja de ser exacta al superar el tope. Descartada.
- **C. Activar los agregados de PostgREST.** Es un ajuste de configuración del proyecto Supabase fuera del repo, sin garantía de que local y remoto se comporten igual. Descartada.

La usuaria dejó la elección en manos del equipo ("aborda esto"); la A era la recomendación.

## Diseño

**Base de datos** (una migración, creada con `pnpm supabase migration new movement_totals`; aplicarla con `pnpm supabase migration up`, nunca con `db reset`; luego `pnpm types:generate`)
- Función `get_movement_totals(p_term TEXT, p_category_ids UUID[], p_subcategory_ids UUID[], p_amount NUMERIC, p_movement_type TEXT)` que devuelve filas `(movement_type TEXT, total NUMERIC, record_count BIGINT)`, una por tipo con registros.
- Cuenta solo `status = 'ACTIVE'`. `p_movement_type` nulo significa ambos tipos.
- Si `p_term` es nulo, no hay filtro de texto. Si no, un movimiento coincide si `delivered_by ILIKE '%' || p_term || '%'`, o `notes ILIKE …`, o `category_id = ANY(p_category_ids)`, o `subcategory_id = ANY(p_subcategory_ids)`, o (`p_amount IS NOT NULL AND amount = p_amount`). Es la misma regla que `list` aplica con PostgREST (los `%` y `_` escritos por el usuario siguen siendo comodines, como ya ocurre hoy).
- `SECURITY INVOKER`, así que aplica RLS (`movements_select` permite leer a todo usuario autenticado, igual que hoy). `REVOKE EXECUTE … FROM PUBLIC, anon` y `GRANT EXECUTE … TO authenticated`. Se invoca con el cliente del usuario: no hay uso nuevo del cliente admin ni cambios en la lista blanca de CI. Esto difiere del patrón de las RPC de resumen (que son `SECURITY DEFINER` y se revocan a `authenticated`) a propósito: esas saltan RLS; esta no.

**Servicio** (`services/movements/movements.service.ts`)
- La lógica que ya resuelve los ids de categorías y subcategorías por nombre dentro de `list` pasa a un helper privado compartido por `list` y el nuevo método, para que ambos coincidan siempre. La interpretación del monto ("solo `^\d+$` o con puntos de miles") sale a una función pura exportada `parseAmountTerm(term: string): number | null` en `lib/utils/movement-search.ts`, usada por `buildMovementSearchFilter` y por el nuevo método.
- `movementsService.totals(db, { search, movement_type }): Promise<MovementTotals>`, con `MovementTotals = { income: { total: number; count: number }; expense: { total: number; count: number }; net: number }`. El texto pasa por `sanitizePostgrestSearch`; un texto vacío significa "sin filtro de texto". Sin filas devuelve ceros. Un error de la base se lanza.

**Superficies**
- `/movements` (`app/(dashboard)/movements/page.tsx`): llama a `totals` con el mismo `search` y `movement_type` de la lista (no con `page`). Si el filtro de estado es "Anulado", no se muestra el panel (los anulados no suman). Nuevo componente `MovementTotalsSummary({ totals, movementType })`: tarjetas Ingresos y Egresos; con filtro de tipo solo la tarjeta que corresponde; el Neto solo cuando se ven ambas. Texto aclaratorio: "Suma de las N coincidencias de todo el historial, no solo de esta página. Los movimientos anulados no suman." (N = suma de ambas cantidades).
- Buscador global: la acción `searchMovements` devuelve `{ results: MovementSearchResult[]; totals: MovementTotals | null }`, con los totales calculados en la misma llamada (en paralelo con la lista). `totals` es `null` si la consulta es corta o inválida. `GlobalSearch` muestra la franja "Total histórico · N coincidencias / Sin anulados" con Ingresos, Egresos y Neto, entre la lista y el pie, solo cuando hay resultados.
- Formato: `formatCLP`; "14 registros" / "1 registro". Los colores y tamaños siguen los artboards del canvas (el rojo y el verde de los textos con contraste suficiente).

**Pruebas**
- Jest sobre `parseAmountTerm` y sobre el servicio: parámetros exactos de la RPC (ids resueltos, término sanitizado, monto parseado, tipo), mapeo de filas a `MovementTotals`, cero filas, texto vacío y error lanzado.
- Jest sobre la acción: forma nueva `{ results, totals }`, `totals: null` para consulta corta, y los rechazos de siempre.
- Pruebas de componente: `MovementTotalsSummary` (ambos tipos, solo ingresos, solo egresos, singular y plural) y la franja del buscador (aparece con resultados, no con vacío ni error).
- Prueba de integración (junto a las de `services/__integration__`, omitida sin Supabase local): para varios textos (nombre, categoría, subcategoría, monto, sin coincidencias) compara el conteo de `list` (sin anulados) con `record_count` de la RPC, para evitar que las dos implementaciones de la regla se separen con el tiempo.

## Decisiones mías (revisar)

- Enfoque A, con `SECURITY INVOKER` y permiso para `authenticated`.
- El Neto solo aparece cuando se muestran ambos tipos; con el panel oculto para el estado "Anulado".
- Los totales del buscador no tienen filtro de tipo (suman ingresos y egresos de lo buscado, por separado).
- La coincidencia de texto de la RPC no es insensible a tildes (igual que `list`).

## Queda para quien construya

Nombre de archivos y de la migración, el detalle de estilos de las tarjetas, y cómo mostrar cantidades grandes en la franja del buscador.
