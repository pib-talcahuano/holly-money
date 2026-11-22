# Sugerencias de nombre en "Entregado por/a" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que el campo `delivered_by` del formulario de movimientos sugiera nombres ya escritos (mismo tipo de movimiento, solo activos), con una sola grafía por persona, sin impedir nombres nuevos.

**Architecture:** Un helper puro agrupa y normaliza nombres. `movementsService.suggestDeliveredBy` trae hasta 200 movimientos recientes que coinciden con el texto y delega el agrupado al helper. Una server action `suggestDeliveredBy` valida sesión y `CREATE_MOVEMENT`. Un componente cliente `DeliveredByAutocomplete` (Base UI `Autocomplete`) reemplaza el `Input` en `MovementStep2Fields`.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS), Zod, `@base-ui/react` Autocomplete (`components/ui/autocomplete.tsx`), react-hook-form, jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-21-delivered-by-suggestions-design.md`

## Global Constraints

- Siempre `pnpm`, nunca `npm` ni `yarn`.
- Estilo: sin punto y coma, comillas dobles, `printWidth` 100, sin comas finales.
- Identificadores, archivos y rutas en inglés; el español solo en textos de UI y mensajes de Zod.
- Lógica de negocio en `services/`; las acciones no llaman al cliente de Supabase directamente.
- Permisos con `can(user.permissions, PERMISSIONS.CREATE_MOVEMENT)`, nunca comparando nombres de rol.
- Todo texto del usuario pasa por `sanitizePostgrestSearch` antes de entrar a un filtro de PostgREST.
- Sin migración y sin nuevos usos de `createSupabaseAdminClient`.
- Mínimo 2 caracteres, hasta 8 sugerencias, espera de 250 ms, ventana de 200 movimientos recientes.
- Solo movimientos con `status = ACTIVE` y `delivered_by` no nulo, del mismo `movement_type` que el formulario.
- `delivered_by` sigue siendo texto libre: no se exige, no se bloquea un nombre nuevo, no se tocan movimientos existentes.
- Los componentes de `components/ui/` son shadcn sobre `@base-ui/react`; no cambiar a Radix.
- `pnpm run ci` y `pnpm test` deben pasar con cero advertencias de lint.

## Review Focus

- Variantes con tildes, mayúsculas y espacios ("Hna. Mabel", "hna.  mabel", "Mábel"): un solo grupo con la grafía más usada (Task 1).
- Escribir "mabel" debe encontrar "Mábel" aunque la base no tenga `unaccent` (Task 2).
- Texto con `,` `(` `)` `\`: no rompe la consulta (Task 2).
- Ingresos y egresos no se mezclan; anulados y nulos no aparecen (Task 2).
- Respuesta vieja que llega tarde no pisa las sugerencias actuales (Task 4).
- Si la acción falla, el campo sigue siendo un campo de texto utilizable, sin error visible (Task 4).
- En edición, el valor guardado se muestra y no se borra al montar el componente (Task 4).
- Escribir un nombre nuevo y salir del campo conserva exactamente lo escrito (Task 4).

---

### Task 0: Rama y documentos

**Files:**
- Create: `docs/superpowers/specs/2026-11-21-delivered-by-suggestions-design.md` (ya existe sin commitear)
- Create: `docs/superpowers/plans/2026-11-21-delivered-by-suggestions.md` (este archivo)

- [ ] **Step 1: Crear la rama desde el `main` local**

Run: `git switch -c feat/delivered-by-suggestions main`
Si git se niega por el `CLAUDE.md` modificado, ejecutar `git stash push CLAUDE.md` y repetir. La rama sale del `main` local (no de `origin/main`) porque `main` ya incluye el buscador global, que modificó los mismos archivos.
Expected: `git branch --show-current` imprime `feat/delivered-by-suggestions`.

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-21-delivered-by-suggestions-design.md docs/superpowers/plans/2026-11-21-delivered-by-suggestions.md
git commit -m "docs: spec y plan de sugerencias de nombre en entregado por/a"
```
Terminar el mensaje con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session:` de la atribución de la sesión.

---

### Task 1: Helper puro de nombres

**Files:**
- Create: `lib/utils/name-suggestions.ts`
- Test: `lib/utils/__tests__/name-suggestions.test.ts`

**Interfaces:**
- Produces: `type NameSuggestion = { name: string; count: number }`.
- Produces: `normalizeName(value: string): string` — minúsculas, sin tildes ni marcas diacríticas (NFD sin `̀-ͯ`), espacios internos colapsados a uno y recortados.
- Produces: `groupNameSuggestions(names: string[], limit: number): NameSuggestion[]` — `names` llega ordenado del más reciente al más antiguo.
- Produces: `accentInsensitivePattern(term: string): string` — normaliza `term` y reemplaza cada `a`, `e`, `i`, `o`, `u`, `n` por `_` (comodín de un carácter de `ilike`), sin añadir `%`.

- [ ] **Step 1: Escribir los tests**

En `lib/utils/__tests__/name-suggestions.test.ts`:
- `normalizeName("  Hna.   MÁBEL ")` → `"hna. mabel"`; `normalizeName("Peña")` → `"pena"`; `normalizeName("   ")` → `""`.
- `groupNameSuggestions(["Hna. Mabel", "hna.  mabel", "Hna. Mabel", "Juan Pérez"], 8)` → `[{ name: "Hna. Mabel", count: 3 }, { name: "Juan Pérez", count: 1 }]` (la grafía más usada del grupo).
- Empate de grafías dentro de un grupo (`["Mabel", "mabel"]`) → `{ name: "Mabel", count: 2 }` (gana la primera, la más reciente).
- Orden: grupos con el mismo conteo conservan el orden de primera aparición (`["Ana", "Beto"]` → Ana, Beto).
- Orden por frecuencia: `["Ana", "Beto", "Beto"]` → Beto (2) antes que Ana (1).
- `limit`: con 3 grupos y `limit = 2` devuelve 2.
- Descarta vacíos y espacios (`["", "  ", "Ana"]` → solo Ana).
- `accentInsensitivePattern("mabel")` → `"m_b_l"`; `accentInsensitivePattern("Mábel")` → `"m_b_l"`; `accentInsensitivePattern("Peña")` → `"p___"`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test lib/utils/__tests__/name-suggestions.test.ts`
Expected: FAIL, el módulo no existe.

