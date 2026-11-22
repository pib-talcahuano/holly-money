# Lista de diezmadores

Fecha: 2026-11-22. Estado: borrador para aprobación. Origen: lista de mejoras de la usuaria ("Diezmadores, listar y poder ver los diezmos de una persona"). Decisión de la usuaria: diezmadores inferidos de los movimientos de la categoría Diezmos, y "algo sencillo para verlos". Mockup en el canvas "Holly Money: buscador global", artboard "Diezmadores".

## Intención

Saber quiénes dan diezmo y cuánto, sin recorrer movimiento por movimiento. No hay tabla de personas: un diezmador es el valor de `delivered_by` en los movimientos activos de ingreso de la categoría "Diezmos", agrupando variantes de mayúsculas, tildes y espacios con el mismo criterio de las sugerencias de nombre.

## Metas

- Una página `/tithers` ("Diezmadores" en la interfaz) con la lista: nombre, cantidad de diezmos, total, fecha del último diezmo.
- Resumen arriba: total de diezmos, cantidad de diezmadores y cantidad de diezmos del período.
- Selector de año, con el año actual por defecto.
- **Tendencia por mes en la lista:** cada fila muestra una mini línea de los 12 meses del año (la suma de diezmos de cada mes).
- **Gráfico al hacer clic en un nombre:** abre un diálogo con un gráfico de barras de los diezmos de esa persona mes a mes, el detalle mensual (cantidad y monto) y el enlace a sus movimientos (`/movements?search=<nombre>&movement_type=INCOME`), que ya muestra sus totales.
- Un campo para filtrar la lista por nombre.

## No metas y anti-metas

- No hay página de detalle por persona (el detalle es un diálogo), ni exportación, ni comparación entre años, ni tabla de personas o alias. Eso queda para una segunda etapa si hace falta.
- No se modifican movimientos ni se unen variantes de un mismo nombre más allá de la normalización existente.
- No hay permiso nuevo ni migración.
- Anti-meta: que un diezmo sin nombre desaparezca de los totales (se muestra como "Sin nombre").

## Enfoques considerados

- **A. Servicio que trae las filas del año y las agrupa en TypeScript. Elegido.** Sencillo, sin migración, reutiliza `normalizeName`. Como PostgREST devuelve como máximo 1000 filas por petición, el servicio pagina con `range` hasta terminar. Un año de diezmos son del orden de miles de filas, así que son pocas peticiones.
- **B. Función SQL que agrupa.** Más rápida, pero exige migración y duplicar en SQL la normalización de nombres. Queda como mejora si el volumen lo pide.
- **C. Página de detalle por persona (`/tithers/[nombre]`).** Descartada: un diálogo sobre la misma lista cubre la tendencia sin una ruta nueva, y el enlace a `/movements` ya da el listado completo de movimientos de la persona.
- **Tendencia en la lista:** un `<svg>` pequeño propio por fila (sin librería) y Recharts solo en el diálogo, cargado bajo demanda como los gráficos del dashboard, para no sumar ~110 KB a la página.

## Diseño

**Decisiones mías (revisar)**
- Período: **año calendario**, con selector. Es el criterio habitual para certificados y resúmenes de donaciones. Si prefieren el año de la iglesia (marzo a febrero), es cambiar el rango de fechas.
- Quién la ve: quien tiene `VIEW_MOVEMENT` (ADMIN, BURSAR y FINANCE por defecto), el mismo permiso con que ya se ven los diezmos en `/movements`. En la barra lateral, un enlace "Diezmadores" dentro de "Finanzas" con los mismos roles que "Movimientos".
- La categoría se identifica por el nombre "Diezmos" entre las categorías de ingreso (constante `TITHES_CATEGORY_NAME`). Si no existe, la página muestra un aviso en vez de fallar.

**Lógica pura** `lib/utils/tithers.ts`
- `groupTithers(rows: { delivered_by: string | null; amount: number; movement_date: string }[]): Tither[]`, con `Tither = { name: string; count: number; total: number; lastDate: string; monthlyTotals: number[]; monthlyCounts: number[] }` (los dos arreglos tienen 12 posiciones, índice 0 = enero, calculadas con el mes de `movement_date` tal como está guardado, sin conversión de zona). Agrupa por `normalizeName`; el nombre mostrado es la grafía más usada (en empate, la del movimiento más reciente); las filas sin nombre (nulo o vacío) forman un solo grupo "Sin nombre" que va siempre al final; el resto va ordenado por total descendente y, en empate, por nombre.
- `titherTotals(tithers: Tither[]): { total: number; count: number; titherCount: number }` (los diezmadores no cuentan el grupo "Sin nombre").

