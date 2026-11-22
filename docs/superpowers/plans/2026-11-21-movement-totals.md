# Totales de ingresos y egresos de la búsqueda Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mostrar la suma y la cantidad de ingresos y egresos de todos los movimientos que coinciden con la búsqueda, sobre la tabla de `/movements` y en la franja de totales del buscador global.

**Architecture:** Una función SQL `get_movement_totals` (SECURITY INVOKER) agrega por tipo. `movementsService.totals` resuelve los ids de categorías y subcategorías, parsea el monto y llama a la RPC con el cliente del usuario. La acción `searchMovements` pasa a devolver `{ results, totals }`; `GlobalSearch` pinta la franja y `/movements` pinta `MovementTotalsSummary`.

**Tech Stack:** Next.js 16 App Router, Supabase Postgres (migración + RLS), supabase-js, Zod, jest + Testing Library, `components/ui/command.tsx` (cmdk).

**Spec:** `docs/superpowers/specs/2026-11-21-movement-totals-design.md`

## Global Constraints

- Siempre `pnpm`, nunca `npm` ni `yarn`. Nunca ejecutar `pnpm prettier` (el script reescribe decenas de archivos): formatear solo archivos propios con `pnpm exec prettier --write <archivos>`, o confiar en `pnpm lint`.
- Estilo: sin punto y coma, comillas dobles, `printWidth` 100, sin comas finales.
- Identificadores, archivos, tablas y rutas en inglés; el español solo en textos de UI.
- Migraciones solo con `pnpm supabase migration new …` y aplicadas con `pnpm supabase migration up`; NUNCA `pnpm supabase db reset`. Después, `pnpm types:generate`; `types/database.types.ts` no se edita a mano.
- La RPC es `SECURITY INVOKER` (aplica RLS), con `REVOKE EXECUTE … FROM PUBLIC, anon` y `GRANT EXECUTE … TO authenticated`. Se llama con el cliente del usuario: sin nuevos usos de `createSupabaseAdminClient`.
- Lógica de negocio en `services/`; acciones y páginas no llaman a la base directamente.
- Todo texto del usuario pasa por `sanitizePostgrestSearch` antes de llegar a un filtro o a la RPC.
- Los anulados (`status = CANCELLED`) nunca suman. Ingresos y egresos se muestran por separado; el Neto solo cuando se ven ambos.
- `formatCLP` de `lib/utils.ts` para montos; "N registros" / "1 registro".
- `pnpm run ci` y `pnpm test` deben pasar con cero advertencias de lint.

## Review Focus

- Un movimiento anulado no suma nunca (Task 1).
- La RPC no es invocable por `anon` (Task 1).
- Un texto solo numérico ("20.000") coincide por monto exacto, igual que en la lista (Tasks 2 y 3).
- El conteo de la RPC coincide con el de `list` (sin anulados) para el mismo texto: nombre, categoría, subcategoría, monto y sin coincidencias (Task 2, integración).
- Si falla el cálculo de totales, la lista o los resultados del buscador siguen funcionando, sin el panel (Tasks 3 y 4).
- Con cero coincidencias no se muestra un panel con "0 coincidencias" (Task 4); con el filtro de estado "Anulado" el panel se oculta (Task 4).
- Con el filtro de tipo, solo la tarjeta que corresponde, y sin Neto (Task 4).

---

### Task 0: Rama y documentos

**Files:**
- Create: `docs/superpowers/specs/2026-11-21-movement-totals-design.md` (ya existe sin commitear)
- Create: `docs/superpowers/plans/2026-11-21-movement-totals.md` (este archivo)

- [ ] **Step 1: Crear la rama desde el `main` local**

