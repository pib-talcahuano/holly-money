# Buscador global de movimientos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un buscador de movimientos con `⌘/Ctrl+K` en el header de todas las páginas, con resultados en el `CommandDialog` de shadcn, y una búsqueda ampliada que también usa `/movements`.

**Architecture:** Un helper puro arma el filtro `.or()` de PostgREST; `movementsService.list` lo usa tras resolver los ids de categorías/subcategorías por nombre. Una server action `searchMovements` valida sesión y permiso y devuelve filas planas. Un componente cliente `GlobalSearch` (cmdk con `shouldFilter={false}`, espera de 250 ms) se monta en `SiteHeader`.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), Zod, `cmdk` vía `pnpm shadcn add command` (variante `base-vega`), jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-21-global-movement-search-design.md`

## Global Constraints

- Siempre `pnpm`, nunca `npm` ni `yarn`.
- Estilo: sin punto y coma, comillas dobles, `printWidth` 100, sin comas finales.
- Identificadores, archivos y rutas en inglés; el español solo en textos de UI y mensajes de Zod.
- Lógica de negocio en `services/`; las acciones no llaman al cliente de Supabase directamente.
- Permisos con `can(user.permissions, PERMISSIONS.VIEW_MOVEMENT)`, nunca comparando nombres de rol.
- Todo texto del usuario pasa por `sanitizePostgrestSearch` antes de entrar a un `.or()`.
- Sin migración y sin nuevos usos de `createSupabaseAdminClient` (la lista blanca de CI no cambia).
- Mínimo 2 caracteres, 20 resultados, espera de 250 ms (spec, "Decisiones mías").
- `pnpm run ci` y `pnpm test` deben pasar con cero advertencias de lint.
- `types/database.types.ts` no se edita a mano.

## Review Focus

- Texto con `,` `(` `)` o `\`: no debe romper el filtro ni inyectar condiciones (sanitizado; test en Task 1).
- Texto numérico con puntos de miles (`20.000`): debe encontrar el monto 20000 y no fallar (Task 1).
- Una categoría cuyo nombre coincide pero ningún movimiento: lista vacía, no error (Task 1).
- Respuesta tardía de una búsqueda anterior: no debe pisar los resultados de la actual (Task 3).
- Movimiento anulado: aparece atenuado con "Anulado", no se oculta (Task 3).
- Usuario sin `VIEW_MOVEMENT`: no ve el botón y la acción lo rechaza (Tasks 2 y 3).

---

### Task 0: Rama y documentos

**Files:**
- Create: `docs/superpowers/specs/2026-11-21-global-movement-search-design.md` (ya existe sin commitear)
- Create: `docs/superpowers/plans/2026-11-21-global-movement-search.md` (este archivo)

- [ ] **Step 1: Crear la rama desde main**

Run: `git fetch origin main && git switch -c feat/global-movement-search origin/main`
Si git se niega por el `CLAUDE.md` modificado, ejecutar `git stash push CLAUDE.md` y repetir el comando. Los dos documentos están sin seguimiento y viajan con el cambio de rama.
Expected: `git branch --show-current` imprime `feat/global-movement-search`.

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-21-global-movement-search-design.md docs/superpowers/plans/2026-11-21-global-movement-search.md
git commit -m "docs: spec y plan del buscador global de movimientos"
```
Terminar el mensaje con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session:` de la atribución de la sesión.

---

### Task 1: Búsqueda ampliada en el servicio

**Files:**
- Modify: `services/movements/movements.service.ts:60-103` (tipo `ListFilters` y bloque `filters.search` de `list`)
- Create: `lib/utils/movement-search.ts`
- Test: `lib/utils/__tests__/movement-search.test.ts`

**Interfaces:**
- Produces: `buildMovementSearchFilter(term: string, ids: { categoryIds: string[]; subcategoryIds: string[] }): string | null` en `lib/utils/movement-search.ts`. Recibe el texto ya sanitizado y devuelve la cadena para `query.or(...)`, o `null` si el texto queda vacío.
- Produces: `movementsService.list` mantiene su firma; solo cambia qué campos mira `filters.search`.

- [ ] **Step 1: Escribir los tests del helper**

En `lib/utils/__tests__/movement-search.test.ts`, con `ids = { categoryIds: [], subcategoryIds: [] }` salvo que se indique:
- `"mabel"` → contiene `delivered_by.ilike.%mabel%` y `notes.ilike.%mabel%` y no contiene `amount`.
- `"20.000"` → contiene `amount.eq.20000`.
- `"15000"` → contiene `amount.eq.15000`.
- `"mabel 2"` (letras y dígitos) → no contiene `amount`.
- con `categoryIds: ["c1", "c2"]` → contiene `category_id.in.(c1,c2)`; con `subcategoryIds: ["s1"]` → contiene `subcategory_id.in.(s1)`; con ambos vacíos → no contiene `category_id` ni `subcategory_id`.
- `""` → devuelve `null`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test lib/utils/__tests__/movement-search.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar `buildMovementSearchFilter`**

Unir con `,` las condiciones `delivered_by.ilike.%t%`, `notes.ilike.%t%`, las de ids si hay y, solo cuando `/^\d[\d.]*$/` coincide con `term`, `amount.eq.<term sin puntos>`. Los ids son UUID, así que no necesitan escapado.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test lib/utils/__tests__/movement-search.test.ts`
Expected: PASS.

