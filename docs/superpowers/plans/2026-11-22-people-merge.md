# Unir y corregir nombres de "Entregado por/a" (Personas) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una página `/people` ("Personas", solo ADMIN) para unir o renombrar las grafías de `delivered_by`, reescribiendo el nombre en los movimientos afectados y auditando cada cambio.

**Architecture:** Funciones puras agrupan las grafías exactas. `peopleService` lista, previsualiza y une (actualiza por lotes con el cliente del usuario y audita con `auditService`, incluido un nuevo método de auditoría en lote). Dos server actions protegidas por el permiso nuevo `MANAGE_PEOPLE` (sembrado solo para ADMIN) y una página con tabla, pestañas Ingresos/Egresos y un diálogo de unión.

**Tech Stack:** Next.js 16 App Router, Supabase (RLS, migración de permisos), Zod, `Dialog`/`sonner` de `components/ui/`, jest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-22-people-merge-design.md`

**Referencia visual:** el canvas "Holly Money: buscador global", artboard "Personas: unir nombres" (https://claude.ai/artifact/5e4ew8tPZFdTU5a1JPbsD5; es privado y los subagentes no pueden abrirlo: usar la descripción de cada tarea) y las capturas reales de la app en `docs/screenshots/` (por ejemplo `01-movements/list.png`, `05-requests/review-dialog.png`, que se abren con la herramienta de lectura de imágenes): copiar de ahí el lenguaje visual (tabla en tarjeta con encabezados en mayúsculas pequeñas, botones violeta en forma de píldora, diálogos redondeados con título y botón de cierre).

## Global Constraints

- Siempre `pnpm`, nunca `npm` ni `yarn`. Nunca ejecutar `pnpm prettier` (reescribe decenas de archivos): formatear solo archivos propios con `pnpm exec prettier --write <archivos>`, o confiar en `pnpm lint`. Nunca `pnpm supabase db reset`; las migraciones se crean con `pnpm supabase migration new …` y se aplican con `pnpm supabase migration up`.
- Estilo: sin punto y coma, comillas dobles, `printWidth` 100, sin comas finales.
- Identificadores, archivos, rutas y tablas en inglés (la ruta es `/people`); el español solo en textos de UI, mensajes de Zod y toasts.
- El permiso es `MANAGE_PEOPLE`, sembrado **solo para ADMIN**; se comprueba con `can(user.permissions, PERMISSIONS.MANAGE_PEOPLE)`, nunca con nombres de rol (la barra lateral es la única excepción: enlace solo para ADMIN).
- Lógica de negocio en `services/`; acciones y páginas no llaman a la base directamente. Los inserts de auditoría usan `auditService` (cliente admin ya en la lista blanca de CI): no agregar usos nuevos de `createSupabaseAdminClient`.
- Los nombres de origen nunca se pasan a filtros de PostgREST (`ilike`, `in`, `or`): se comparan en TypeScript con un `Set` de cadenas exactas; los lotes de actualización usan ids (UUID).
- Unir actúa sobre un solo `movement_type` a la vez, sobre grafías **exactas**, sobre movimientos activos y anulados, y nunca sobre `delivered_by` nulo o vacío.
- Cada movimiento modificado deja su entrada en `movement_audit_log` (`action: "Nombre actualizado"`, `previous_value` y `new_value` con `{ delivered_by }`, `note` con el identificador de la unión), y la operación deja una entrada en `system_audit_log` (`entity: "people"`, `action: "Nombres unidos"`).
- `pnpm run ci` y `pnpm test` deben pasar con cero advertencias de lint.

## Review Focus

- Un nombre con comas, paréntesis, comillas, `%`, `_` o `\` se une exactamente, sin romper ni ampliar la selección (Tasks 2 y 3).
- Más de 1000 movimientos del tipo: la lista, la vista previa y la unión recorren todas las páginas sin perder ni duplicar filas (Task 3).
- Un movimiento de otro tipo con la misma grafía no cambia (Task 3, integración).
- Los movimientos que ya tienen el nombre final no se tocan ni se auditan (Task 3).
- Sin `MANAGE_PEOPLE` las acciones rechazan y la página redirige; BURSAR y el resto no lo tienen por defecto (Tasks 1, 4 y 6).
- Si la actualización o la auditoría fallan a medias, el error dice cuántos movimientos cambiaron y cuántas entradas faltan (Task 3).
- El nombre final se recorta y colapsa; vacío o de más de 100 caracteres se rechaza (Tasks 2 y 4).
- Elegir las grafías, previsualizar y unir desde el diálogo no permite doble envío ni muestra una vista previa vieja (Task 5).

---

### Task 0: Rama y documentos

**Files:**
- Create: `docs/superpowers/specs/2026-11-22-people-merge-design.md` (ya existe sin commitear)
- Create: `docs/superpowers/plans/2026-11-22-people-merge.md` (este archivo)

- [ ] **Step 1: Crear la rama desde `origin/main`**

Esta mejora usa `normalizeName` y las páginas de movimientos, que ya están en `origin/main` (PR #138 fusionado). Run: `git fetch origin main && git switch -c feat/people-merge origin/main`. No modificar el `main` local. Si git se niega por el `CLAUDE.md` modificado, ejecutar `git stash push CLAUDE.md` y repetir. Ejecutar sin otra rama en trabajo en el mismo directorio.
Expected: `git branch --show-current` imprime `feat/people-merge`.

- [ ] **Step 2: Commit de spec y plan**

```bash
git add docs/superpowers/specs/2026-11-22-people-merge-design.md docs/superpowers/plans/2026-11-22-people-merge.md
git commit -m "docs: spec y plan de unión de nombres de entregado por/a"
```
Terminar el mensaje con la línea `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` y la línea `Claude-Session:` de la atribución de la sesión.

---

### Task 1: Permiso `MANAGE_PEOPLE`

**Files:**
- Modify: `lib/permissions/rbac.ts` (constante `MANAGE_PEOPLE` en `PERMISSIONS`)
- Create: `supabase/migrations/<timestamp>_seed_manage_people_permission.sql` (con `pnpm supabase migration new seed_manage_people_permission`)
- Modify: la matriz de Settings → Permisos si lista los permisos con etiquetas fijas (buscar dónde aparece, por ejemplo, la etiqueta de `MANAGE_CATEGORIES`; si la matriz es genérica sobre `PERMISSIONS`, no hay cambio)
- Test: `services/__integration__/people-permission.test.ts` (nuevo; sigue el patrón de `services/__integration__/rls.test.ts`: omitido sin Supabase local)

**Interfaces:**
- Produces: `PERMISSIONS.MANAGE_PEOPLE = "MANAGE_PEOPLE"`.

- [ ] **Step 1: Escribir el test de integración**

Con el cliente de servicio, consultar `role_permissions` donde `permission = "MANAGE_PEOPLE"`: debe haber exactamente una fila, con `role` "ADMIN" y `enabled` en `true`; ninguna fila de BURSAR ni de otro rol con `enabled` en `true`.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test services/__integration__/people-permission.test.ts`
Expected: FAIL (cero filas), con la pila local de Supabase levantada. Pasar las llaves como variables de entorno desde `pnpm supabase status` (no leer `.env.local`); si el entorno bloquea las pruebas de integración, decirlo en el reporte.

