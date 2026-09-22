export const PERMISSIONS = {
  MANAGE_USERS: "MANAGE_USERS",
  CREATE_MOVEMENT: "CREATE_MOVEMENT",
  VIEW_MOVEMENT: "VIEW_MOVEMENT",
  MANAGE_MINISTRIES: "MANAGE_MINISTRIES",
  REVIEW_INTENTIONS: "REVIEW_INTENTIONS",
  CREATE_REQUEST: "CREATE_REQUEST",
  CREATE_SETTLEMENT: "CREATE_SETTLEMENT",
  MANAGE_SETTINGS: "MANAGE_SETTINGS",
  VIEW_WORKFLOW: "VIEW_WORKFLOW",
  MANAGE_CATEGORIES: "MANAGE_CATEGORIES",
  MANAGE_PAYROLL: "MANAGE_PAYROLL",
  VIEW_DASHBOARD: "VIEW_DASHBOARD",
  MANAGE_BUDGETS: "MANAGE_BUDGETS"
} as const

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export function can(permissions: Set<string> | undefined, permission: Permission): boolean {
  return permissions?.has(permission) ?? false
}

// MANAGE_USERS is deliberately blocked while impersonating, even if the impersonated
// user's role nominally grants it — otherwise impersonation could be used to modify
// users/roles/permissions, escalating beyond the real admin's intent for the session.
export function isImpersonating(
  user: { impersonatorId?: string | null } | null | undefined
): boolean {
  return !!user?.impersonatorId
}

export function canAccessWorkflow(permissions: Set<string> | undefined): boolean {
  return (
    can(permissions, PERMISSIONS.VIEW_WORKFLOW) ||
    can(permissions, PERMISSIONS.CREATE_REQUEST) ||
    can(permissions, PERMISSIONS.CREATE_SETTLEMENT) ||
    can(permissions, PERMISSIONS.REVIEW_INTENTIONS)
  )
}

// A minister-owned request/settlement view (own-ministry scoping, detail page
// access) applies to anyone who can create either side of the workflow.
export function isMinisterWorkflowUser(permissions: Set<string> | undefined): boolean {
  return (
    can(permissions, PERMISSIONS.CREATE_REQUEST) || can(permissions, PERMISSIONS.CREATE_SETTLEMENT)
  )
}