- [ ] **Step 3: Implementar el módulo**

Agrupar con un `Map` por nombre normalizado que guarda el conteo por grafía exacta y el orden de aparición; la grafía mostrada es la de mayor conteo y, en empate, la primera vista. Ordenar grupos por conteo descendente con desempate por orden de aparición.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test lib/utils/__tests__/name-suggestions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/name-suggestions.ts lib/utils/__tests__/name-suggestions.test.ts
git commit -m "feat(movements): helper para agrupar sugerencias de nombre"
```

---

### Task 2: Servicio `suggestDeliveredBy`

**Files:**
- Modify: `services/movements/movements.service.ts` (nuevo método en `movementsService`, junto a `list`)
- Test: `services/movements/__tests__/movements.service.test.ts` (nuevo `describe("suggestDeliveredBy")`; reutilizar el mock encadenable que ya existe en el archivo)

**Interfaces:**
- Consumes: `groupNameSuggestions`, `normalizeName`, `accentInsensitivePattern`, `NameSuggestion` de la Task 1.
- Produces: `movementsService.suggestDeliveredBy(db: DB, input: { query: string; movementType: "INCOME" | "EXPENSE" }): Promise<NameSuggestion[]>`.

- [ ] **Step 1: Escribir los tests**

Con el mock encadenable existente, que registra las llamadas y devuelve filas `{ delivered_by }`:
- La consulta va a `movements`, selecciona `delivered_by` y aplica `eq("status", "ACTIVE")`, `eq("movement_type", "INCOME")` (o `EXPENSE` si se pide), `not("delivered_by", "is", null)`, `limit(200)` y `ilike("delivered_by", "%m_b_l%")` para la consulta `"mabel"`; el orden es por `movement_date` y luego `created_at`, descendente.
- Con las filas `Mabel`, `Mábel`, `MABEL`, `Juan` y la consulta `"mabel"`, devuelve un solo grupo de Mabel con `count: 3` (el filtro de coincidencia se aplica también en JavaScript con `normalizeName(row).includes(normalizeName(query))`, así `Juan` no entra aunque la base lo devuelva).
- Una consulta con `"a,(b)"` llega al `ilike` sin `,` `(` `)` (pasa por `sanitizePostgrestSearch`).
- Si la consulta queda vacía tras sanitizar, devuelve `[]` sin consultar la base.
- Un error de la base se lanza, no se traga.
- Devuelve como máximo 8 sugerencias.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test services/movements/__tests__/movements.service.test.ts -t suggestDeliveredBy`
Expected: FAIL, el método no existe.

