# Unir y corregir nombres de "Entregado por/a" (Personas)

Fecha: 2026-11-22. Estado: borrador para aprobación. Origen: petición de la usuaria al revisar la planilla: hay nombres mal escritos o repetidos en `delivered_by` ("Mabel", "Hna. Mabel", "Mabel Pérez") y quiere poder unirlos desde la aplicación. Decisión de la usuaria: reescribir el nombre en los movimientos (enfoque A). Mockup en el canvas "Holly Money: buscador global", artboard "Personas: unir nombres".

## Intención

`movements.delivered_by` es texto libre. La normalización de mayúsculas, tildes y espacios ya agrupa variantes triviales al leer, pero no puede saber que "Mabel" y "Hna. Mabel" son la misma persona. Una pantalla permite elegir varias grafías y unirlas bajo un nombre final, y así la búsqueda, las sugerencias, los totales y la lista de diezmadores usan nombres limpios sin cambios en cada lugar.

## Metas

- Página `/people` ("Personas") con las grafías distintas de `delivered_by`, separadas en dos pestañas: Ingresos ("Entregado por") y Egresos ("Entregado a"), cada una con cantidad de movimientos, total (solo activos) y último movimiento.
- Seleccionar varias grafías y **Unir** bajo un nombre final (una de las seleccionadas o uno escrito a mano), viendo antes cuántos movimientos cambiarán. También **Renombrar** una sola grafía para corregirla.
- Cada movimiento modificado deja su entrada en `movement_audit_log` con el valor anterior y el nuevo, y la operación completa deja una entrada en `system_audit_log`.
- Acceso desde la barra lateral ("Personas", en "Finanzas") y desde la lista de diezmadores (botón "Unir nombres"), solo con el permiso nuevo `MANAGE_PEOPLE`.

## No metas y anti-metas

- No hay tabla de personas ni de alias: el nombre queda escrito en cada movimiento. La opción de alias aplicada al leer y la de personas con clave foránea quedan descartadas por ahora.
- No se detectan duplicados automáticamente: la lista se ordena por cantidad y la usuaria elige. Solo hay una pista cuando dos grafías tienen el mismo nombre normalizado (misma persona, distinta escritura).
- No se mezclan ingresos con egresos: unir actúa sobre un solo tipo de movimiento a la vez.
- No hay deshacer automático; la auditoría guarda lo necesario para revertir a mano.
- No toca movimientos sin nombre (`delivered_by` nulo o vacío).
- Anti-meta: que una unión deje la auditoría incompleta sin que la usuaria lo note.

## Enfoques considerados

- **A. Reescribir `delivered_by` en los movimientos, auditando cada cambio. Elegido.** Todo el resto del sistema sigue funcionando con el mismo texto. Cuesta modificar datos históricos.
- **B. Tabla de alias aplicada al leer.** No toca datos y es reversible, pero obliga a resolver alias en la búsqueda, las sugerencias, los totales y los diezmadores. Descartada.
- **C. Tabla de personas con clave foránea.** Lo más limpio, pero exige una migración grande y cambiar el formulario. Queda para una etapa posterior si hace falta.

## Diseño

**Permiso y migración**
- `PERMISSIONS.MANAGE_PEOPLE` en `lib/permissions/rbac.ts`. Una migración (con `pnpm supabase migration new seed_manage_people_permission`, aplicada con `pnpm supabase migration up`, nunca `db reset`) siembra en `role_permissions` solo `('ADMIN', 'MANAGE_PEOPLE', true)` (decisión de la usuaria: ningún otro rol recibe esta responsabilidad), siguiendo el precedente de `20260715143757_seed_manage_categories_permission.sql`. Se agrega el permiso (con su etiqueta) a la matriz de Settings → Permisos, donde un ADMIN podría concederlo a otro rol más adelante si quisiera.
- No hay otros cambios de esquema.

**Lógica pura** `lib/utils/people.ts`
- `groupDeliveredByNames(rows: { delivered_by: string | null; amount: number; movement_date: string; status: "ACTIVE" | "CANCELLED" }[]): PersonName[]`, con `PersonName = { name: string; count: number; total: number; lastDate: string; sameAs: string[] }`: agrupa por la grafía **exacta** (no por la normalizada, porque la unión actúa sobre cadenas exactas); `count` cuenta todos los movimientos (activos y anulados) y `total` solo los activos; `lastDate` es la fecha más reciente; `sameAs` lista las otras grafías con el mismo nombre normalizado. Orden: cantidad descendente y, en empate, nombre. Se ignoran los nombres nulos o vacíos.
- `normalizeTargetName(value: string): string`: recorta y colapsa espacios internos; devuelve `""` si queda vacío.

