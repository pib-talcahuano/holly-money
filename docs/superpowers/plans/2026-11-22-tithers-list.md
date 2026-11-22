# Lista de diezmadores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página `/tithers` ("Diezmadores") con la lista de quienes dan diezmo en un año (nombre, diezmos, total, tendencia mensual, último diezmo) y, al hacer clic en un nombre, un diálogo con el gráfico de barras mes a mes y el detalle mensual.

**Architecture:** Funciones puras en `lib/utils/tithers.ts` agrupan las filas de movimientos de la categoría Diezmos (por nombre normalizado, con arreglos de 12 meses). `tithersService.list` busca la categoría, trae las filas del año paginando de 1000 en 1000 y agrupa. La página (server component) renderiza un resumen, un filtro por nombre y la tabla; el diálogo carga Recharts bajo demanda.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), Recharts vía `components/ui/chart.tsx`, `Dialog` y `NativeSelect` de `components/ui/`, jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-22-tithers-list-design.md`

**Referencia visual:** el canvas "Holly Money: buscador global" (https://claude.ai/artifact/5e4ew8tPZFdTU5a1JPbsD5; es privado y los subagentes no pueden abrirlo: usar la descripción de cada tarea) y, sobre todo, las capturas reales de la app en `docs/screenshots/` (por ejemplo `01-movements/list.png` y `07-dashboard/admin.png`, que se pueden abrir con la herramienta de lectura de imágenes): copiar de ahí el lenguaje visual (franja de resumen con un bloque violeta sólido, tabla en tarjeta con encabezados en mayúsculas pequeñas, píldoras violeta, títulos con subtítulo).

## Global Constraints

- Siempre `pnpm`, nunca `npm` ni `yarn`. Nunca ejecutar `pnpm prettier` (reescribe decenas de archivos): formatear solo archivos propios con `pnpm exec prettier --write <archivos>`, o confiar en `pnpm lint`. Nunca `pnpm supabase db reset`.
- Estilo: sin punto y coma, comillas dobles, `printWidth` 100, sin comas finales.
- Identificadores, archivos, rutas y tablas en inglés (la ruta es `/tithers`); el español solo en textos de UI.
- Sin migración, sin nuevos usos de `createSupabaseAdminClient`, sin permiso nuevo: la página exige `VIEW_MOVEMENT` con `can(user.permissions, PERMISSIONS.VIEW_MOVEMENT)`.
- Lógica de negocio en `services/`; páginas y acciones no llaman a la base directamente.
- Los componentes de `components/ui/` son shadcn sobre `@base-ui/react`; no cambiar a Radix.
- Solo movimientos `ACTIVE` de la categoría de ingreso "Diezmos" (constante `TITHES_CATEGORY_NAME`), con `movement_date` dentro del año pedido (1 de enero a 31 de diciembre).
- Montos con `formatCLP`, fechas con `formatDate` de `lib/utils.ts`. El mes de un movimiento sale del texto `YYYY-MM-DD` de `movement_date`, sin conversión de zona.
- Recharts solo se carga bajo demanda (`next/dynamic`, como `components/dashboard/dashboard-charts-lazy.tsx`).
- `pnpm run ci` y `pnpm test` deben pasar con cero advertencias de lint.

## Review Focus

- Más de 1000 filas en un año: la paginación no pierde ni duplica filas (orden determinista con `id` como último desempate) (Task 2).
- Un diezmo del 31 de diciembre va a diciembre y uno del 1 de enero a enero del año siguiente: no se mezclan años ni meses (Tasks 1 y 2).
- "Sin nombre" va al final, no cuenta como diezmador y no tiene enlace (Tasks 1 y 3).
- Un `?year=` inválido o fuera de rango usa el año actual, sin error (Task 1).
- Si la categoría Diezmos no existe, la página muestra un aviso y no falla (Tasks 2 y 4).
- Un nombre con espacios, tildes, `&` o `#` se codifica bien en el enlace a `/movements` (Tasks 1 y 3).
- El diálogo tiene título, se cierra con Escape y el equivalente accesible del gráfico (tabla de 12 meses) está en el DOM (Task 3).
- Sin `VIEW_MOVEMENT` la página redirige a `/dashboard`; el enlace de la barra lateral solo lo ven ADMIN, BURSAR y FINANCE (Task 4).

---

### Task 0: Rama y documentos