Run: `git switch -c feat/movement-totals main`
Si git se niega por el `CLAUDE.md` modificado, ejecutar `git stash push CLAUDE.md` y repetir. Debe ejecutarse sin otra rama en ejecución en el mismo directorio.
Expected: `git branch --show-current` imprime `feat/movement-totals`.

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-21-movement-totals-design.md docs/superpowers/plans/2026-11-21-movement-totals.md
git commit -m "docs: spec y plan de totales de ingresos y egresos de la búsqueda"
```
Terminar el mensaje con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session:` de la atribución de la sesión.

---

### Task 1: Migración de `get_movement_totals`

**Files:**
- Create: `supabase/migrations/<timestamp>_movement_totals.sql` (generado con `pnpm supabase migration new movement_totals`)
- Modify: `types/database.types.ts` (solo regenerado con `pnpm types:generate`)
- Test: `services/__integration__/movement-totals.test.ts` (nuevo; sigue el patrón de `services/__integration__/rls.test.ts`: omitido sin Supabase local, y registrar en su comentario de fechas de fixture un año nuevo y libre, por ejemplo 2096-01)

**Interfaces:**
- Produces (SQL): `get_movement_totals(p_term TEXT DEFAULT NULL, p_category_ids UUID[] DEFAULT NULL, p_subcategory_ids UUID[] DEFAULT NULL, p_amount NUMERIC DEFAULT NULL, p_movement_type TEXT DEFAULT NULL) RETURNS TABLE (movement_type TEXT, total NUMERIC, record_count BIGINT)`, `LANGUAGE sql STABLE SECURITY INVOKER`, una fila por tipo con al menos un registro.
- Semántica: solo `status = 'ACTIVE'`; `p_movement_type` nulo significa ambos tipos; si `p_term` es nulo no hay filtro de texto; si no, el movimiento coincide si `delivered_by ILIKE '%' || p_term || '%'` o `notes ILIKE '%' || p_term || '%'` o `category_id = ANY(COALESCE(p_category_ids, '{}'))` o `subcategory_id = ANY(COALESCE(p_subcategory_ids, '{}'))` o (`p_amount IS NOT NULL AND amount = p_amount`). `movement_type` se devuelve convertido a texto.
- Produces (TS): `Database["public"]["Functions"]["get_movement_totals"]` en `types/database.types.ts`.

- [ ] **Step 1: Escribir el test de integración**

En `services/__integration__/movement-totals.test.ts` (patrón de `describeIfLocal`, clientes y limpieza de `rls.test.ts`): con un marcador único en `notes` (por ejemplo `"MOVTOT-" + Date.now()`) insertar con el cliente de servicio cuatro movimientos de fixture con fechas del año reservado: ingreso 1000 y ingreso 2500 (activos), egreso 400 (activo) e ingreso 7000 anulado. Con un usuario autenticado de prueba (el mismo mecanismo que usa `rls.test.ts`) llamar `rpc("get_movement_totals", { p_term: marcador })` y comprobar:
- ingresos `total` 3500 con `record_count` 2 (el anulado no suma) y egresos `total` 400 con `record_count` 1;
- con `p_movement_type: "INCOME"` solo la fila de ingresos;
- con `p_term` del marcador más `p_amount: 400` coincide el egreso también por monto (sin duplicarlo);
- un `p_term` sin coincidencias devuelve cero filas;
- un cliente sin sesión (solo clave pública) recibe un error de permiso al invocar la RPC.
Limpiar los fixtures al terminar con el cliente de servicio, como el resto de los archivos de esa carpeta.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test services/__integration__/movement-totals.test.ts`
Expected: FAIL (la función no existe) con la pila local de Supabase levantada. Si el entorno no permite correr los tests de integración, anotar por qué en el reporte y verificar la RPC con otra consulta de solo lectura.

- [ ] **Step 3: Crear y aplicar la migración**

Run: `pnpm supabase migration new movement_totals`, escribir la función con las firmas y la semántica de **Interfaces**, `REVOKE EXECUTE ON FUNCTION get_movement_totals(TEXT, UUID[], UUID[], NUMERIC, TEXT) FROM PUBLIC, anon;` y `GRANT EXECUTE … TO authenticated;`. Aplicar con `pnpm supabase migration up` (nunca `db reset`) y regenerar tipos con `pnpm types:generate`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test services/__integration__/movement-totals.test.ts && pnpm typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations types/database.types.ts services/__integration__/movement-totals.test.ts
git commit -m "feat(movements): función SQL de totales por tipo"
```

