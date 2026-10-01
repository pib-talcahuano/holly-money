import type { UserRole } from "@/types/auth"

// Self-referential value constants: use these instead of raw "ADMIN"/"BURSAR"/... literals
// in comparisons, mirroring the PERMISSIONS pattern in lib/permissions/rbac.ts.
export const USER_ROLES: Record<UserRole, UserRole> = {
  ADMIN: "ADMIN",
  BURSAR: "BURSAR",
  FINANCE: "FINANCE",
  MINISTER: "MINISTER",
  DELEGATE: "DELEGATE"
}

export const ROLE_ORDER: UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.BURSAR,
  USER_ROLES.FINANCE,
  USER_ROLES.MINISTER,
  USER_ROLES.DELEGATE
]

export const ROLE_LABEL: Record<UserRole, string> = {
  ADMIN: "Admin",
  BURSAR: "Tesorero",
  FINANCE: "Finanzas",
  MINISTER: "Ministro",
  DELEGATE: "Delegado"
}

export function roleLabel(role: string): string {
  return ROLE_LABEL[role as UserRole] ?? role
}

// A user can hold several roles (e.g. MINISTER + BURSAR). Authorization is permission-based and
// uses the union of every role's permissions; these helpers are for the places that genuinely
// need a role identity (sidebar visibility, who is assignable as a minister, ADMIN-only flows).
export function hasRole(roles: readonly string[] | undefined, role: UserRole): boolean {
  return roles?.includes(role) ?? false
}

export function hasAnyRole(roles: readonly string[] | undefined, wanted: readonly UserRole[]) {
  return wanted.some((role) => hasRole(roles, role))
}

export function rolesLabel(roles: readonly string[]): string {
  return roles.map(roleLabel).join(" + ")
}

// Roles in privilege order, de-duplicated; the first is the user's primary role.
export function sortRoles(roles: readonly UserRole[]): UserRole[] {
  return ROLE_ORDER.filter((role) => roles.includes(role))
}

export type RoleBadgeVariant = "primary" | "role" | "income" | "warn" | "neutral"

export const ROLE_BADGE_VARIANT: Record<UserRole, RoleBadgeVariant> = {
  ADMIN: "primary",
  BURSAR: "role",
  FINANCE: "income",
  MINISTER: "warn",
  DELEGATE: "neutral"
}

export const ROLE_DOT_CLASS: Record<UserRole, string> = {
  ADMIN: "bg-primary",
  BURSAR: "bg-role-purple",
  FINANCE: "bg-income",
  MINISTER: "bg-warn",
  DELEGATE: "bg-muted-foreground"
}
