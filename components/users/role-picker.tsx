"use client"

import { ROLE_LABEL, USER_ROLES } from "@/lib/constants/roles"
import { cn } from "@/lib/utils"
import type { UserRole } from "@/types/auth"

type RolePickerProps = {
  id?: string
  value: UserRole[]
  onChange: (roles: UserRole[]) => void
  options: { role: UserRole; description: string }[]
  invalid?: boolean
}

// Multi-select of a user's roles. ADMIN is exclusive (mirrors the users_roles_admin_exclusive
// DB constraint and the Zod schema): picking it clears the rest, picking anything else clears it.
export function RolePicker({ id, value, onChange, options, invalid }: RolePickerProps) {
  function toggle(role: UserRole) {
    if (value.includes(role)) {
      onChange(value.filter((r) => r !== role))
    } else if (role === USER_ROLES.ADMIN) {
      onChange([USER_ROLES.ADMIN])
    } else {
      onChange([...value.filter((r) => r !== USER_ROLES.ADMIN), role])
    }
  }

  return (
    <div
      id={id}
      role="group"
      className={cn("flex flex-col gap-1.5", invalid && "rounded-lg ring-1 ring-destructive/50")}
    >
      {options.map(({ role, description }) => {
        const checked = value.includes(role)
        return (
          <label
            key={role}
            className={cn(
              "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 text-left transition-colors hover:bg-muted/50",
              checked && "border-primary/40 bg-primary/5"
            )}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(role)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-bold">{ROLE_LABEL[role]}</span>
              <span className="block text-[12px] text-muted-foreground">{description}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}