- [ ] **Step 5: Usar el helper en `list`**

Reemplazar el bloque `filters.search` de `list`: tras `sanitizePostgrestSearch`, consultar `movement_categories` y `movement_subcategories` con `.select("id").ilike("name", `%${s}%`)` (dos consultas en paralelo con `Promise.all`), pasar los ids a `buildMovementSearchFilter` y aplicar el resultado con `query.or(...)`. Si una de las consultas de ids devuelve error, lanzarlo como el resto de `list`. Quitar el comentario que dice que la búsqueda por categoría se descartó.

- [ ] **Step 6: Verificar tipos y pruebas**

Run: `pnpm typecheck && pnpm test lib/utils services`
Expected: sin errores; los tests de `services/` siguen pasando.

- [ ] **Step 7: Commit**

```bash
git add lib/utils/movement-search.ts lib/utils/__tests__/movement-search.test.ts services/movements/movements.service.ts
git commit -m "feat(movements): buscar también en notas, categoría, subcategoría y monto"
```

---

### Task 2: Server action `searchMovements`

**Files:**
- Modify: `lib/validators/movement.ts` (agregar esquema y tipo tras `movementFiltersSchema`)
- Modify: `app/actions/movements.ts` (agregar `searchMovements` y el tipo exportado)
- Test: `app/actions/__tests__/movements.test.ts` (nuevo `describe("searchMovements")`; agregar `VIEW_MOVEMENT` al mock de `PERMISSIONS` y `list` al mock de `movementsService`)

**Interfaces:**
- Consumes: `movementsService.list(db, { search, status: "ALL", pageSize: 20 })` de la Task 1; sus filas traen `movement_categories: { name: string } | null`.
- Produces: `movementSearchSchema = z.object({ query: z.string().trim().min(2).max(100) })` y `MovementSearchInput` en `lib/validators/movement.ts`.
- Produces: `type MovementSearchResult = { id: string; movement_date: string; movement_type: "INCOME" | "EXPENSE"; amount: number; status: "ACTIVE" | "CANCELLED"; category_name: string | null; delivered_by: string | null }` y `searchMovements(query: string): Promise<MovementSearchResult[]>`, exportados desde `app/actions/movements.ts`.

- [ ] **Step 1: Escribir los tests de la acción**

