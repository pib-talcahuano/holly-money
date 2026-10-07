"use client"

import { USER_ROLES, ROLE_LABEL } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"

const OPTIONS: { role: UserRole; hint: string }[] = [
  { role: USER_ROLES.ADMIN, hint: "Acceso total (no se combina)" },
  { role: USER_ROLES.BURSAR, hint: "Ingreso y aprobación" },
  { role: USER_ROLES.FINANCE, hint: "Gestión contable" },
  { role: USER_ROLES.MINISTER, hint: "Solicitudes de fondos" }
]

// ADMIN is exclusive (mirrors users_roles_valid): checking it clears the rest, and checking
// any other role clears it.
export function toggleRole(current: UserRole[], role: UserRole): UserRole[] {
  if (current.includes(role)) return current.filter((r) => r !== role)
  if (role === USER_ROLES.ADMIN) return [USER_ROLES.ADMIN]
  return [...current.filter((r) => r !== USER_ROLES.ADMIN), role]
}

export function RoleMultiSelect({
  id,
  value,
  onChange,
  disabled
}: {
  id: string
  value: UserRole[]
  onChange: (roles: UserRole[]) => void
  disabled?: boolean
}) {
  return (
    <div id={id} role="group" aria-label="Roles" className="grid gap-2">
      {OPTIONS.map(({ role, hint }) => (
        <label
          key={role}
          className="flex cursor-pointer items-center gap-2.5 rounded-[10px] border border-border px-3 py-2 text-[13px] has-[:checked]:border-primary has-[:checked]:bg-primary/5"
        >
          <input
            type="checkbox"
            className="size-4"
            checked={value.includes(role)}
            disabled={disabled}
            onChange={() => onChange(toggleRole(value, role))}
          />
          <span className="font-bold">{ROLE_LABEL[role]}</span>
          <span className="text-muted-foreground">— {hint}</span>
        </label>
      ))}
    </div>
  )
}
