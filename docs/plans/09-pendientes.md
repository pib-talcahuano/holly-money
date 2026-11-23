# Backlog — Pendientes post-roadmap

## Contexto

El roadmap original de 8 etapas (ver [`00-roadmap.md`](./00-roadmap.md)) está completo y mergeado. Este documento junta los pendientes que fueron surgiendo después, recogidos de sesiones de feedback con el cliente, para no perderlos entre conversaciones. No es un plan de implementación etapa por etapa como el roadmap — es una lista de trabajo priorizable.

Cada ítem indica su estado actual. Solo se listan ítems abiertos — lo resuelto vive en el historial de git/PRs, no acá.

## Pendientes

### Ministerios
- **Ítems/categorías por ministerio, con escritura libre como fallback.** Hoy los movimientos usan el catálogo global de categorías (Etapa 2). El cliente quiere poder definir ítems propios por ministerio (ejemplo dado: "Pastoral") y, cuando el ministerio no tiene ítems propios definidos, permitir texto libre. Sin diseñar aún — falta decidir si esto vive como una extensión de `movement_categories`/`movement_subcategories` scopeada por ministerio, o como un catálogo aparte.

### Reportes
- **Informe mensual.** Resumen del mes: ingresos, egresos, cantidad de diezmadores y totales por categoría. Sin diseñar; falta decidir formato (pantalla imprimible o PDF) y a quién se envía.
- **Generación de informes / reportes de sesiones administrativas.** Sin alcance definido todavía — falta una conversación de descubrimiento con el cliente sobre qué debe contener un "reporte de sesión administrativa".

### Solicitudes y presupuestos
- **Alerta cuando una solicitud supera el restante del presupuesto del ministerio.** Hoy la aprobación no está acoplada al saldo del presupuesto (`budget_periods`/`ministry_budgets`). Sin diseñar: falta decidir si es un aviso informativo o un bloqueo, y a quién se muestra (tesorero al revisar, ministro al enviar).
- **Imprimir el presupuesto.** Vista imprimible del presupuesto por ministerio y período (`/budgets`). Sin diseñar.

### Movimientos
- **Revisar los tamaños del formulario de movimientos.** Revisión de diseño del formulario de nuevo movimiento (tamaños de campos y controles, móvil incluido). Sin alcance definido; conviene hacerla con capturas de `docs/screenshots/`.

## Cómo usar este documento

Cuando se tome un ítem para implementar, conviene moverlo a su propio documento de plan (estilo `01`-`08`) si el alcance lo amerita, y dejar aquí solo una línea de referencia — igual que hace el índice del roadmap.
