# Destacar movimientos registrados tarde Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar con una insignia "Registrado tarde · N d" los movimientos registrados más de 30 días después de su fecha, en la lista de `/movements` (escritorio y móvil), el panel de detalle y `/movements/[id]`.

**Architecture:** Una función pura `getLateRegistrationDays` decide si un movimiento es tardío (día calendario de `created_at` en `America/Santiago` contra `movement_date`). Un componente `LateRegistrationBadge` sobre el `Badge` existente (variante `warn`) lo muestra. `MovementsTable`, la página de lista y la página de detalle lo usan. No hay migración ni cambios de consultas.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind, `components/ui/badge.tsx`, jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-21-late-registration-flag-design.md`

## Global Constraints

- Siempre `pnpm`, nunca `npm` ni `yarn`.
- Estilo: sin punto y coma, comillas dobles, `printWidth` 100, sin comas finales.
- Identificadores, archivos y rutas en inglés; el español solo en textos de UI.
- Umbral fijo: `LATE_REGISTRATION_DAYS = 30`; es tardío solo si los días son **estrictamente mayores** que 30.
- Zona horaria `America/Santiago` para decidir el día de registro.
- La insignia lleva texto, no depende solo del color, y cumple contraste de texto (usar la variante `warn` existente).
- Sin migración, sin columnas nuevas, sin cambios en consultas ni en `types/database.types.ts`.
- No cambia filtros, orden ni totales.
- `pnpm run ci` y `pnpm test` deben pasar con cero advertencias de lint.

## Review Focus

- Exactamente 30 días no se marca; 31 sí (Task 1).
- Un movimiento registrado a las 23:30 hora de Chile no cambia de día por usar UTC (Task 1).
- Fecha del movimiento futura o igual al día de registro, y entradas inválidas: `null`, sin lanzar (Task 1).
- Cambio de horario de verano de Chile no altera el conteo de días (Task 1).
- Filas sin `created_at` (el widget "Últimos movimientos" del dashboard no lo trae) no fallan y no muestran insignia (Task 3).
- Una fila registrada a tiempo no muestra insignia (Task 3).
- Una fila tardía no desborda la columna de fecha de 96 px en escritorio (Task 3, prueba manual).

---

### Task 0: Rama y documentos

**Files:**
- Create: `docs/superpowers/specs/2026-11-21-late-registration-flag-design.md` (ya existe sin commitear)
- Create: `docs/superpowers/plans/2026-11-21-late-registration-flag.md` (este archivo)

- [ ] **Step 1: Crear la rama desde el `main` local**

Run: `git switch -c feat/late-registration-flag main`
Si git se niega por el `CLAUDE.md` modificado, ejecutar `git stash push CLAUDE.md` y repetir. Ejecutar esto solo cuando no haya otra rama en ejecución en el mismo directorio.
Expected: `git branch --show-current` imprime `feat/late-registration-flag`.

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-21-late-registration-flag-design.md docs/superpowers/plans/2026-11-21-late-registration-flag.md
git commit -m "docs: spec y plan para destacar movimientos registrados tarde"
```
Terminar el mensaje con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session:` de la atribución de la sesión.

---

### Task 1: Función pura `getLateRegistrationDays`

**Files:**
- Create: `lib/utils/late-registration.ts`
- Test: `lib/utils/__tests__/late-registration.test.ts`

**Interfaces:**
- Produces: `export const LATE_REGISTRATION_DAYS = 30`.
- Produces: `export function getLateRegistrationDays(movementDate: string, createdAt: string): number | null`. `movementDate` es `YYYY-MM-DD`; `createdAt` es una marca de tiempo ISO. Devuelve los días enteros entre `movementDate` y el día calendario de `createdAt` en `America/Santiago` si son estrictamente más de 30; `null` en cualquier otro caso, incluidas entradas inválidas.

- [ ] **Step 1: Escribir los tests**

En `lib/utils/__tests__/late-registration.test.ts`, con `(movementDate, createdAt) → resultado`:
- `("2026-10-01", "2026-10-31T15:00:00Z")` → `null` (30 días exactos).
- `("2026-10-01", "2026-11-01T15:00:00Z")` → `31`.
- `("2026-10-01", "2026-11-15T15:00:00Z")` → `45`.
- Borde de zona horaria: `("2026-10-31", "2026-12-01T02:30:00Z")` → `null` (en Chile es el 30 de noviembre a las 23:30, 30 días; en UTC serían 31).
- Cambio de horario de verano: `("2026-08-20", "2026-09-21T12:00:00Z")` → `32`.
- Mismo día: `("2026-12-01", "2026-12-01T12:00:00Z")` → `null`.
- Fecha del movimiento futura: `("2026-12-10", "2026-12-01T12:00:00Z")` → `null`.
- Inválidas sin lanzar: `("bad", "2026-12-01T12:00:00Z")`, `("2026-10-01", "not-a-date")`, `("", "")` → `null`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test lib/utils/__tests__/late-registration.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar la función**

Obtener el día calendario de `createdAt` en `America/Santiago` con `Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit" })`; calcular la diferencia entre ambas fechas parseadas como medianoche UTC (`Date.UTC`) dividida entre 86 400 000, así el horario de verano no altera el conteo. Validar el formato de `movementDate` y que ambas fechas sean válidas antes de calcular.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test lib/utils/__tests__/late-registration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/late-registration.ts lib/utils/__tests__/late-registration.test.ts
git commit -m "feat(movements): función para detectar registro tardío"
```

---

### Task 2: Componente `LateRegistrationBadge`

**Files:**
- Create: `components/movements/late-registration-badge.tsx`
- Test: `components/movements/__tests__/late-registration-badge.test.tsx`

**Interfaces:**
- Consumes: `Badge` de `components/ui/badge.tsx` (variante `warn`).
- Produces: `export function LateRegistrationBadge(props: { days: number; className?: string }): JSX.Element`.

- [ ] **Step 1: Escribir los tests**

- `render(<LateRegistrationBadge days={45} />)` muestra el texto "Registrado tarde · 45 d".
- El elemento tiene `title="Registrado 45 días después de la fecha del movimiento"`.
- Un `className` extra se aplica al elemento.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/movements/__tests__/late-registration-badge.test.tsx`
Expected: FAIL, el componente no existe.