---

### Task 2: Servicio `totals` y helpers compartidos

**Files:**
- Create: `types/movement-totals.ts`
- Modify: `lib/utils/movement-search.ts`, `services/movements/movements.service.ts`
- Test: `lib/utils/__tests__/movement-search.test.ts`, `services/movements/__tests__/movements.service.test.ts` (nuevo `describe("totals")`; extender el mock con `rpc`), `services/__integration__/movement-totals.test.ts` (nuevo `describe` de comparación con `list`)

**Interfaces:**
- Consumes: la RPC `get_movement_totals` de la Task 1.
- Produces: `types/movement-totals.ts` exporta `type MovementTotals = { income: { total: number; count: number }; expense: { total: number; count: number }; net: number }`.
- Produces: `parseAmountTerm(term: string): number | null` en `lib/utils/movement-search.ts` — `^\d+$` o puntos de miles (`^\d{1,3}(\.\d{3})+$`), con los puntos quitados; cualquier otro texto, `null`. `buildMovementSearchFilter` pasa a usarla (mismo comportamiento).
- Produces: `movementsService.totals(db: DB, filters: { search?: string; movement_type?: "INCOME" | "EXPENSE" | "ALL" }): Promise<MovementTotals>`.
- Internamente, el servicio gana un helper privado `resolveSearchMatches(db: DB, term: string): Promise<{ categoryIds: string[]; subcategoryIds: string[] }>` extraído del bloque de `list` y usado por `list` y `totals`.

- [ ] **Step 1: Escribir los tests**

- `parseAmountTerm`: `"20.000"` → `20000`; `"15000"` → `15000`; `"1.5"`, `"20.00050"`, `"mabel 2"` y `""` → `null`.
- Servicio, `totals` (con mocks de las consultas de categorías/subcategorías y de `db.rpc`):
  - `totals(db, { search: "mabel", movement_type: "ALL" })` llama a `rpc("get_movement_totals", { p_term: "mabel", p_category_ids: [<ids>], p_subcategory_ids: [<ids>], p_amount: null, p_movement_type: null })`;
  - `{ search: "20.000", movement_type: "INCOME" }` pasa `p_amount: 20000` y `p_movement_type: "INCOME"`;
  - sin texto (`search` vacío o solo espacios) no consulta categorías, y pasa `p_term: null`, `p_category_ids: null`, `p_subcategory_ids: null`, `p_amount: null`;
  - el texto llega sanitizado (`"a,(b)"` → `p_term: "ab"`);
  - filas `[{ movement_type: "INCOME", total: 485000, record_count: 14 }, { movement_type: "EXPENSE", total: 12400, record_count: 1 }]` → `{ income: { total: 485000, count: 14 }, expense: { total: 12400, count: 1 }, net: 472600 }`;
  - cero filas → todo en cero; una fila de un solo tipo deja el otro en cero;
  - el error de la RPC y el error de cualquiera de las consultas de ids se lanzan, no se tragan;
  - los tests existentes de `list` siguen pasando (el refactor del helper no cambia su comportamiento).
