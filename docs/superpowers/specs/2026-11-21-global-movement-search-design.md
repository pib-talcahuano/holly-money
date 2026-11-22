# Buscador global de movimientos

Fecha: 2026-11-21. Estado: borrador para aprobación. Origen: lista de mejoras de la usuaria (punto "buscador global de movimientos en el dashboard"), ampliado a "disponible en todos los lugares".

## Intención

Encontrar un movimiento desde cualquier pantalla sin pasar antes por `/movements`. Lo que más se busca son movimientos antiguos o de una persona concreta (ejemplo: la hermana Mabel). Hoy el filtro de `/movements` solo mira `delivered_by`.

## Metas

- Un botón de búsqueda en el header, con atajo `⌘/Ctrl+K`, presente en todas las páginas de `(dashboard)`.
- Resultados con el componente `command` de shadcn, agrupados como en su documentación.
- Buscar en `delivered_by`, notas, categoría, subcategoría y monto.
- La misma búsqueda ampliada alimenta el filtro de `/movements`.

## No metas y anti-metas

- Solo movimientos. No busca solicitudes, ministerios, usuarios ni páginas (queda como extensión futura).
- No resuelve la identidad de personas ("Mabel" vs "Mabel Pérez"): sigue siendo texto libre hasta que exista el modelo de diezmadores.
- Anti-meta: que un rol vea movimientos que hoy no puede ver, o que el buscador filtre en el navegador solo lo cargado.

## Enfoques considerados

- **A. Búsqueda en el servidor mientras se escribe. Elegido.** Escala con los años y respeta RLS y `VIEW_MOVEMENT`. Cuesta una consulta por búsqueda.
- **B. Cargar recientes y filtrar con `cmdk` en el navegador.** Descartado: no encuentra lo antiguo.
- **C. Mezclar navegación con movimientos.** Aplazado: es una extensión de A, no entra en la primera versión.

## Diseño

**UI**
- Se instala `command` con `pnpm shadcn add command`. Agrega la dependencia `cmdk`; `dialog` e `input-group` ya existen.
- Nuevo `components/dashboard/global-search.tsx` (client), montado en `SiteHeader` solo si el usuario tiene `VIEW_MOVEMENT` (usar `useUser`/permisos del `UserProvider`).
- `CommandDialog` con `shouldFilter={false}`. Entrada con espera de ~250 ms, mínimo 2 caracteres, y se descarta la respuesta de una búsqueda vieja si llegó otra después.
- Grupos "Ingresos" y "Egresos". Cada fila: categoría · entregado por/a · monto · fecha. Los anulados se muestran atenuados con la etiqueta "Anulado".
- Estados: cargando, sin resultados, error. Pie con "Ver todos los resultados" que lleva a `/movements?search=…`.
- Al elegir una fila se navega a `/movements/[id]` y se cierra el diálogo.

**Servidor**
- Server action `searchMovements(query)` en `app/actions/movements.ts` (o archivo propio). Verifica sesión y `can(permissions, PERMISSIONS.VIEW_MOVEMENT)`, valida con Zod en `lib/validators/movement.ts`, y llama al servicio. No usa el cliente de Supabase directamente.
- `movementsService.list` amplía `search`: `delivered_by`, `notes`, y los ids de categorías y subcategorías cuyo nombre coincide (consulta previa a `movement_categories`/`movement_subcategories` y `.or(... category_id.in.(...))`). Si el texto es numérico, también compara `amount`. Siempre pasa por `sanitizePostgrestSearch`.
- El buscador pide 20 resultados con el cliente de servidor (RLS aplica). `/movements` usa la misma función con su paginación actual.
- No hay migración ni uso del cliente admin.

**Pruebas**
- Jest sobre el servicio: coincidencia por cada campo, escapado de caracteres especiales, texto sin resultados y filtros combinados.
- Jest sobre la acción: sin sesión, sin permiso, query corta.
- Prueba de componente: espera, estado vacío y navegación.

## Decisiones mías (revisar)

- Mínimo 2 caracteres, 20 resultados y espera de 250 ms.
- Monto solo si el texto es numérico (coincidencia exacta, ignorando puntos de miles).
- Rama nueva desde `origin/main`, no sobre `feat/budget-subitems`, porque es independiente del presupuesto.

## Queda para quien construya

Detalles visuales finos, la forma exacta de la consulta por categoría y el nombre de los archivos.
