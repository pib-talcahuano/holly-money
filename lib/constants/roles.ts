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

// Roles that can't be combined with any other (also enforced by users_roles_valid in the DB).
export const EXCLUSIVE_ROLES: UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.DELEGATE]

type WithRoles = { roles: readonly UserRole[] } | null | undefined

// The only way TS code asks "does this user have role X?" — a user can hold several roles.
export function hasRole(user: WithRoles, role: UserRole): boolean {
  return user?.roles.includes(role) ?? false
}

export function hasAnyRole(user: WithRoles, roles: readonly UserRole[]): boolean {
  return roles.some((role) => hasRole(user, role))
}

export function rolesLabel(roles: readonly string[]): string {
  return roles.map(roleLabel).join(" · ")
}

// Stable, de-duplicated order so audit diffs and list badges don't flicker.
export function normalizeRoles(roles: readonly UserRole[]): UserRole[] {
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
