"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import type { Permission } from "@/lib/permissions/rbac"
import type { UserRole } from "@/types/auth"
import { updateRolePermission } from "@/app/actions/permissions"

// VIEW_WORKFLOW is intentionally excluded: access to the requests workflow is
// derived from CREATE_REQUEST/CREATE_SETTLEMENT/REVIEW_INTENTIONS (see
// canAccessWorkflow), so it's not an independently toggleable permission.
const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  MANAGE_USERS: "Gestionar usuarios",
  CREATE_MOVEMENT: "Crear y editar movimientos",
  VIEW_MOVEMENT: "Ver movimientos",
  VIEW_DASHBOARD: "Ver dashboard general",
  MANAGE_MINISTRIES: "Gestionar ministerios",
  REVIEW_INTENTIONS: "Revisar solicitudes de fondos",
  CREATE_REQUEST: "Crear solicitudes de fondos",
  CREATE_SETTLEMENT: "Crear rendiciones de gastos",
  MANAGE_SETTINGS: "Gestionar configuración del sistema"
}

const EDITABLE_PERMISSIONS = Object.keys(PERMISSION_LABELS) as Permission[]

const EDITABLE_ROLES: { role: Exclude<UserRole, "ADMIN">; label: string; dotClass: string }[] = [
  { role: "BURSAR", label: "Tesorero", dotClass: "bg-role-purple" },
  { role: "FINANCE", label: "Finanzas", dotClass: "bg-income" },
  { role: "MINISTER", label: "Ministro", dotClass: "bg-warn" },
  { role: "DELEGATE", label: "Delegado", dotClass: "bg-muted-foreground" }
]

type PermissionMatrix = Record<string, Record<string, boolean>>

export function PermissionsMatrix({ initialMatrix }: { initialMatrix: PermissionMatrix }) {
  const [matrix, setMatrix] = useState(initialMatrix)
  const [pending, setPending] = useState<string | null>(null)

  async function toggle(role: Exclude<UserRole, "ADMIN">, permission: Permission) {
    const key = `${role}:${permission}`
    const current = matrix[role]?.[permission] ?? false
    const next = !current

    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [permission]: next }
    }))
    setPending(key)

    try {
      await updateRolePermission(role, permission, next)
    } catch (e) {
      setMatrix((prev) => ({
        ...prev,
        [role]: { ...prev[role], [permission]: current }
      }))
      toast.error(e instanceof Error ? e.message : "Error al actualizar permiso")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-heading text-base font-medium">Permisos por Rol</h2>
        <p className="text-sm text-muted-foreground">
          Configura qué acciones puede realizar cada rol. Los permisos de Administrador son
          inmutables.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-3 px-4 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                Permiso
              </th>
              <th className="text-center py-3 px-4 font-bold text-[11px] uppercase tracking-wider text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-primary" />
                  Administrador
                </span>
              </th>
              {EDITABLE_ROLES.map(({ role, label, dotClass }) => (
                <th
                  key={role}
                  className="text-center py-3 px-4 font-bold text-[11px] uppercase tracking-wider text-muted-foreground"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <span className={`size-1.5 rounded-full ${dotClass}`} />
                    {label}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {EDITABLE_PERMISSIONS.map((permission) => (
              <tr key={permission} className="hover:bg-muted/30 transition-colors">
                <td className="py-3 px-4 font-medium text-foreground">
                  {PERMISSION_LABELS[permission]}
                </td>
                <td className="py-3 px-4">
                  <div className="flex justify-center">
                    <span
                      role="checkbox"
                      aria-checked
                      aria-label={`ADMIN — ${PERMISSION_LABELS[permission]}`}
                      className="flex size-[19px] items-center justify-center rounded-[6px] bg-muted text-muted-foreground"
                    >
                      <Check className="size-3" />
                    </span>
                  </div>
                </td>
                {EDITABLE_ROLES.map(({ role }) => {
                  const checked = matrix[role]?.[permission] ?? false
                  const key = `${role}:${permission}`
                  const loading = pending === key
                  return (
                    <td key={role} className="py-3 px-4">
                      <div className="flex justify-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`${role} — ${PERMISSION_LABELS[permission]}`}
                          disabled={loading}
                          onClick={() => toggle(role, permission)}
                          className={cn(
                            "relative flex size-[19px] items-center justify-center rounded-[6px] transition-colors disabled:cursor-wait disabled:opacity-60 after:absolute after:-inset-2.5 after:content-['']",
                            checked
                              ? "bg-primary text-primary-foreground"
                              : "border-2 border-input bg-card text-transparent hover:border-primary/40"
                          )}
                        >
                          <Check className="size-3" />
                        </button>
                      </div>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