- [ ] **Step 3: Implementar el método**

Decisión del plan sobre el spec: la base no tiene `unaccent`, por eso el `ilike` usa `accentInsensitivePattern(sanitizada)` envuelto en `%…%` (así "mabel" trae "Mábel") y el filtro exacto sobre el nombre normalizado se hace en JavaScript. Pasar los nombres a `groupNameSuggestions(names, 8)`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test services/movements && pnpm typecheck`
Expected: PASS y sin errores de tipos.

- [ ] **Step 5: Commit**

```bash
git add services/movements/movements.service.ts services/movements/__tests__/movements.service.test.ts
git commit -m "feat(movements): servicio de sugerencias para entregado por/a"
```

---

### Task 3: Esquema y server action

**Files:**
- Modify: `lib/validators/movement.ts` (esquema y tipo, junto a `movementSearchSchema`)
- Modify: `app/actions/movements.ts` (acción nueva)
- Test: `app/actions/__tests__/movements.test.ts` (nuevo `describe("suggestDeliveredBy")`; agregar `suggestDeliveredBy` al mock de `movementsService`)

**Interfaces:**
- Consumes: `movementsService.suggestDeliveredBy` y `NameSuggestion` de las Tasks 1 y 2.
- Produces: `deliveredBySuggestionSchema = z.object({ query: z.string().trim().min(2).max(100), movement_type: z.enum(["INCOME", "EXPENSE"]) })` y `DeliveredBySuggestionInput` en `lib/validators/movement.ts`.
- Produces: `suggestDeliveredBy(query: string, movementType: "INCOME" | "EXPENSE"): Promise<NameSuggestion[]>` en `app/actions/movements.ts`.

- [ ] **Step 1: Escribir los tests de la acción**

- Sin sesión (`mockGetCurrentUser` resuelve `null`) → rechaza con `"Sin permisos para crear movimientos"`.
- Con sesión y `mockCan` en `false` → mismo rechazo, el servicio no se llama y `can` se invoca con `CREATE_MOVEMENT`.
- `suggestDeliveredBy("a", "INCOME")` → resuelve `[]` y el servicio no se llama.
- `suggestDeliveredBy("  mabel ", "INCOME")` → llama al servicio con `{ query: "mabel", movementType: "INCOME" }` y devuelve lo que este devuelve.
- Un tipo inválido (`"OTHER" as never`) → resuelve `[]` sin llamar al servicio.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test app/actions/__tests__/movements.test.ts -t suggestDeliveredBy`
Expected: FAIL, la acción no existe.

- [ ] **Step 3: Implementar esquema y acción**