- [ ] **Step 3: Implementar el componente**

`<Badge variant="warn" title={...} className={cn("whitespace-nowrap", className)}>Registrado tarde · {days} d</Badge>`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test components/movements/__tests__/late-registration-badge.test.tsx && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add components/movements/late-registration-badge.tsx components/movements/__tests__/late-registration-badge.test.tsx
git commit -m "feat(movements): insignia de registro tardío"
```

---

### Task 3: Integración en tabla, detalle y verificación

**Files:**
- Modify: `components/movements/movements-table.tsx` (tipo `SerializedMovement`, celda de fecha de escritorio, lista móvil y panel de detalle)
- Modify: `app/(dashboard)/movements/page.tsx` (agregar `created_at: row.created_at` a la serialización de cada fila)
- Modify: `app/(dashboard)/movements/[id]/page.tsx` (insignia junto a "Fecha del movimiento")
- Test: `components/movements/__tests__/movements-table.test.tsx`

**Interfaces:**
- Consumes: `getLateRegistrationDays` (Task 1) y `LateRegistrationBadge` (Task 2); `formatDateTime` de `lib/utils.ts`.
- Produces: `SerializedMovement` gana `created_at?: string | null` (opcional: el dashboard no lo envía y esas filas no muestran insignia).

- [ ] **Step 1: Escribir los tests de la tabla**

En `components/movements/__tests__/movements-table.test.tsx`, renderizando `MovementsTable` con filas mínimas de `SerializedMovement` (mockear lo que el componente necesite de `next/link` o `next/navigation`):
- Una fila con `movement_date: "2026-09-01"` y `created_at: "2026-11-15T15:00:00Z"` muestra "Registrado tarde · 75 d" (en `variant="full"` y en `variant="compact"`).
- Una fila con `movement_date: "2026-11-10"` y `created_at: "2026-11-15T15:00:00Z"` no muestra "Registrado tarde".
- Una fila sin `created_at` (omitido) y otra con `created_at: null` no muestran la insignia y no lanzan.
- Al abrir el detalle de una fila tardía (clic en la fila) aparece el campo "Registro" con la fecha de registro y la insignia; en una fila a tiempo no aparece el campo.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/movements/__tests__/movements-table.test.tsx`
Expected: FAIL, la tabla aún no muestra la insignia.

- [ ] **Step 3: Implementar en la tabla**

- Calcular una vez por fila `const lateDays = row.created_at ? getLateRegistrationDays(row.movement_date, row.created_at) : null`.
- Tabla de escritorio (`full` y `compact`): en la celda de fecha, debajo de la fecha, la insignia solo si `lateDays !== null`; la celda pasa a columna (`flex flex-col gap-1`) y la columna de fecha no se ensancha.
- Lista móvil: la insignia al final de `ItemDescription`.
- Panel de detalle: un bloque "Registro" (con el mismo estilo de `Field`: etiqueta y valor) con `formatDateTime(created_at)` y la insignia, solo si es tardío. `Field` recibe texto; usar un bloque propio con el mismo estilo para poder incluir la insignia.

- [ ] **Step 4: Pasar `created_at` desde la página de lista**

En `app/(dashboard)/movements/page.tsx`, agregar `created_at: row.created_at` al objeto de cada fila (la consulta de `list` ya lo selecciona). No tocar la página del dashboard.

- [ ] **Step 5: Mostrar la insignia en `/movements/[id]`**

Junto a "Fecha del movimiento", debajo de la fecha, la insignia cuando `getLateRegistrationDays(row.movement_date, row.created_at)` no es `null`.

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `pnpm test components/movements && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 7: Verificación completa**

Run: `pnpm run ci && pnpm test`
Expected: lint y typecheck sin errores ni advertencias; todos los tests pasan.

- [ ] **Step 8: Probar en el navegador**

Con la base local y el servidor de desarrollo ya levantados, usando `playwright-cli` (regla del repo) y SIN ejecutar nunca `pnpm supabase db reset`: como ADMIN, buscar en la base local un movimiento con `created_at` más de 30 días posterior a su `movement_date` (si no existe, crear uno con una fecha de movimiento antigua, p. ej. 60 días atrás). Comprobar en `/movements`: la insignia en la tabla de escritorio sin desbordar la columna de fecha, en la lista a 390 px, en el panel de detalle (campo "Registro") y en `/movements/[id]`; y que un movimiento de hoy no muestra insignia y que el dashboard sigue mostrando "Últimos movimientos" sin errores. Anotar qué se probó y qué no. No hacer push ni PR.

- [ ] **Step 9: Commit**

```bash
git add components/movements/movements-table.tsx "app/(dashboard)/movements/page.tsx" "app/(dashboard)/movements/[id]/page.tsx" components/movements/__tests__/movements-table.test.tsx
git commit -m "feat(movements): destacar movimientos registrados tarde"
```