- Integración (en `movement-totals.test.ts`, con los fixtures del archivo): para el marcador, un nombre de categoría de fixture, un monto de fixture y un texto sin coincidencias, `totals(...).income.count + expense.count` es igual al `count` de `list(...)` con `status: "ACTIVE"` para el mismo texto.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test lib/utils/__tests__/movement-search.test.ts services/movements`
Expected: FAIL (`parseAmountTerm` y `totals` no existen).

- [ ] **Step 3: Implementar**

`totals`: sanear el texto; con texto, resolver ids con el helper y llamar a la RPC; mapear las filas (convertir `total` y `record_count` con `Number`) y calcular `net = income.total - expense.total`. Dejar `list` usando el helper sin cambiar su comportamiento.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test lib/utils services/movements services/__integration__/movement-totals.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add types/movement-totals.ts lib/utils/movement-search.ts lib/utils/__tests__/movement-search.test.ts services/movements/movements.service.ts services/movements/__tests__/movements.service.test.ts services/__integration__/movement-totals.test.ts
git commit -m "feat(movements): servicio de totales de la búsqueda"
```

---

### Task 3: Acción `searchMovements` y franja de totales en el buscador

**Files:**
- Modify: `app/actions/movements.ts` (tipo y acción `searchMovements`), `components/dashboard/global-search.tsx`
- Test: `app/actions/__tests__/movements.test.ts`, `components/dashboard/__tests__/global-search.test.tsx`

**Interfaces:**
- Consumes: `movementsService.totals` y `MovementTotals` de la Task 2.
- Produces: `type MovementSearchResponse = { results: MovementSearchResult[]; totals: MovementTotals | null }` y `searchMovements(query: string): Promise<MovementSearchResponse>`, exportados desde `app/actions/movements.ts`. Consulta corta o inválida → `{ results: [], totals: null }`.

- [ ] **Step 1: Escribir los tests**

- Acción (actualizar los de `searchMovements` a la forma nueva): sin sesión o sin permiso rechaza igual y no llama a ningún servicio; consulta corta → `{ results: [], totals: null }` sin llamadas; `searchMovements("  mabel ")` llama a `list` con `{ search: "mabel", status: "ALL", pageSize: 20 }` y a `totals` con `{ search: "mabel", movement_type: "ALL" }`, y devuelve `{ results: <mapeados>, totals: <lo que devuelve totals> }`; si `totals` rechaza, devuelve los resultados con `totals: null` y registra el error con `console.error` (el test espía `console.error` para mantener la salida limpia); si `list` rechaza, la acción rechaza.
- Componente (los mocks de `searchMovements` pasan a resolver `{ results, totals }`): con resultados y totales con `income: { total: 485000, count: 14 }` y `expense: { total: 12400, count: 1 }` aparece la franja con "Total histórico · 15 coincidencias", "Sin anulados", "Ingresos", "$485.000", "14 registros", "Egresos", "$12.400", "1 registro", "Neto" y "$472.600"; con `totals: null` no hay franja pero sí resultados; con lista vacía, en carga o con error no hay franja; la franja no es un elemento seleccionable (Enter sobre el primer resultado sigue navegando a `/movements/<id>`); los tests existentes de carga, respuestas viejas, anulados y pie siguen pasando.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test app/actions/__tests__/movements.test.ts components/dashboard`
Expected: FAIL (forma antigua de la acción y sin franja).

- [ ] **Step 3: Implementar**

La acción lanza `list` y `totals` en paralelo (`Promise.all`), capturando solo el error de `totals`. `GlobalSearch` guarda `totals` junto a `results` (se limpia en los mismos puntos que `results`) y muestra la franja entre los grupos de resultados y el pie, solo cuando `status === "done"`, hay resultados y `totals` no es nulo. Marcado según el artboard "Escritorio: resultados y totales" del canvas: encabezado con el texto de cantidad y "Sin anulados", y tres bloques (Ingresos, Egresos, Neto con la leyenda "Ing. menos egr."); texto de ingresos/egresos con los tokens `text-on-income` y `text-on-expense` existentes, `formatCLP` para los montos y `aria-label="Totales de la búsqueda"` en el contenedor. En el nombre del tipo y en la franja, "Ingresos"/"Egresos" van en español como el resto de la UI.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test app/actions components/dashboard && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add app/actions/movements.ts app/actions/__tests__/movements.test.ts components/dashboard/global-search.tsx components/dashboard/__tests__/global-search.test.tsx
git commit -m "feat(dashboard): totales de ingresos y egresos en el buscador global"
```

