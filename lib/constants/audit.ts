// Spanish labels for system_audit_log / movement_audit_log entity + action values.
// entity/action are deliberately free TEXT in the DB (no enum), so this mapping is
// application-layer only — see supabase/migrations/20260716172924_payroll_and_severance_reserve.sql.
//
// Some actions (services/movements/movements.service.ts, movement-attachments.service.ts,
// google/movement-postprocess.ts, users/users.service.ts) are already written as literal
// Spanish sentences at the call site (e.g. "Movimiento creado", "Usuario invitado") — those
// are intentionally NOT keyed here and pass through auditActionLabel()'s fallback unchanged.

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  MINISTRY: "Ministerio",
  MINISTRY_ASSIGNMENT: "Asignación de Ministro",
  BUDGET_INTENTION: "Solicitud",
  INTENTION_TRANSFER: "Transferencia de Solicitud",
  EXPENSE_SETTLEMENT: "Rendición de Gastos",
  PAYMENT_METHOD: "Medio de Pago",
  MOVEMENT_CATEGORY: "Categoría de Movimiento",
  MOVEMENT_SUBCATEGORY: "Subcategoría de Movimiento",
  SEVERANCE_RESERVE: "Reserva de Indemnización",
  INBOUND_EMAIL_ROUTE: "Correo Entrante",
  APP_SETTINGS: "Configuración del Sistema",
  PAYROLL_RECORD: "Remuneración",
  USERS: "Usuario",
  PEOPLE: "Personas"
}

export function auditEntityLabel(entity: string): string {
  return AUDIT_ENTITY_LABEL[entity.toUpperCase()] ?? entity
}

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  // Personas (unión de nombres)
  PEOPLE_MERGE_STARTED: "Unión de nombres iniciada",
  PEOPLE_MERGED: "Nombres unidos",

  // Ministerios
  MINISTRY_CREATED: "Ministerio creado",
  MINISTRY_UPDATED: "Ministerio actualizado",
  MINISTER_ASSIGNED: "Ministro asignado",
  MINISTER_UNASSIGNED: "Ministro desasignado",

  // Solicitudes (budget_intentions)
  INTENTION_CREATED: "Solicitud creada",
  INTENTION_SUBMITTED: "Solicitud enviada",
  INTENTION_CANCELLED: "Solicitud cancelada",
  INTENTION_APPROVED: "Solicitud aprobada",
  INTENTION_REJECTED: "Solicitud rechazada",
  INTENTION_SETTLEMENT_CLOSED: "Solicitud cerrada por rendición",
  TRANSFER_REGISTERED: "Transferencia registrada",

  // Rendiciones (expense_settlements)
  SETTLEMENT_CREATED: "Rendición creada",
  SETTLEMENT_SUBMITTED: "Rendición enviada a revisión",
  SETTLEMENT_IN_REVIEW: "Rendición en revisión",
  SETTLEMENT_CANCELLED: "Rendición cancelada",
  SETTLEMENT_RETURNED_FOR_CORRECTION: "Rendición devuelta para corrección",
  SETTLEMENT_APPROVED: "Rendición aprobada",
  SETTLEMENT_REJECTED: "Rendición rechazada",
  SETTLEMENT_ATTACHMENT_REMOVED: "Adjunto de rendición eliminado",

  // Medios de pago
  PAYMENT_METHOD_CREATED: "Medio de pago creado",
  PAYMENT_METHOD_UPDATED: "Medio de pago actualizado",

  // Categorías
  MOVEMENT_CATEGORY_CREATED: "Categoría creada",
  MOVEMENT_CATEGORY_UPDATED: "Categoría actualizada",
  MOVEMENT_SUBCATEGORY_CREATED: "Subcategoría creada",
  MOVEMENT_SUBCATEGORY_UPDATED: "Subcategoría actualizada",

  // Reserva de indemnización
  SEVERANCE_RESERVE_ADJUSTED: "Reserva de indemnización ajustada",

  // Correo entrante
  ROUTE_CREATED: "Ruta de correo creada",
  ROUTE_DELETED: "Ruta de correo eliminada",
  MAILBOX_GROUP_RENAMED: "Grupo de correo renombrado",
  MAILBOX_GROUP_DELETED: "Grupo de correo eliminado",

  // Configuración
  SETTINGS_UPDATED: "Configuración actualizada",

  // Remuneraciones
  PAYROLL_REGISTERED: "Remuneración registrada",

  // movement_audit_log (rendered on /movements/[id], shares this same lookup)
  MOVEMENT_CREATED_FROM_TRANSFER: "Movimiento creado desde transferencia",
  MOVEMENT_CREATED_FROM_SETTLEMENT: "Movimiento creado desde rendición",
  MOVEMENT_CREATED_FROM_PAYROLL: "Movimiento creado desde remuneración",

  // Suplantación de usuario (impersonation)
  IMPERSONATION_STARTED: "Sesión de suplantación iniciada",
  IMPERSONATION_ENDED: "Sesión de suplantación finalizada"
}

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action
}