En `app/actions/__tests__/movements.test.ts`:
- sin sesión (`mockGetCurrentUser` resuelve `null`) → rechaza con `"Sin permisos para ver movimientos"`.
- con sesión y `mockCan` devolviendo `false` → mismo rechazo y `list` no se llama.
- `searchMovements("a")` → resuelve `[]` y `list` no se llama.
- `searchMovements("  mabel ")` → llama `list` con `{ search: "mabel", status: "ALL", pageSize: 20 }`.
- el resultado aplana `movement_categories.name` en `category_name` y no incluye `users` ni `created_by_id`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test app/actions/__tests__/movements.test.ts -t searchMovements`
Expected: FAIL, `searchMovements` no existe.

- [ ] **Step 3: Implementar esquema y acción**

`searchMovements(query)`: obtener usuario, exigir `VIEW_MOVEMENT`, parsear con `movementSearchSchema.safeParse`; si falla devolver `[]`; llamar al servicio con el cliente de servidor y mapear a `MovementSearchResult`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test app/actions/__tests__/movements.test.ts`
Expected: PASS, incluidos los tests anteriores del archivo.

- [ ] **Step 5: Commit**

```bash
git add lib/validators/movement.ts app/actions/movements.ts app/actions/__tests__/movements.test.ts
git commit -m "feat(movements): server action searchMovements"
```

---

### Task 3: Componente `GlobalSearch` en el header

**Files:**
- Create: `components/ui/command.tsx` (lo genera `pnpm shadcn add command`; `package.json` y `pnpm-lock.yaml` ganan `cmdk`)
- Create: `components/dashboard/global-search.tsx`
- Modify: `components/dashboard/site-header.tsx` (montar `<GlobalSearch />` antes de `ThemeToggle`)
- Test: `components/dashboard/__tests__/global-search.test.tsx`

**Interfaces:**
- Consumes: `searchMovements` y `MovementSearchResult` de la Task 2; `useUser().can(PERMISSIONS.VIEW_MOVEMENT)` de `components/providers/user-provider.tsx`; `formatCLP` y `formatDate` de `lib/utils.ts`.
- Produces: `export function GlobalSearch(): JSX.Element | null`. Devuelve `null` si el usuario no tiene `VIEW_MOVEMENT`.

- [ ] **Step 1: Instalar el componente de shadcn**

Run: `pnpm shadcn add command`
Si pregunta por sobrescribir `dialog` o `input-group`, responder que no. Revisar que el diff solo agregue `components/ui/command.tsx`, `cmdk` en `package.json` y el lockfile; si el CLI toca otros archivos de `ui/`, revertirlos con `git checkout -- <archivo>`.
Expected: `pnpm typecheck` pasa.

- [ ] **Step 2: Escribir los tests del componente**

En `components/dashboard/__tests__/global-search.test.tsx`, mockeando `@/app/actions/movements` y `@/components/providers/user-provider`, y con `jest.useFakeTimers()`. `cmdk` necesita `ResizeObserver` y `Element.prototype.scrollIntoView` en jsdom: definirlos como `jest.fn()` en el `beforeAll` del archivo.
- sin `VIEW_MOVEMENT` → `container` queda vacío.
- con permiso, `fireEvent.keyDown(document, { key: "k", ctrlKey: true })` abre el diálogo (aparece el campo con `aria-label` "Buscar movimientos").
- escribir `"m"` y avanzar 300 ms → `searchMovements` no se llama.
- escribir `"mabel"` y avanzar 249 ms → no se llama; a los 250 ms se llama una vez con `"mabel"`.
- con dos resultados (un INCOME "Diezmos" y un EXPENSE "Gastos básicos") se ven los encabezados "Ingresos" y "Egresos".
- un resultado `CANCELLED` muestra el texto "Anulado".
- resultado vacío muestra "Sin resultados".
- `searchMovements` rechazado muestra "No se pudo buscar".
- respuesta vieja: la búsqueda "ma" resuelve después que la de "mab"; al final se ven solo los resultados de "mab".
- elegir un resultado llama `router.push("/movements/<id>")` (mockear `next/navigation`) y cierra el diálogo.
- el pie "Ver todos los resultados" hace `router.push("/movements?search=mabel")` con el texto codificado.