**Servicio** `services/tithers/tithers.service.ts`
- `tithersService.list(db, { year })` busca la categoría de ingreso "Diezmos"; si no existe devuelve `{ categoryFound: false, tithers: [], totals: ceros }`. Si existe, trae `delivered_by, amount, movement_date` de los movimientos `ACTIVE` de esa categoría con `movement_date` entre el 1 de enero y el 31 de diciembre del año, ordenados por fecha descendente, paginando con `range` de 1000 en 1000 hasta agotar; y agrupa con `groupTithers`.

**Página** `app/(dashboard)/tithers/page.tsx`
- Server component: exige `VIEW_MOVEMENT` (redirige a `/dashboard` si no), lee `?year=` (por defecto el año actual en `America/Santiago`; valores inválidos usan el año actual), llama al servicio y renderiza el componente.
- Encabezado "Diezmadores", selector de año (años del actual hacia atrás, 5 opciones) y tarjetas de resumen.

**Componente** `components/tithers/tithers-table.tsx` (cliente)
- Recibe `tithers`, `totals` y el año. Tabla con las columnas Nombre (un botón que abre el diálogo), Diezmos, Total (`formatCLP`), Tendencia (mini línea de los 12 meses, `aria-hidden` porque el diálogo da el detalle accesible), y Último diezmo (`formatDate`). Campo de filtro por nombre que ignora tildes y mayúsculas (usa `normalizeName`). Estado vacío: "No hay diezmos registrados en {año}." y, si la categoría no existe, "No se encontró la categoría Diezmos.". En móvil, filas en forma de tarjeta (nombre y total arriba, cantidad, último diezmo y mini línea abajo).
- Diálogo `TitherDetailDialog` (el `Dialog` existente): título con el nombre y el año, resumen (total, cantidad, último diezmo), gráfico de barras mensual (`TitherMonthlyChart`, Recharts con `ChartContainer`, cargado con `next/dynamic` como `components/dashboard/dashboard-charts-lazy.tsx`, con un marcador de altura fija mientras carga), una tabla de 12 filas accesible (mes, cantidad, monto) y el enlace "Ver movimientos" (sin enlace para "Sin nombre"). Los meses sin diezmos aparecen en cero.
- Un nombre del año sin movimientos en ningún mes no existe en la lista; un diezmador con un solo mes muestra una sola barra y una línea con un punto.

**Navegación**
- `components/dashboard/app-sidebar.tsx`: enlace "Diezmadores" (`/tithers`, ícono de personas) en "Finanzas" para ADMIN, BURSAR y FINANCE. `components/dashboard/site-header.tsx`: etiqueta "Diezmadores" para `/tithers` en el encabezado.

**Pruebas**
- Jest sobre `groupTithers` y `titherTotals`: variantes de grafía en un solo grupo, grafía más usada, orden, "Sin nombre" al final y fuera del conteo de diezmadores, montos decimales, lista vacía, y los arreglos mensuales (suma y cantidad por mes, 12 posiciones, meses sin datos en cero, un diezmo del 31 de diciembre y otro del 1 de enero van a meses distintos).
- Jest sobre el servicio (mock encadenable): categoría inexistente, paginación en varias páginas, rango de fechas del año, solo `ACTIVE`, agrupación y error de la base lanzado.
- Prueba de componente: filas con montos y fechas, filtro por nombre con tildes, estado vacío; al hacer clic en un nombre se abre el diálogo con su resumen, la tabla mensual de 12 filas (con los meses en cero) y el enlace codificado a `/movements`; "Sin nombre" abre el diálogo pero sin enlace. Recharts se simula en las pruebas (el gráfico se verifica en el navegador).
- Prueba de `getVisibleGroups` para el nuevo enlace por rol.

## Queda para quien construya

Ícono exacto, estilos de las tarjetas y de la tabla (siguiendo el artboard "Diezmadores" del canvas), nombres exactos de archivos y la forma de armar la lista de años.