// Short verb-only labels for the audit table's action badge (design spec shows
// a compact pill — CREAR / APROBAR / EDITAR / ANULAR — not the full descriptive
// sentence; the entity column next to it already carries the "what"). Keyed by
// both the enum-style action values above and the literal Spanish sentences a
// few services write directly as `action` (movements/users services — see the
// file header comment), since both end up in the same audit log column.
const AUDIT_ACTION_SHORT_LABEL: Record<string, string> = {
  MINISTRY_CREATED: "Crear",
  MINISTRY_UPDATED: "Editar",
  MINISTER_ASSIGNED: "Asignar",
  MINISTER_UNASSIGNED: "Desasignar",

  INTENTION_CREATED: "Crear",
  INTENTION_SUBMITTED: "Enviar",
  INTENTION_CANCELLED: "Cancelar",
  INTENTION_APPROVED: "Aprobar",
  INTENTION_REJECTED: "Rechazar",
  INTENTION_SETTLEMENT_CLOSED: "Cerrar",
  TRANSFER_REGISTERED: "Registrar",

  SETTLEMENT_CREATED: "Crear",
  SETTLEMENT_SUBMITTED: "Enviar",
  SETTLEMENT_IN_REVIEW: "Revisar",
  SETTLEMENT_CANCELLED: "Cancelar",
  SETTLEMENT_RETURNED_FOR_CORRECTION: "Devolver",
  SETTLEMENT_APPROVED: "Aprobar",
  SETTLEMENT_REJECTED: "Rechazar",
  SETTLEMENT_ATTACHMENT_REMOVED: "Eliminar",

  PAYMENT_METHOD_CREATED: "Crear",
  PAYMENT_METHOD_UPDATED: "Editar",

  MOVEMENT_CATEGORY_CREATED: "Crear",
  MOVEMENT_CATEGORY_UPDATED: "Editar",
  MOVEMENT_SUBCATEGORY_CREATED: "Crear",
  MOVEMENT_SUBCATEGORY_UPDATED: "Editar",

  SEVERANCE_RESERVE_ADJUSTED: "Ajustar",

  ROUTE_CREATED: "Crear",
  ROUTE_DELETED: "Eliminar",
  MAILBOX_GROUP_RENAMED: "Renombrar",
  MAILBOX_GROUP_DELETED: "Eliminar",

  SETTINGS_UPDATED: "Editar",

  PAYROLL_REGISTERED: "Registrar",

  MOVEMENT_CREATED_FROM_TRANSFER: "Crear",
  MOVEMENT_CREATED_FROM_SETTLEMENT: "Crear",
  MOVEMENT_CREATED_FROM_PAYROLL: "Crear",

  IMPERSONATION_STARTED: "Iniciar",
  IMPERSONATION_ENDED: "Finalizar",

  // Literal sentence actions (movements/users services write these directly)
  "Movimiento creado": "Crear",
  "Movimiento editado": "Editar",
  "Movimiento anulado": "Anular",
  "Adjunto agregado": "Agregar",
  "Adjunto eliminado": "Eliminar",
  "Usuario invitado": "Invitar",
  "Cuenta reseteada": "Resetear",
  "Usuario eliminado": "Eliminar",
  "Invitación reenviada": "Reenviar",
  "Usuario actualizado": "Editar"
}

export function auditActionShortLabel(action: string): string {
  return AUDIT_ACTION_SHORT_LABEL[action] ?? auditActionLabel(action)
}

// Color-codes the (much richer) action vocabulary above onto the design spec's
// four action colors: crear=income, aprobar/cerrar=primary, editar/ajustar=warn,
// anular/rechazar/eliminar=expense. Checked in this order since a few actions
// (e.g. RETURNED_FOR_CORRECTION) would otherwise also match a broader pattern.
export type AuditActionVariant = "income" | "primary" | "warn" | "expense" | "neutral"

const ACTION_VARIANT_RULES: Array<{ pattern: RegExp; variant: AuditActionVariant }> = [
  { pattern: /(REJECTED|CANCELLED|DELETED|REMOVED|UNASSIGNED|RETURNED)/, variant: "expense" },
  { pattern: /(APPROVED|TRANSFER_REGISTERED|SETTLEMENT_CLOSED|CLOSED)/, variant: "primary" },
  { pattern: /(UPDATED|ADJUSTED|RENAMED|IN_REVIEW)/, variant: "warn" },
  { pattern: /(CREATED|REGISTERED|ASSIGNED|SUBMITTED|STARTED)/, variant: "income" }
]

export function auditActionVariant(action: string): AuditActionVariant {
  return ACTION_VARIANT_RULES.find((rule) => rule.pattern.test(action))?.variant ?? "neutral"
}
