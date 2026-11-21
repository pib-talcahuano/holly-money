# Destacar movimientos registrados tarde

Fecha: 2026-11-21. Estado: borrador para aprobación. Origen: lista de mejoras de la usuaria ("destacar movimientos registrados de momentos muy viejos, ejemplo hermana Mabel"). Umbral confirmado: 30 días.

## Intención

Un movimiento puede registrarse mucho después de su fecha (por ejemplo, un diezmo antiguo que se ingresa semanas o meses más tarde). Hoy no hay forma de notarlo: solo se ve `movement_date`. Marcarlo ayuda a revisar y a explicar por qué los totales de un mes cambiaron después de cerrarlo.

## Metas

- Una marca visible "Registrado tarde" en los movimientos cuya fecha es más de 30 días anterior al día en que se registraron.
- La marca se ve en la lista de `/movements` (escritorio y móvil), en el panel de detalle y en la página `/movements/[id]`.
- La regla vive en una sola función pura, probada, que usan todos los lugares.

## No metas y anti-metas

- No hay migración ni columna nueva: se calcula con `movement_date` y `created_at`, que ya existen.
- No cambia filtros, orden ni totales, y no bloquea ni avisa al crear el movimiento.
- Sin filtro "solo tardíos" ni configuración del umbral en la interfaz (30 días fijos en una constante).
- Anti-meta: que un movimiento de las 23:30 cambie de día por usar UTC en la comparación.

## Enfoques considerados

- **A. Calcular en el cliente al renderizar con una función pura. Elegido.** Sin base de datos ni servicio, un solo lugar para la regla.
- **B. Columna calculada o vista en SQL.** Descartada: exige migración y tipos nuevos por una regla de presentación.
- **C. Calcular en el servicio y devolver un campo `late_days` en cada fila.** Descartada: toca consultas y tipos sin necesidad, las filas ya traen ambas fechas.

## Diseño

**Función pura** `lib/utils/late-registration.ts`
- `LATE_REGISTRATION_DAYS = 30`.
- `getLateRegistrationDays(movementDate: string, createdAt: string): number | null`. `movementDate` es `YYYY-MM-DD`; `createdAt` es una marca de tiempo ISO. Convierte `createdAt` al día calendario en la zona `America/Santiago` (`Intl.DateTimeFormat` con `en-CA`), calcula la diferencia en días con esa fecha y `movementDate` (ambas como fechas sin hora, en UTC para no desplazar el cálculo) y devuelve los días si son **más de 30**, o `null` en caso contrario (incluye fechas futuras o iguales).
- Entradas inválidas devuelven `null`, no lanzan.

**Interfaz**
- Nuevo componente pequeño `LateRegistrationBadge({ days })` en `components/movements/` (insignia ámbar con el texto "Registrado tarde · 45 d" y un `title` con la explicación "Registrado 45 días después de la fecha del movimiento"). Debe cumplir contraste de texto 4.5:1 y no depender solo del color: lleva texto.
- `components/movements/movements-table.tsx`:
  - Tabla de escritorio: en la celda de fecha, debajo de la fecha, una línea con la insignia en tamaño compacto (la columna de fecha es angosta: no se ensancha, la insignia va en una segunda línea y solo en las filas tardías).
  - Lista móvil: la insignia al final de `ItemDescription`.
  - Panel de detalle: un `Field` nuevo "Registro" con la fecha de registro (`formatDateTime(created_at)`) y la insignia, solo si es tardío.
- `app/(dashboard)/movements/[id]/page.tsx`: junto a "Fecha del movimiento", la insignia cuando corresponde (la página ya tiene `created_at`).

**Pruebas**
- Jest sobre la función pura:
  - exactamente 30 días → `null`; 31 días → `31`;
  - mismo día y fecha futura → `null`;
  - borde de zona horaria: `createdAt` a las `2026-12-01T02:30:00Z` (23:30 del 30 de noviembre en Santiago) con `movementDate` `2026-10-31` → 30 días → `null`, no 31;
  - entradas inválidas → `null`.
- Prueba de componente de la insignia y de la tabla: una fila con registro tardío muestra "Registrado tarde"; una con registro a tiempo no.

## Decisiones mías (revisar)

- "Más de 30 días" significa estrictamente mayor que 30 (30 exactos no se marca).
- Zona horaria `America/Santiago` para decidir el día de registro.
- Se marcan todos los movimientos por igual, incluidos los generados por remuneraciones y los anulados. Si resulta ruidoso, se excluyen en una pasada posterior.
- Rama nueva desde `main` local, independiente de las sugerencias de nombre.

## Queda para quien construya

Tono exacto del ámbar según los tokens existentes (`Badge` ya tiene variantes), nombres de archivos y la forma exacta de la segunda línea en la celda de fecha.