**Files:**
- Create: `docs/superpowers/specs/2026-11-22-tithers-list-design.md` (ya existe sin commitear)
- Create: `docs/superpowers/plans/2026-11-22-tithers-list.md` (este archivo)

- [ ] **Step 1: Crear la rama desde `origin/main`**

Esta mejora usa `normalizeName` y la búsqueda con totales de `/movements`, que ya están en `origin/main` (PR #138 fusionado). Run: `git fetch origin main && git switch -c feat/tithers-list origin/main`. No modificar el `main` local. Si git se niega por el `CLAUDE.md` modificado, ejecutar `git stash push CLAUDE.md` y repetir. Ejecutar sin otra rama en trabajo en el mismo directorio.
Expected: `git branch --show-current` imprime `feat/tithers-list`.

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-22-tithers-list-design.md docs/superpowers/plans/2026-11-22-tithers-list.md
git commit -m "docs: spec y plan de la lista de diezmadores"
```
Terminar el mensaje con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session:` de la atribución de la sesión.

---

### Task 1: Funciones puras de diezmadores

**Files:**
- Create: `types/tithers.ts`, `lib/utils/tithers.ts`
- Test: `lib/utils/__tests__/tithers.test.ts`

**Interfaces:**
- Consumes: `normalizeName` de `lib/utils/name-suggestions.ts`.
- Produces (`types/tithers.ts`): `type Tither = { key: string; name: string; unnamed: boolean; count: number; total: number; lastDate: string; monthlyTotals: number[]; monthlyCounts: number[] }` (los dos arreglos con 12 posiciones, índice 0 = enero; `key` es el nombre normalizado y `""` para "Sin nombre"), `type TithersTotals = { total: number; count: number; titherCount: number }`, `type TitherRow = { delivered_by: string | null; amount: number; movement_date: string }`.
- Produces (`lib/utils/tithers.ts`): `TITHES_CATEGORY_NAME = "Diezmos"`; `UNNAMED_TITHER_LABEL = "Sin nombre"`; `groupTithers(rows: TitherRow[]): Tither[]` (filas del más reciente al más antiguo); `titherTotals(tithers: Tither[]): TithersTotals`; `sparklinePoints(values: number[], width?: number, height?: number): string` (por defecto 96 y 24); `titherMovementsHref(name: string): string`; `currentYearInSantiago(now?: Date): number`; `parseTithersYear(value: string | undefined, currentYear: number): number`; `titherYearOptions(currentYear: number, count?: number): number[]` (por defecto 5, del año actual hacia atrás).

- [ ] **Step 1: Escribir los tests**

En `lib/utils/__tests__/tithers.test.ts`:
- `groupTithers`:
  - filas `[{ delivered_by: "Hna. Mabel", amount: 20000, movement_date: "2026-11-12" }, { delivered_by: "hna.  mabel", amount: 20000, movement_date: "2026-10-03" }, { delivered_by: "Juan Pérez", amount: 15000, movement_date: "2026-01-05" }]` → dos grupos: "Hna. Mabel" (`count` 2, `total` 40000, `lastDate` "2026-11-12", `monthlyTotals[9]` 20000, `monthlyTotals[10]` 20000, `monthlyCounts[10]` 1, el resto de meses en 0, longitud 12) y "Juan Pérez" (`monthlyTotals[0]` 15000); el nombre mostrado de un grupo es la grafía más usada (en empate, la primera de la entrada);
  - orden: total descendente y, en empate, nombre alfabético con `localeCompare("es")`; las filas con `delivered_by` `null`, `""` o solo espacios forman un único grupo `{ key: "", name: "Sin nombre", unnamed: true }` que va siempre al final aunque su total sea el mayor;
  - un diezmo del `"2026-12-31"` suma en `monthlyTotals[11]` y uno del `"2027-01-01"` en `monthlyTotals[0]` (sin conversión de zona);
  - los montos decimales suman sin errores de redondeo visibles (`10.5 + 20.25` = `30.75`);
  - lista vacía → `[]`.
- `titherTotals`: con los dos grupos con nombre y uno "Sin nombre" de total 42000 y 6 diezmos → `{ total: <suma de todos>, count: <suma de todos>, titherCount: 2 }`; lista vacía → ceros.
- `sparklinePoints`: `([0, 10], 96, 24)` → `"4,22 92,2"`; todos ceros `([0, 0, 0], 96, 24)` → todos los puntos con `y` 22; un solo valor `([5], 96, 24)` → un solo punto con `x` 48; lista vacía → `""`.
- `titherMovementsHref`: `"Hna. Mabel"` → `"/movements?search=Hna.%20Mabel&movement_type=INCOME"`; `"A&B #1"` codifica `&` y `#`.
- `currentYearInSantiago(new Date("2026-12-31T23:30:00-03:00"))` → `2026` y `currentYearInSantiago(new Date("2027-01-01T02:30:00Z"))` → `2026` (en Chile todavía es 31 de diciembre); `currentYearInSantiago(new Date("2027-01-01T04:00:00Z"))` → `2027`.
- `parseTithersYear`: `("2025", 2026)` → `2025`; `(undefined, 2026)`, `("abc", 2026)`, `("1999", 2026)`, `("2099", 2026)` y `("20.5", 2026)` → `2026` (válido: entero entre 2000 y `currentYear`).
- `titherYearOptions(2026)` → `[2026, 2025, 2024, 2023, 2022]` y `titherYearOptions(2026, 2)` → `[2026, 2025]`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test lib/utils/__tests__/tithers.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar**

Agrupar con un `Map` por `normalizeName(delivered_by ?? "")`; la grafía mostrada se elige igual que en `groupNameSuggestions` (la más usada, desempate por primera aparición). El mes sale de `movement_date.slice(5, 7)`. `currentYearInSantiago` usa `Intl.DateTimeFormat` con `timeZone: "America/Santiago"` y `formatToParts`, igual que `lib/utils/late-registration.ts`. Los tipos van en `types/tithers.ts`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test lib/utils/__tests__/tithers.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add types/tithers.ts lib/utils/tithers.ts lib/utils/__tests__/tithers.test.ts
git commit -m "feat(tithers): funciones puras para agrupar diezmadores"
```

---

### Task 2: Servicio `tithersService.list`

**Files:**
- Create: `services/tithers/tithers.service.ts`
- Test: `services/tithers/__tests__/tithers.service.test.ts` (con un mock encadenable como el de `services/movements/__tests__/movements.service.test.ts`)

**Interfaces:**
- Consumes: `groupTithers`, `titherTotals`, `TITHES_CATEGORY_NAME` (Task 1) y los tipos de `types/tithers.ts`.
- Produces: `tithersService.list(db: SupabaseClient<Database>, input: { year: number }): Promise<{ categoryFound: boolean; tithers: Tither[]; totals: TithersTotals }>`.

- [ ] **Step 1: Escribir los tests**

- La categoría se busca en `movement_categories` con `eq("name", "Diezmos")` y `eq("movement_type", "INCOME")` (`maybeSingle`); si no existe devuelve `{ categoryFound: false, tithers: [], totals: { total: 0, count: 0, titherCount: 0 } }` sin consultar `movements`.
- Con la categoría encontrada, consulta `movements` seleccionando `delivered_by, amount, movement_date`, con `eq("category_id", <id>)`, `eq("status", "ACTIVE")`, `gte("movement_date", "2026-01-01")` y `lte("movement_date", "2026-12-31")` para el año 2026, ordenando por `movement_date`, `created_at` e `id` (los tres descendentes).
- Paginación: el mock devuelve 1000 filas en el primer `range(0, 999)`, 1000 en `range(1000, 1999)` y 250 en `range(2000, 2999)`; el resultado agrupa las 2250 filas (por ejemplo, un total esperado exacto), y con exactamente 1000 filas pide una segunda página vacía y termina.
- Convierte `amount` con `Number` (el mock devuelve `"20000.50"` como texto).
- Agrupa con `groupTithers` y calcula los totales con `titherTotals`.
- Un error de la consulta de categoría o de cualquier página se lanza, no se traga.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test services/tithers`
Expected: FAIL, el servicio no existe.

- [ ] **Step 3: Implementar**

Paginar con `range(from, from + 999)` en un bucle que se detiene cuando una página trae menos de 1000 filas.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test services/tithers && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add services/tithers
git commit -m "feat(tithers): servicio que agrupa los diezmos del año"
```

---

### Task 3: Componentes de interfaz

**Files:**
- Create: `components/tithers/tithers-summary.tsx`, `components/tithers/tithers-table.tsx`, `components/tithers/tither-detail-dialog.tsx`, `components/tithers/tither-sparkline.tsx`, `components/tithers/tither-monthly-chart.tsx`, `components/tithers/tither-monthly-chart-lazy.tsx`, `components/tithers/tithers-year-select.tsx`
- Test: `components/tithers/__tests__/tithers-table.test.tsx`, `components/tithers/__tests__/tither-detail-dialog.test.tsx`, `components/tithers/__tests__/tithers-summary.test.tsx`

**Interfaces:**
- Consumes: `Tither`, `TithersTotals` (Task 1); `sparklinePoints`, `titherMovementsHref`, `titherYearOptions`, `UNNAMED_TITHER_LABEL` (Task 1); `normalizeName`; `formatCLP`, `formatDate`.
- Produces: `TithersSummary(props: { totals: TithersTotals; year: number }): JSX.Element`; `TithersTable(props: { tithers: Tither[]; year: number }): JSX.Element` (cliente; maneja el filtro y el diálogo abierto); `TitherDetailDialog(props: { tither: Tither | null; year: number; onClose: () => void }): JSX.Element`; `TitherSparkline(props: { values: number[]; unnamed?: boolean }): JSX.Element`; `TitherMonthlyChart(props: { monthlyTotals: number[] }): JSX.Element` y `TitherMonthlyChartLazy` (misma firma, `next/dynamic` con `ssr: false` y un marcador de altura fija); `TithersYearSelect(props: { year: number; options: number[] }): JSX.Element` (cliente; `router.push("/tithers?year=<n>")` al cambiar).

Descripción visual (el canvas es privado): `TithersSummary` es una franja única con borde y esquinas redondeadas con tres bloques: "TOTAL DE DIEZMOS" (bloque violeta sólido con texto blanco, monto grande, línea "En {año}"), "DIEZMADORES" (cantidad y "Sin contar “Sin nombre”") y "DIEZMOS REGISTRADOS" (cantidad y "En el año"), con las etiquetas en mayúsculas pequeñas como la franja del dashboard. `TithersTable` es una tarjeta blanca con borde: encabezados NOMBRE, DIEZMOS, TOTAL, TENDENCIA, ÚLTIMO DIEZMO; el nombre es un botón violeta subrayado (cursiva gris y sin subrayado para "Sin nombre", fila con fondo apenas tintado); la tendencia es el `TitherSparkline`; sobre la tabla, un campo "Filtrar por nombre…" con lupa. En móvil cada fila es una tarjeta (nombre y total arriba; cantidad, último diezmo y mini línea abajo). `TitherDetailDialog` usa el `Dialog` existente: título "{nombre} · {año}" y subtítulo "Diezmos mes a mes", una franja de tres métricas (Total en violeta sólido, Diezmos, Último diezmo), el gráfico de barras (ejes con la primera letra de cada mes en minúscula, tooltip con `formatCLP`), una tabla de 12 filas en dos columnas (mes, cantidad, monto; meses sin diezmos atenuados) y el enlace "Ver movimientos de {nombre}".

- [ ] **Step 1: Escribir los tests**

Mockear `recharts`/el gráfico perezoso (por ejemplo `jest.mock("../tither-monthly-chart-lazy", ...)` devolviendo un `<div data-testid="monthly-chart" />`) y `next/navigation`.
- `TithersTable` con los datos de ejemplo (Hna. Mabel 10 diezmos $200.000 último 2026-11-12; Juan Pérez 9 $180.000; Sin nombre 6 $42.000): muestra los nombres, "$200.000", "10" y la fecha "12-11-2026"; el campo de filtro con "juan perez" deja solo "Juan Pérez" (ignora tildes y mayúsculas) y un texto sin coincidencias muestra "Sin coincidencias."; con `tithers=[]` muestra "No hay diezmos registrados en 2026."; "Sin nombre" se renderiza en cursiva (clase) y la mini línea de cada fila tiene `aria-hidden`.
- Al hacer clic en "Hna. Mabel" se abre el diálogo (`getByRole("dialog", { name: /Hna\. Mabel/ })`) con el resumen ("$200.000", "10", "12-11-2026"), el gráfico simulado, una tabla con 12 filas de mes y el enlace "Ver movimientos de Hna. Mabel" con `href` `"/movements?search=Hna.%20Mabel&movement_type=INCOME"`; Escape cierra el diálogo; para "Sin nombre" el diálogo abre pero no hay enlace.
- `TitherDetailDialog` con `tither=null` no renderiza el diálogo; los meses sin diezmos aparecen como "0" y "$0".
- `TithersSummary` muestra "$636.000", "4" y "40" con los totales `{ total: 636000, count: 40, titherCount: 4 }` y el texto "En 2026".

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/tithers`
Expected: FAIL, los componentes no existen.

- [ ] **Step 3: Implementar**

Seguir el patrón de `components/dashboard/dashboard-charts.tsx` para Recharts (`ChartContainer`, `BarChart`, `ChartTooltip`) y de `components/dashboard/dashboard-charts-lazy.tsx` para la carga perezosa. El diálogo recibe el `Tither` seleccionado desde `TithersTable`. Etiquetas de mes: `["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]` en el gráfico y los nombres completos en la tabla. Tokens de color existentes (`text-on-income` etc. si hacen falta); no usar `truncate` en montos.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test components/tithers && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias ni `act()` en la salida.

- [ ] **Step 5: Commit**

```bash
git add components/tithers
git commit -m "feat(tithers): tabla, resumen y diálogo con gráfico mensual"
```

---

### Task 4: Página, navegación y verificación

**Files:**
- Create: `app/(dashboard)/tithers/page.tsx`, `app/(dashboard)/tithers/loading.tsx`
- Modify: `components/dashboard/app-sidebar.tsx` (enlace "Diezmadores" en "Finanzas", después de "Movimientos", con `href: "/tithers"`, el ícono `HandCoins` de `lucide-react` y `roles: ["ADMIN", "BURSAR", "FINANCE"]`), `components/dashboard/site-header.tsx` (`"/tithers": "Diezmadores"` en `PAGE_LABELS`)
- Test: `components/dashboard/__tests__/app-sidebar.test.tsx` (casos nuevos en `getVisibleGroups`)

**Interfaces:**
- Consumes: `tithersService.list` (Task 2), `TithersSummary`, `TithersTable`, `TithersYearSelect` (Task 3), `currentYearInSantiago`, `parseTithersYear`, `titherYearOptions` (Task 1), `getCurrentUser` y `createSupabaseServerClient` de `lib/supabase/server`, `can`/`PERMISSIONS`.

- [ ] **Step 1: Escribir los tests del menú**

En `app-sidebar.test.tsx` (`getVisibleGroups`): ADMIN, BURSAR y FINANCE ven el enlace `/tithers` dentro de "Finanzas" justo después de `/movements`; MINISTER y DELEGATE no lo ven.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/dashboard/__tests__/app-sidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar la página y el menú**

`page.tsx` (server component, sigue el patrón de `app/(dashboard)/movements/page.tsx`): `searchParams: Promise<{ year?: string }>`; sin usuario o sin `VIEW_MOVEMENT` redirige a `/dashboard`; año con `parseTithersYear(params.year, currentYearInSantiago())`; llama al servicio con el cliente de servidor; encabezado "Diezmadores" con el subtítulo "Quiénes dan diezmo y cuánto, por año", `TithersYearSelect` a la derecha; si `categoryFound` es `false` muestra un aviso ("No se encontró la categoría Diezmos.") en vez del resumen y la tabla; si no, `TithersSummary` y `TithersTable`. `loading.tsx` con un esqueleto simple como el de otras páginas.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test components/dashboard && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Verificación completa**

Run: `pnpm run ci && pnpm test && pnpm build`
Expected: lint y typecheck sin errores ni advertencias, todos los tests pasan y la compilación termina sin errores.

- [ ] **Step 6: Probar en el navegador**

Con la base local y el servidor de desarrollo ya levantados, usando `playwright-cli` (regla del repo) y SIN ejecutar nunca `pnpm supabase db reset`: como ADMIN, abrir `/tithers` y comprobar el resumen, la tabla, la mini línea, el filtro por nombre, el selector de año y el diálogo al hacer clic en un nombre (gráfico visible, tabla de 12 meses, enlace a `/movements`, cierre con Escape); a 390 px, la lista en tarjetas y el diálogo sin desbordes; que el enlace "Diezmadores" aparece en la barra lateral; y que entrar como un usuario sin `VIEW_MOVEMENT` (MINISTER) redirige. Si los datos locales no alcanzan para ver el gráfico, crear como máximo TRES ingresos de la categoría Diezmos desde la interfaz de la app (nunca con SQL directo), con un nombre de prueba claramente marcado ("Zzqx Diezmador"), y al terminar anularlos desde la app con el motivo "prueba". Anotar qué se probó y qué no. No hacer push ni PR.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/tithers" components/dashboard/app-sidebar.tsx components/dashboard/site-header.tsx components/dashboard/__tests__/app-sidebar.test.tsx
git commit -m "feat(tithers): página de diezmadores y enlace en el menú"
```