La acción comprueba sesión y permiso antes de validar; si `safeParse` falla devuelve `[]`; usa `createSupabaseServerClient()` y el servicio. En un archivo `"use server"` solo se exportan funciones asíncronas y tipos.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test app/actions && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add lib/validators/movement.ts app/actions/movements.ts app/actions/__tests__/movements.test.ts
git commit -m "feat(movements): server action de sugerencias de nombre"
```

---

### Task 4: Componente, integración en el formulario y verificación

**Files:**
- Create: `components/movements/delivered-by-autocomplete.tsx`
- Modify: `components/movements/movement-form-fields.tsx` (campo `delivered_by` de `MovementStep2Fields`)
- Test: `components/movements/__tests__/delivered-by-autocomplete.test.tsx`

**Interfaces:**
- Consumes: `suggestDeliveredBy` de la Task 3 (`@/app/actions/movements`), `NameSuggestion` de la Task 1, y `components/ui/autocomplete.tsx`.
- Produces: `export function DeliveredByAutocomplete(props: { value: string; onChange: (value: string) => void; onBlur?: () => void; movementType: "INCOME" | "EXPENSE"; id?: string; className?: string }): JSX.Element`.

- [ ] **Step 1: Escribir los tests del componente**

Mockeando `@/app/actions/movements` y con `jest.useFakeTimers()`. Si `cmdk` no interviene aquí, no hacen falta stubs; si Base UI necesita `ResizeObserver` o `scrollIntoView` en jsdom, definirlos como `jest.fn()` en el `beforeAll` del archivo.
- Con `value="Ana"` el campo muestra "Ana" al montar (edición) y no llama a la acción.
- Escribir `"m"` y avanzar 300 ms → la acción no se llama.
- Escribir `"mabel"`: a los 249 ms no se llama; a los 250 ms se llama una vez con `("mabel", "INCOME")` (y con `"EXPENSE"` si se pasa ese tipo).
- Con la respuesta `[{ name: "Hna. Mabel", count: 12 }, { name: "Mabel Pérez", count: 1 }]` se ven las dos opciones, con "12 veces" y "1 vez".
- Elegir una opción llama `onChange("Hna. Mabel")`.
- Escribir un nombre que no está en las sugerencias llama `onChange` con lo escrito y no lo reemplaza al salir del campo (`onBlur` se invoca, `onChange` no recibe otro valor).
- Respuesta vieja: la búsqueda "ma" resuelve después de la de "mab"; al final solo se ven las sugerencias de "mab".
- Si la acción rechaza, no se muestra ningún mensaje de error y el campo sigue aceptando texto.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/movements/__tests__/delivered-by-autocomplete.test.tsx`
Expected: FAIL, el componente no existe.

- [ ] **Step 3: Implementar `DeliveredByAutocomplete`**

Basado en el patrón de `components/intentions/new-request-dialog.tsx` (`Autocomplete`, `AutocompleteInput`, `AutocompleteContent`, `AutocompleteList`, `AutocompleteItem`). El valor del `Autocomplete` es el texto escrito y `onValueChange` sirve tanto para escribir como para elegir. Las sugerencias vienen del servidor, así que hay que desactivar el filtrado interno de Base UI (consultar en `node_modules/@base-ui/react` la opción de la versión instalada: `filter={null}` o `mode`), y usar `itemToStringValue` para mostrar `name`. Espera de 250 ms y descarte de respuestas viejas con un contador de petición en un `useRef`; mínimo 2 caracteres; las sugerencias se limpian al bajar de 2 caracteres. El mensaje del pie y el texto de cantidad: "N veces" (y "1 vez"). `showTrigger` en falso: el desplegable solo aparece al escribir. Un fallo de la acción deja la lista vacía sin mostrar nada.

- [ ] **Step 4: Integrar en el formulario**

En `MovementStep2Fields`, reemplazar `<Input … {...form.register("delivered_by")} />` por un `Controller` de react-hook-form que renderiza `DeliveredByAutocomplete`, con `movementType` tomado de `useWatch({ control: form.control, name: "movement_type" })`. Conservar la etiqueta `deliveredByLabel`, el `placeholder="Opcional"` y las alturas `h-12 sm:h-14`. El valor que entra al formulario sigue siendo `string`, igual que antes.

- [ ] **Step 5: Ejecutar y ver que pasa**

Run: `pnpm test components/movements && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 6: Verificación completa**

Run: `pnpm run ci && pnpm test`
Expected: lint y typecheck sin errores ni advertencias; todos los tests pasan.

- [ ] **Step 7: Probar en el navegador**

Con la base local y el servidor de desarrollo ya levantados, usando `playwright-cli` (regla del repo) y SIN ejecutar nunca `pnpm supabase db reset`: entrar como ADMIN, crear un ingreso con un `delivered_by` nuevo, abrir `/movements/new` otra vez y comprobar que al escribir las primeras letras aparece esa grafía con su cantidad; comprobar que elegirla rellena el campo, que un nombre nuevo se guarda tal cual, que en un egreso no aparecen los nombres de los ingresos, y la vista de 390 px. Anotar qué se probó y qué no. No hacer push ni PR.

- [ ] **Step 8: Commit**

```bash
git add components/movements/delivered-by-autocomplete.tsx components/movements/movement-form-fields.tsx components/movements/__tests__/delivered-by-autocomplete.test.tsx
git commit -m "feat(movements): autocompletado de nombres en entregado por/a"
```
