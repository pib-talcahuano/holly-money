"use client"

import { Check, Lock } from "lucide-react"
import { USER_ROLES, ROLE_LABEL, EXCLUSIVE_ROLES } from "@/lib/constants/roles"
import { cn } from "@/lib/utils"
import { ROLE_META } from "@/components/users/role-meta"
import type { UserRole } from "@/types/auth"

const PICKABLE: UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.BURSAR,
  USER_ROLES.FINANCE,
  USER_ROLES.MINISTER
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
  const adminPicked = value.includes(USER_ROLES.ADMIN)
  return (
    <div id={id} role="group" aria-label="Roles" className="grid gap-1.5">
      {PICKABLE.map((role) => {
        const { icon: Icon, description, tileClass } = ROLE_META[role]
        const checked = value.includes(role)
        return (
          <label
            key={role}
            className={cn(
              "flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5 transition-[background,border-color,opacity] has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              checked && "border-primary bg-primary-soft",
              adminPicked && !checked && "opacity-55",
              disabled && "cursor-not-allowed opacity-60"
            )}
          >
            <input
              type="checkbox"
              className="peer sr-only"
              checked={checked}
              disabled={disabled}
              onChange={() => onChange(toggleRole(value, role))}
            />
            <span
              aria-hidden
              className={cn(
                "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] border-input bg-card text-white",
                checked && "border-primary bg-primary"
              )}
            >
              {checked && <Check className="size-3" strokeWidth={3} />}
            </span>
            <span
              aria-hidden
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-[9px]",
                tileClass
              )}
            >
              <Icon className="size-[15px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-bold text-foreground">
                {ROLE_LABEL[role]}
              </span>
              <span className="block text-xs leading-snug text-muted-foreground">
                {description}
              </span>
            </span>
            {EXCLUSIVE_ROLES.includes(role) && (
              <span className="shrink-0 rounded-full border border-border bg-muted px-2 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                Exclusivo
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

// Delegado is assigned from the ministries flow and its roles can't be edited here.
export function LockedDelegateRole() {
  const { icon: Icon, description, tileClass } = ROLE_META[USER_ROLES.DELEGATE]
  return (
    <div
      aria-disabled="true"
      className="flex items-center gap-3 rounded-xl border border-border bg-muted/50 px-3 py-2.5"
    >
      <span
        aria-hidden
        className="flex size-[18px] shrink-0 items-center justify-center text-muted-foreground"
      >
        <Lock className="size-3.5" />
      </span>
      <span
        aria-hidden
        className={cn("flex size-8 shrink-0 items-center justify-center rounded-[9px]", tileClass)}
      >
        <Icon className="size-[15px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-bold text-foreground">
          {ROLE_LABEL[USER_ROLES.DELEGATE]}
        </span>
        <span className="block text-xs leading-snug text-muted-foreground">
          {description}. Se asigna desde Ministerios
        </span>
      </span>
    </div>
  )
}