- [ ] **Step 3: Implementar**

Agregar la constante, crear la migración con `INSERT INTO role_permissions (role, permission, enabled) VALUES ('ADMIN', 'MANAGE_PEOPLE', true);` (un comentario explica que es solo para ADMIN por decisión de la usuaria) y aplicarla con `pnpm supabase migration up`.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test services/__integration__/people-permission.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add lib/permissions/rbac.ts supabase/migrations services/__integration__/people-permission.test.ts
git commit -m "feat(people): permiso MANAGE_PEOPLE solo para ADMIN"
```
(Agregar al `git add` el archivo de la matriz si hubo que cambiarlo.)

---

### Task 2: Funciones puras, tipos y esquema

**Files:**
- Create: `types/people.ts`, `lib/utils/people.ts`, `lib/validators/people.ts`
- Test: `lib/utils/__tests__/people.test.ts`, `lib/validators/__tests__/people.test.ts`

**Interfaces:**
- Consumes: `normalizeName` de `lib/utils/name-suggestions.ts`.
- Produces (`types/people.ts`): `type PeopleMovementType = "INCOME" | "EXPENSE"`, `type PersonName = { name: string; count: number; total: number; lastDate: string; sameAs: string[] }`, `type DeliveredByRow = { delivered_by: string | null; amount: number; movement_date: string; status: "ACTIVE" | "CANCELLED" }`.
- Produces (`lib/utils/people.ts`): `groupDeliveredByNames(rows: DeliveredByRow[]): PersonName[]` y `normalizeTargetName(value: string): string`.
- Produces (`lib/validators/people.ts`): `peopleMergeSchema` y `type PeopleMergeInput`, con `{ movement_type: "INCOME" | "EXPENSE"; from_names: string[]; to_name: string }`.

- [ ] **Step 1: Escribir los tests**

- `groupDeliveredByNames`:
  - filas con "Hna. Mabel" (2 activas, montos 20000 y 20000, fechas "2026-11-12" y "2026-10-03") y "Hna. Mabel" (1 anulada, monto 7000, "2026-09-01") → un grupo `{ name: "Hna. Mabel", count: 3, total: 40000, lastDate: "2026-11-12" }` (el total solo suma activas, la cuenta incluye anuladas);
  - la grafía es **exacta**: "Hna. Mabel" y "hna.  mabel" son dos grupos y cada uno lista al otro en `sameAs`; "Mabel" no aparece en el `sameAs` de "Hna. Mabel" (no tienen el mismo nombre normalizado);
  - orden: cantidad descendente y, en empate, nombre con `localeCompare("es")`;
  - `delivered_by` nulo, `""` y solo espacios se ignoran; lista vacía → `[]`;
  - nombres con `,`, `(`, `"`, `%` y `\` se conservan tal cual.
- `normalizeTargetName`: `"  Hna.   Mabel "` → `"Hna. Mabel"`; `"   "` → `""`; conserva mayúsculas y tildes (`"Pérez  Ñandú"` → `"Pérez Ñandú"`).
- `peopleMergeSchema`: acepta `{ movement_type: "INCOME", from_names: ["Mabel", "Hna. Mabel"], to_name: "  Hna.  Mabel " }` y deja `to_name` como `"Hna. Mabel"`; rechaza `from_names: []`, un nombre de origen vacío, más de 50 nombres, `to_name` vacío o de espacios, `to_name` de más de 100 caracteres y un `movement_type` inválido, con mensajes en español ("Elige al menos un nombre", "Escribe el nombre final", "El nombre final no puede superar 100 caracteres").

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test lib/utils/__tests__/people.test.ts lib/validators/__tests__/people.test.ts`
Expected: FAIL, los módulos no existen.

- [ ] **Step 3: Implementar**

Agrupar con un `Map` por la cadena exacta; `sameAs` se calcula agrupando por `normalizeName` y excluyendo la propia grafía. El esquema aplica `normalizeTargetName` antes de validar longitud.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test lib/utils lib/validators && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add types/people.ts lib/utils/people.ts lib/utils/__tests__/people.test.ts lib/validators/people.ts lib/validators/__tests__/people.test.ts
git commit -m "feat(people): agrupar grafías de entregado por/a y validar la unión"
```

---

### Task 3: Servicio y auditoría en lote

**Files:**
- Modify: `services/audit/audit.service.ts` (método nuevo `logMovementsBulk`)
- Create: `services/people/people.service.ts`
- Test: `services/audit/__tests__/audit.service.test.ts` (nuevo o ampliado), `services/people/__tests__/people.service.test.ts`, `services/__integration__/people-merge.test.ts` (nuevo; omitido sin Supabase local)

**Interfaces:**
- Consumes: `groupDeliveredByNames`, `normalizeTargetName` y los tipos de la Task 2; `auditService.logSystem`.
- Produces: `auditService.logMovementsBulk(inputs: Array<{ movement_id: string; action: string; user_id: string; previous_value?: unknown; new_value?: unknown; note?: string | null }>): Promise<void>`: inserta en `movement_audit_log` en una sola consulta por grupo de hasta 500, resuelve el `impersonator_id` una vez, y lanza el error de la base si falla.
- Produces: `peopleService.list(db: DB, input: { movementType: PeopleMovementType }): Promise<PersonName[]>`; `peopleService.preview(db: DB, input: { movementType: PeopleMovementType; fromNames: string[]; toName: string }): Promise<{ affected: number }>`; `peopleService.merge(db: DB, input: { movementType: PeopleMovementType; fromNames: string[]; toName: string; userId: string }): Promise<{ updated: number }>`.

- [ ] **Step 1: Escribir los tests**

- Auditoría en lote (mockeando el cliente admin): inserta una fila por entrada con los campos correctos y el `impersonator_id` resuelto una sola vez; con 1200 entradas hace 3 inserts (500, 500, 200); una lista vacía no consulta; el error de la base se lanza.
- Servicio con un mock encadenable (como el de `services/movements/__tests__/movements.service.test.ts`):
  - `list` pide `delivered_by, amount, movement_date, status` de `movements` del tipo, paginando con `range` de 1000 en 1000 hasta una página incompleta (orden por `movement_date`, `created_at` e `id` descendentes) y devuelve `groupDeliveredByNames` de todas las filas; el error se lanza;
  - `preview` y `merge` no usan filtros de PostgREST con nombres: la consulta trae `id, delivered_by` del tipo (paginada) y el filtrado por nombres exactos se hace en TypeScript; `preview` cuenta las filas con `delivered_by` en `fromNames` y distinto de `toName`; con `fromNames` que incluyen un nombre con `,`, `(` o `"` la cuenta es exacta;
  - `merge` rechaza (lanza) con `fromNames` vacío, `toName` vacío o de más de 100 caracteres, o un origen nulo o vacío; ignora los movimientos que ya tienen `toName`; actualiza por lotes de ids (`update({ delivered_by: toName, updated_by_id: userId, updated_at: <ISO> })` con `.in("id", [...])` y `.select("id")`), de a 200; llama a `auditService.logMovementsBulk` con una entrada por movimiento realmente actualizado (`action: "Nombre actualizado"`, `previous_value: { delivered_by: <antes> }`, `new_value: { delivered_by: toName }`, `note` con un identificador de la unión que empieza con "Unión de nombres") y al final a `auditService.logSystem` (`entity: "people"`, `action: "Nombres unidos"`, `new_value` con `movement_type`, `from_names`, `to_name`, `updated` y el identificador); devuelve `{ updated }`;
  - si una actualización devuelve menos ids que los pedidos, o la auditoría falla después de actualizar, `merge` lanza un error cuyo mensaje incluye la cantidad ya actualizada y las entradas de auditoría que faltan.
- Integración (con los clientes y el usuario administrador de prueba como en `rls.test.ts`; marcador único por ejecución, p. ej. "ZZPEOPLE-<timestamp>"): crear movimientos de fixture con grafías "ZZP Ana", "zzp  ana" y "ZZP Anita" de tipo INCOME, uno de EXPENSE con "ZZP Ana" y uno anulado con "ZZP Anita"; ejecutar `peopleService.merge` como administrador uniendo las tres grafías de ingresos en "ZZP Ana Maria"; comprobar que los 4 movimientos de ingresos (incluido el anulado) quedan con ese nombre, que el de EXPENSE no cambia, que hay una entrada de auditoría "Nombre actualizado" por cada movimiento cambiado con el nombre anterior, y una entrada de `system_audit_log`; limpiar los fixtures (movimientos y sus entradas de auditoría) con el cliente de servicio.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test services/audit services/people`
Expected: FAIL, los métodos no existen.

- [ ] **Step 3: Implementar**

`peopleService` pagina con `range` de 1000 en 1000 (límite de PostgREST), sin filtrar por nombre en la base. El identificador de la unión es `crypto.randomUUID()`. Actualizar primero cada lote y auditar después; recopilar los fallos y lanzar un único error al final con los números.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test services/audit services/people services/__integration__/people-merge.test.ts && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias (la integración corre contra Supabase local pasando las llaves como variables de entorno desde `pnpm supabase status`; no leer `.env.local`; si algo se bloquea, decirlo).

- [ ] **Step 5: Commit**

```bash
git add services/audit services/people services/__integration__/people-merge.test.ts
git commit -m "feat(people): servicio para listar, previsualizar y unir nombres con auditoría"
```

---

### Task 4: Server actions

**Files:**
- Create: `app/actions/people.ts`
- Test: `app/actions/__tests__/people.test.ts`

**Interfaces:**
- Consumes: `peopleService` (Task 3), `peopleMergeSchema` (Task 2), `PERMISSIONS.MANAGE_PEOPLE` (Task 1).
- Produces: `previewPeopleMerge(input: PeopleMergeInput): Promise<{ affected: number }>` y `mergePeople(input: PeopleMergeInput): Promise<{ updated: number }>`, exportadas desde `app/actions/people.ts` (archivo `"use server"`: solo funciones asíncronas y tipos).

- [ ] **Step 1: Escribir los tests**

Siguiendo `app/actions/__tests__/movements.test.ts`: sin sesión y sin permiso (`can` con `MANAGE_PEOPLE` devuelve `false`) rechazan con "Sin permisos para unir nombres" y no llaman al servicio; una entrada inválida (lista de origen vacía, nombre final vacío o de más de 100 caracteres) rechaza con el mensaje de validación y no llama al servicio; `previewPeopleMerge` llama a `peopleService.preview` con `{ movementType, fromNames, toName }` normalizado y devuelve su resultado; `mergePeople` llama a `peopleService.merge` con el `userId` del usuario y llama a `revalidatePath` con `/people`, `/tithers` y `/movements`; un error del servicio se propaga.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test app/actions/__tests__/people.test.ts`
Expected: FAIL, las acciones no existen.

- [ ] **Step 3: Implementar**

Comprobar sesión y permiso antes de validar; validar con `peopleMergeSchema.parse` (lanza con el mensaje en español); usar `createSupabaseServerClient()` y el servicio.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test app/actions && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Commit**

```bash
git add app/actions/people.ts app/actions/__tests__/people.test.ts
git commit -m "feat(people): acciones para previsualizar y unir nombres"
```

---

### Task 5: Componentes de interfaz

**Files:**
- Create: `components/people/people-table.tsx`, `components/people/merge-dialog.tsx`
- Test: `components/people/__tests__/people-table.test.tsx`, `components/people/__tests__/merge-dialog.test.tsx`

**Interfaces:**
- Consumes: `PersonName`, `PeopleMovementType` (Task 2); `previewPeopleMerge` y `mergePeople` (Task 4); `normalizeName`; `formatCLP`, `formatDate`; `toast` de `sonner`; `useRouter` de `next/navigation`.
- Produces: `PeopleTable(props: { names: PersonName[]; movementType: PeopleMovementType }): JSX.Element` (cliente; filtro, selección y diálogo) y `MergeDialog(props: { movementType: PeopleMovementType; selected: PersonName[]; open: boolean; onOpenChange: (open: boolean) => void; onDone: () => void }): JSX.Element`.

Descripción visual (el canvas es privado): `PeopleTable` es una tarjeta blanca con borde; encabezados NOMBRE, MOVIMIENTOS, TOTAL, ÚLTIMO MOVIMIENTO; primera columna con casilla; nombre en negrita; la fila seleccionada con fondo violeta muy claro; la insignia ámbar "Misma persona, distinta escritura" junto al nombre cuando hay `sameAs`; en cada fila un enlace "Renombrar" violeta; sobre la tabla un campo "Filtrar por nombre…" con lupa y, en el encabezado de la página (lo arma la página), el botón "Unir seleccionados (N)" que aquí vive dentro del componente como barra superior: píldora violeta, deshabilitada con menos de 2 seleccionadas. `MergeDialog` usa el `Dialog` existente: título "Unir nombres" (o "Renombrar" cuando hay una sola grafía), subtítulo "Todos los movimientos de estos nombres quedarán con el nombre que elijas.", un grupo de opciones "Nombre final" (una por grafía elegida, con su cantidad de movimientos, y la última "Otro nombre…" que muestra un campo de texto; al renombrar solo hay un campo de texto con la grafía actual), un aviso ámbar "N movimientos cambiarán de nombre. Cada cambio queda en la auditoría, con el nombre anterior." y los botones "Cancelar" y "Unir nombres".

- [ ] **Step 1: Escribir los tests**

Mockear `@/app/actions/people`, `sonner` y `next/navigation`.
- `PeopleTable` con las grafías "Hna. Mabel" (12, $240.000), "Mabel" (4), "Juan Pérez" (9), "Pedro Soto" (4) y "Pedro  soto" (1, con `sameAs: ["Pedro Soto"]`): muestra los nombres con sus cantidades, totales y fechas ("12-11-2026"); la insignia "Misma persona, distinta escritura" aparece junto a "Pedro  soto"; "Unir seleccionados" está deshabilitado sin selección y con una sola; al marcar "Hna. Mabel" y "Mabel" se habilita y muestra "(2)"; el filtro "juan perez" deja solo "Juan Pérez" (ignora tildes y mayúsculas); sin coincidencias muestra "Sin coincidencias."; lista vacía muestra "No hay nombres para unir.".
- `MergeDialog` con dos grafías seleccionadas: título "Unir nombres" y las dos opciones más "Otro nombre…"; al elegir "Hna. Mabel" llama a `previewPeopleMerge` con `{ movement_type, from_names: ["Hna. Mabel", "Mabel"], to_name: "Hna. Mabel" }` y muestra "4 movimientos cambiarán de nombre."; al elegir "Otro nombre…" y escribir "Mabel Rojas" la vista previa se pide a los 250 ms (no antes) con ese nombre; una respuesta vieja que llega después de una nueva no la pisa; "Unir nombres" está deshabilitado mientras no haya nombre final o mientras carga la vista previa; al pulsarlo llama a `mergePeople` una sola vez (un segundo clic mientras envía no repite), muestra un toast de éxito con la cantidad, cierra y llama a `onDone`; si `mergePeople` rechaza muestra el mensaje de error dentro del diálogo, no cierra y permite reintentar.
- `MergeDialog` con una sola grafía: título "Renombrar", un solo campo de texto con la grafía actual y la vista previa solo cuando el texto cambia respecto a la actual.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/people`
Expected: FAIL, los componentes no existen.

- [ ] **Step 3: Implementar**

Seguir `components/dashboard/global-search.tsx` y `components/movements/delivered-by-autocomplete.tsx` para la espera de 250 ms y el descarte de respuestas viejas con un contador en un `useRef`. Evitar `truncate` en nombres y montos.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test components/people && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias ni `act()` en la salida.

- [ ] **Step 5: Commit**

```bash
git add components/people
git commit -m "feat(people): tabla de nombres y diálogo para unirlos"
```

---

### Task 6: Página, navegación y verificación

**Files:**
- Create: `app/(dashboard)/people/page.tsx`, `app/(dashboard)/people/loading.tsx`
- Modify: `components/dashboard/app-sidebar.tsx` (enlace "Personas" en "Finanzas", después de los movimientos, con `href: "/people"`, un ícono de `lucide-react` de personas y `roles: ["ADMIN"]`), `components/dashboard/site-header.tsx` (`"/people": "Personas"` en `PAGE_LABELS`)
- Test: `components/dashboard/__tests__/app-sidebar.test.tsx` (casos nuevos en `getVisibleGroups`)

**Interfaces:**
- Consumes: `peopleService.list` (Task 3), `PeopleTable` (Task 5), `PERMISSIONS.MANAGE_PEOPLE` (Task 1), `getCurrentUser` y `createSupabaseServerClient`.

- [ ] **Step 1: Escribir los tests del menú**

En `app-sidebar.test.tsx`: ADMIN ve `/people` dentro de "Finanzas"; BURSAR, FINANCE, MINISTER y DELEGATE no.

- [ ] **Step 2: Ejecutar y ver que falla**

Run: `pnpm test components/dashboard/__tests__/app-sidebar.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar la página y el menú**

`page.tsx` (server component, patrón de `app/(dashboard)/movements/page.tsx`): `searchParams: Promise<{ type?: string }>`; sin usuario o sin `MANAGE_PEOPLE` redirige a `/dashboard`; `type` válido `INCOME` o `EXPENSE`, por defecto `INCOME`; llama a `peopleService.list`; título "Personas" con el subtítulo "Nombres de “Entregado por” y “Entregado a”: une los que son la misma persona", pestañas Ingresos/Egresos como enlaces a `/people?type=INCOME|EXPENSE` (la activa con píldora blanca sobre fondo lavanda) y `PeopleTable`. `loading.tsx` con un esqueleto simple como el de otras páginas.

- [ ] **Step 4: Ejecutar y ver que pasa**

Run: `pnpm test components/dashboard && pnpm typecheck && pnpm lint`
Expected: PASS, sin advertencias.

- [ ] **Step 5: Verificación completa**

Run: `pnpm run ci && pnpm test && pnpm build`
Expected: lint y typecheck sin errores ni advertencias, todos los tests pasan (con las integraciones si hay Supabase local) y la compilación termina sin errores.

- [ ] **Step 6: Probar en el navegador**

Con la base local y el servidor de desarrollo ya levantados, usando `playwright-cli` (regla del repo) y SIN ejecutar nunca `pnpm supabase db reset`. IMPORTANTE: unir cambia datos reales de la base local; no unir nombres existentes de la usuaria. Crear TRES ingresos de prueba desde la interfaz de la app (nunca con SQL directo) con los nombres "Zzqx Persona Uno", "zzqx  persona uno" y "Zzqx Persona Dos", y probar solo con esos. Como ADMIN: abrir `/people` y comprobar la lista, las pestañas, el filtro, la insignia de misma persona entre las dos primeras grafías, seleccionar dos y abrir el diálogo, ver la vista previa ("2 movimientos cambiarán de nombre" o el número que corresponda), unir, ver el toast y que la lista se actualiza con un solo nombre; que en `/movements?search=Zzqx` los movimientos muestran el nombre final y que la auditoría del movimiento (en su detalle o en `/audit`) muestra "Nombre actualizado" con el nombre anterior; probar "Renombrar" con una grafía; el diseño a 390 px; y que BURSAR (o MINISTER) no ve el enlace "Personas" y que abrir `/people` lo redirige. Al terminar, anular desde la app los tres movimientos de prueba con el motivo "prueba". Anotar qué se probó y qué no. No hacer push ni PR.

- [ ] **Step 7: Commit**

```bash
git add "app/(dashboard)/people" components/dashboard/app-sidebar.tsx components/dashboard/site-header.tsx components/dashboard/__tests__/app-sidebar.test.tsx
git commit -m "feat(people): página de personas y enlace en el menú para ADMIN"
```

---

## Nota para después

El botón "Unir nombres" de la lista de diezmadores (que se ve con `MANAGE_PEOPLE`) depende de que exista `/tithers`: se agrega en una tarea chica cuando las dos ramas (`feat/tithers-list` y `feat/people-merge`) estén integradas.