---

### Task 4: Totales en `/movements` y verificación

**Files:**
- Create: `components/movements/movement-totals-summary.tsx`
- Modify: `app/(dashboard)/movements/page.tsx`
- Test: `components/movements/__tests__/movement-totals-summary.test.tsx`

**Interfaces:**
- Consumes: `MovementTotals` (Task 2) y `movementsService.totals` (Task 2).
- Produces: `export function MovementTotalsSummary(props: { totals: MovementTotals; movementType: "ALL" | "INCOME" | "EXPENSE" }): JSX.Element | null`. Devuelve `null` si `income.count + expense.count` es 0.

- [ ] **Step 1: Escribir los tests del componente**

- `movementType="ALL"` con `income: { total: 485000, count: 14 }`, `expense: { total: 12400, count: 1 }`, `net: 472600`: aparecen las tres tarjetas ("Ingresos" "$485.000" "14 registros"; "Egresos" "$12.400" "1 registro"; "Neto" "$472.600") y el texto "Suma de las 15 coincidencias de todo el historial, no solo de esta página. Los movimientos anulados no suman.".
- `movementType="INCOME"`: solo Ingresos, sin Egresos ni Neto, y el texto usa la cantidad de ingresos (14).
- `movementType="EXPENSE"`: solo Egresos (con "1 registro"), sin Neto.
- Con cero registros en ambos tipos devuelve `null` (contenedor vacío).
- La región tiene `aria-label="Totales de la búsqueda"`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/movements/__tests__/movement-totals-summary.test.tsx`
Expected: FAIL, el componente no existe.

- [ ] **Step 3: Implementar el componente y la página**

Componente según el artboard "Movimientos: totales de la búsqueda" del canvas: tarjetas en fila (`flex`, se apilan en móvil con `flex-col sm:flex-row`), etiqueta en mayúsculas pequeñas, monto grande con `tabular-nums` y los tokens `text-on-income` / `text-on-expense`, y la línea de cantidad. En `app/(dashboard)/movements/page.tsx`: cuando `status !== "CANCELLED"` pedir `movementsService.totals(db, { search, movement_type })` en paralelo con `list` (`Promise.all`); si `totals` falla, registrar el error y no mostrar el panel (la lista debe seguir cargando). Mostrar `MovementTotalsSummary` entre los filtros y la tabla. No tocar la paginación ni el orden.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test components/movements && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Verificación completa**

Run: `pnpm run ci && pnpm test`
Expected: lint y typecheck sin errores ni advertencias; todos los tests pasan, incluida la integración si hay Supabase local.

- [ ] **Step 6: Probar en el navegador**

Con la base local y el servidor de desarrollo ya levantados, usando `playwright-cli` (regla del repo) y SIN ejecutar nunca `pnpm supabase db reset`: como ADMIN, en `/movements` sin filtros comprobar que las tres tarjetas aparecen y que la suma de ingresos coincide con lo esperable de los datos locales (cotejar contra una consulta de solo lectura o con la lista); con `?search=` de un nombre, una categoría y un monto existentes comprobar que el total cubre todas las páginas (no solo las 50 filas); con el filtro de tipo "Ingreso" solo la tarjeta de ingresos; con estado "Anulado" el panel desaparece; en el buscador global (Ctrl+K) la franja con los mismos números que `/movements?search=<mismo texto>`; y el diseño a 390 px. Anotar qué se probó y qué no. No hacer push ni PR.

- [ ] **Step 7: Commit**

```bash
git add components/movements/movement-totals-summary.tsx components/movements/__tests__/movement-totals-summary.test.tsx "app/(dashboard)/movements/page.tsx"
git commit -m "feat(movements): totales de ingresos y egresos en la lista de movimientos"
```