**Servicio** `services/people/people.service.ts`
- `peopleService.list(db, { movementType })`: trae `delivered_by, amount, movement_date, status` de los movimientos del tipo, paginando de 1000 en 1000 (límite de PostgREST, orden determinista por fecha, creación e id), y agrupa con `groupDeliveredByNames`.
- `peopleService.preview(db, { movementType, fromNames, toName })`: devuelve `{ affected: number }` con los movimientos cuyo `delivered_by` es exactamente una de las grafías de origen y distinto del nombre final.
- `peopleService.merge(db, { movementType, fromNames, toName, userId })`: valida que haya al menos una grafía de origen, que el nombre final no esté vacío, que ninguna grafía de origen sea nula o vacía, y que `toName` no supere 100 caracteres; trae los ids y valores actuales de los movimientos afectados; los actualiza por lotes con el cliente del usuario (así aplica RLS); por cada movimiento afectado inserta su entrada en `movement_audit_log` mediante `auditService` (`action: "Nombre actualizado"`, `previous_value` y `new_value` con `delivered_by`, y una `note` con un identificador de la unión para poder agruparlas) y, al final, una entrada en `system_audit_log` (`entity: "people"`, `action: "Nombres unidos"`, `new_value` con `fromNames`, `toName` y la cantidad). Devuelve `{ updated: number }`. Si falla un lote de la actualización o de la auditoría, lanza un error que dice cuántos movimientos ya se habían actualizado y cuántos entradas de auditoría faltan, en vez de seguir en silencio.

**Acciones** (`app/actions/people.ts`)
- `previewPeopleMerge(input)` y `mergePeople(input)`: sesión y `can(user.permissions, PERMISSIONS.MANAGE_PEOPLE)` antes que nada (error "Sin permisos para unir nombres"); validación con un esquema Zod de `lib/validators/people.ts` (`movement_type` INCOME o EXPENSE, `from_names` de 1 a 50 textos no vacíos, `to_name` recortado de 1 a 100 caracteres); llaman al servicio con el cliente del servidor. `mergePeople` revalida `/people`, `/tithers` y `/movements`.

**Interfaz**
- `app/(dashboard)/people/page.tsx` (server component): exige `MANAGE_PEOPLE` (redirige a `/dashboard`), lee `?type=INCOME|EXPENSE` (por defecto INCOME) y muestra título "Personas" con subtítulo, las pestañas Ingresos/Egresos y `PeopleTable`.
- `components/people/people-table.tsx` (cliente): tabla con casilla, nombre, movimientos, total y último movimiento; campo "Filtrar por nombre…"; una insignia "Misma persona, distinta escritura" cuando hay `sameAs`; botón "Unir seleccionados" (activo con 2 o más) y "Renombrar" por fila.
- `components/people/merge-dialog.tsx` (cliente): lista las grafías elegidas como opciones y un campo para escribir un nombre nuevo; al elegir o escribir pide la vista previa (`previewPeopleMerge`) y muestra "N movimientos cambiarán de nombre"; botón "Unir" que llama a `mergePeople`, con estados de carga y error, y al terminar cierra, avisa con un toast y refresca la lista.
- Barra lateral: enlace "Personas" (`/people`, ícono de usuarios) en "Finanzas" después de "Diezmadores", visible solo para ADMIN (la barra lateral es la única excepción que usa nombres de rol, según CLAUDE.md; si un ADMIN concediera el permiso a otro rol desde Settings → Permisos, ese rol podría usar la página por su dirección, pero el enlace del menú no aparecería hasta cambiar los roles de esa entrada). En `/tithers`, botón "Unir nombres" visible con `MANAGE_PEOPLE`. Etiqueta "Personas" en `site-header.tsx`.

**Pruebas**
- Jest sobre `groupDeliveredByNames` y `normalizeTargetName` (grafías exactas, activos y anulados, `sameAs`, orden, ignorados, espacios).
- Jest sobre el servicio con un mock encadenable: lista con más de 1000 filas, vista previa exacta (excluye las que ya tienen el nombre final), unión por lotes, entrada de auditoría por movimiento con valores anterior y nuevo, entrada final en `system_audit_log`, errores lanzados con las cantidades parciales.
- Jest sobre las acciones: sin sesión, sin permiso, entrada inválida (lista vacía, nombre vacío, demasiado largo), llamada correcta y revalidación de rutas.
- Pruebas de componente: seleccionar y habilitar "Unir seleccionados", el diálogo con la vista previa, el flujo de éxito y de error, y la insignia de misma persona.
- Prueba de integración (omitida sin Supabase local), siguiendo `services/__integration__/`: crea movimientos de fixture con grafías distintas, ejecuta la unión como el usuario administrador de pruebas y comprueba que todos quedan con el nombre final, que hay una entrada de auditoría por movimiento y que un movimiento de otro tipo con la misma grafía no cambia; limpia los fixtures.

## Decisiones mías (revisar)

- Permiso `MANAGE_PEOPLE` solo para ADMIN (decidido por la usuaria; BURSAR y el resto no lo reciben).
- La unión incluye los movimientos anulados, para que el historial quede coherente.
- La actualización no es atómica entre lotes; si algo falla a medias, el error lo dice con números en lugar de continuar sin avisar. Una función SQL atómica con la comprobación de permisos dentro queda como mejora si el volumen lo pide.

## Queda para quien construya

Estilos exactos de la tabla, de la barra de acciones y del diálogo (siguiendo el artboard y las capturas de `docs/screenshots/`), el tamaño de los lotes y nombres exactos de archivos.
