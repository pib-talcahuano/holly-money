# Sugerencias de nombre en "Entregado por/a"

Fecha: 2026-11-21. Estado: borrador para aprobación. Origen: lista de mejoras de la usuaria ("Diezmadores, listar y poder ver los diezmos de una persona") y la decisión de inferir diezmadores desde los movimientos de la categoría Diezmos, en vez de modelar personas.

## Intención

`movements.delivered_by` es texto libre y opcional. "Hna. Mabel", "Mabel Pérez" y "mabel" quedan como tres personas distintas, lo que impide listar diezmadores o ver los diezmos de una persona. Para evitar nombres distintos para la misma persona desde el origen, el campo sugiere los nombres ya escritos mientras se teclea.

## Metas

- Al escribir en "Entregado por" (ingresos) o "Entregado a" (egresos), aparecen sugerencias tomadas de movimientos existentes del mismo tipo.
- Elegir una sugerencia rellena el campo con esa grafía exacta.
- Se puede seguir escribiendo un nombre nuevo sin trabas.
- Una sola grafía por persona en las sugerencias, aunque el historial tenga variantes de mayúsculas, tildes o espacios.

## No metas y anti-metas

- No se crea tabla de personas ni de alias. El campo sigue siendo texto libre en la base de datos.
- No se modifican los movimientos existentes ni se unen variantes viejas.
- No se exige el nombre ni se bloquean los nombres nuevos.
- No se incluye remuneraciones: ahí `delivered_by` no identifica a un diezmador.
- Anti-meta: sugerir nombres de movimientos anulados, o mezclar nombres de ingresos con destinatarios de egresos.
- Fuera de alcance: la lista de diezmadores y su vista por persona (se diseñan después, sobre estos mismos datos).

## Enfoques considerados

- **A. Server action con deduplicado en el servicio. Elegido.** Sin migración, reutiliza el patrón de acciones existente. La frecuencia se calcula sobre los movimientos más recientes, no sobre todo el historial.
- **B. Función SQL (RPC) con `DISTINCT` y conteo exacto.** Resultado exacto, pero exige migración, tipos regenerados y revocar permisos. Queda como mejora si A se vuelve lenta.
- **C. Cargar todos los nombres al abrir el formulario y filtrar en el navegador.** Descartado: baja miles de filas por formulario.

## Diseño

**Servidor**
- `lib/utils/name-suggestions.ts` (puro): `normalizeName(value: string): string` (minúsculas, sin tildes, espacios colapsados y recortados) y `groupNameSuggestions(names: string[], limit: number): { name: string; count: number }[]`. Agrupa por nombre normalizado, muestra la grafía más usada de cada grupo (en empate, la más reciente según el orden recibido) y ordena por frecuencia descendente.
- `movementsService.suggestDeliveredBy(db, { query, movementType })`: consulta `movements` con `status = ACTIVE`, `movement_type` igual al pedido, `delivered_by` no nulo y que contenga el texto (`ilike`, pasado por `sanitizePostgrestSearch`), ordenado por fecha descendente, máximo 200 filas; llama a `groupNameSuggestions` con límite 8. Filtra además por coincidencia sobre el nombre normalizado, para que "mabel" encuentre "Mábel".
- Esquema Zod `deliveredBySuggestionSchema` en `lib/validators/movement.ts`: `query` de 2 a 100 caracteres tras recortar, `movement_type` INCOME o EXPENSE.
- Server action `suggestDeliveredBy(query, movementType)` en `app/actions/movements.ts`: exige sesión y `CREATE_MOVEMENT`, valida con Zod (consulta corta o inválida devuelve `[]`) y llama al servicio con el cliente de servidor. Devuelve `{ name: string; count: number }[]`. No hay migración ni uso del cliente admin.

**UI**
- Nuevo `components/movements/delivered-by-autocomplete.tsx` (cliente), basado en `components/ui/autocomplete.tsx` como en `components/intentions/new-request-dialog.tsx`. Props: `value`, `onChange`, `movementType`, `className`.
- Espera de 250 ms, descarte de respuestas viejas (mismo criterio que el buscador global), máximo 8 sugerencias, cada una con su cantidad ("12 veces").
- `components/movements/movement-form-fields.tsx`: el campo `delivered_by` pasa de `register` a un `Controller` que usa el componente, con el `movement_type` del formulario. Se conservan etiqueta, `placeholder="Opcional"` y alturas actuales (`h-12 sm:h-14`).
- Si la acción falla, el campo sigue funcionando como texto libre, sin mostrar error.

**Pruebas**
- Jest sobre `name-suggestions.ts`: agrupa variantes de mayúsculas, tildes y espacios; muestra la grafía más usada; ordena por frecuencia; respeta el límite; descarta vacíos.
- Jest sobre el servicio: filtra por tipo y por activos, excluye nulos, aplica el límite de 200 y agrupa.
- Jest sobre la acción: sin sesión, sin permiso, consulta corta y llamada correcta.
- Prueba de componente: espera, elegir una sugerencia rellena el valor, escribir uno nuevo se conserva, respuesta vieja descartada y fallo de la acción sin romper el campo.

## Decisiones mías (revisar)

- Mínimo 2 caracteres, hasta 8 sugerencias, espera de 250 ms, ventana de 200 movimientos recientes.
- Permiso `CREATE_MOVEMENT` (quien ve el formulario). Si el formulario de edición lo usa otro permiso, se ajusta al construir.
- Rama nueva desde el `main` local (que ya incluye el buscador global), porque este trabajo toca `app/actions/movements.ts` y `movement-form-fields.tsx`, que el buscador también modificó.

## Queda para quien construya

Detalles visuales finos, nombres exactos de archivos y la forma de pasar el `movement_type` al componente desde el estado del formulario.