- [ ] **Step 3: Ejecutar y ver que falla**

Run: `pnpm test components/dashboard/__tests__/global-search.test.tsx`
Expected: FAIL, el componente no existe.

- [ ] **Step 4: Implementar `GlobalSearch`**

Botón `outline` con ícono de lupa y la etiqueta "Buscar" (solo el ícono bajo `sm`), con `aria-label="Buscar movimientos"` y la pista `⌘K` en `sm` o más. `CommandDialog` con `shouldFilter={false}`, título "Buscar movimientos" y descripción "Busca por entregado por, notas, categoría o monto". El listener de teclado en `document` abre con `(metaKey || ctrlKey) && key === "k"` y hace `preventDefault`. La espera de 250 ms y el descarte de respuestas viejas se resuelven con un contador de petición en un `useRef`. Al cerrar, limpiar texto y resultados. Fila: ícono de flecha según tipo, `category_name · delivered_by`, `formatCLP(amount)` y `formatDate(movement_date)` con `CommandShortcut`; fila anulada con `opacity-60` y la etiqueta "Anulado". Pie en un `CommandGroup` con una sola fila "Ver todos los resultados" con `value` fijo para que no se filtre.

- [ ] **Step 5: Montar en el header**

En `site-header.tsx`, agregar `<GlobalSearch />` como primer hijo del contenedor `flex items-center gap-2.5` de la derecha.

- [ ] **Step 6: Ejecutar y ver que pasa**

Run: `pnpm test components/dashboard && pnpm typecheck && pnpm lint`
Expected: PASS y sin advertencias.

- [ ] **Step 7: Commit**

```bash
git add components/ui/command.tsx components/dashboard/global-search.tsx components/dashboard/site-header.tsx components/dashboard/__tests__/global-search.test.tsx package.json pnpm-lock.yaml
git commit -m "feat(dashboard): buscador global de movimientos con command de shadcn"
```

---

### Task 4: Ajuste de `/movements`, verificación y PR

**Files:**
- Modify: `components/movements/movements-filters.tsx` (placeholder del campo de búsqueda)

**Interfaces:**
- Consumes: la búsqueda ampliada de la Task 1, que `/movements` ya usa a través de `movementsService.list`.

- [ ] **Step 1: Actualizar el placeholder**

Cambiar `"Buscar por entregado por/a..."` por `"Buscar por entregado por/a, notas, categoría o monto..."`. Si algún test existente depende del texto, actualizarlo.

- [ ] **Step 2: Verificación completa**

Run: `pnpm run ci && pnpm test`
Expected: lint y typecheck sin errores ni advertencias; todos los tests pasan.

- [ ] **Step 3: Probar en el navegador**

Con `pnpm dev` y la base local sembrada, usar `playwright-cli` (regla del repo): entrar como ADMIN, abrir el buscador con `Ctrl+K` desde `/dashboard` y desde `/ministries`, buscar por el nombre de una categoría, por una persona y por un monto, elegir un resultado y confirmar que abre el detalle. Entrar como un usuario sin `VIEW_MOVEMENT`, si existe uno, y confirmar que no aparece el botón. Anotar qué se probó y qué no.

- [ ] **Step 4: Commit y PR**

```bash
git add components/movements/movements-filters.tsx
git commit -m "feat(movements): placeholder acorde a la búsqueda ampliada"
git push -u origin feat/global-movement-search
gh pr create --base main --head feat/global-movement-search --title "feat: buscador global de movimientos" --body "<resumen y qué se probó>"
```
El cuerpo del PR termina con la línea `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Nunca se empuja a `main`.
