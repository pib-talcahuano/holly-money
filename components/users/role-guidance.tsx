import { Check, CircleSlash, Scale, ShieldAlert } from "lucide-react"
import { USER_ROLES, ROLE_ORDER, ROLE_LABEL } from "@/lib/constants/roles"
import { permissionLinesFor } from "@/components/users/role-meta"
import type { UserRole } from "@/types/auth"

export function RoleSummary({ roles }: { roles: readonly UserRole[] }) {
  const label = ROLE_ORDER.filter((r) => roles.includes(r))
    .map((r) => ROLE_LABEL[r])
    .join(" + ")
  return (
    <span className="text-right text-[11.5px] font-bold text-foreground">{label || "Ninguno"}</span>
  )
}

export function RolePermissionsPanel({ roles }: { roles: readonly UserRole[] }) {
  if (roles.length === 0) return null
  const lines = permissionLinesFor(roles)
  return (
    <div className="rounded-xl border border-border bg-muted/50 px-3.5 py-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted-foreground">
          Podrá
        </span>
        {lines.length > 0 && (
          <span className="text-[11px] text-muted-foreground">
            {lines.length} permiso{lines.length === 1 ? "" : "s"}
          </span>
        )}
      </div>
      {lines.length === 0 ? (
        <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <CircleSlash className="size-3.5 shrink-0" />
          {roles.length > 1
            ? "Estos roles no tienen permisos asignados"
            : "Este rol no tiene permisos asignados"}
        </div>
      ) : (
        <ul className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {lines.map((line) => (
            <li key={line} className="flex gap-2 text-[12.5px] leading-snug text-foreground">
              <Check className="mt-0.5 size-3.5 shrink-0 text-income" />
              <span>{line}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[11px] text-muted-foreground">Según Configuración → Permisos</p>
    </div>
  )
}

export function RoleCallouts({ roles }: { roles: readonly UserRole[] }) {
  const adminPicked = roles.includes(USER_ROLES.ADMIN)
  const conflict = roles.includes(USER_ROLES.MINISTER) && roles.includes(USER_ROLES.BURSAR)
  return (
    <>
      {adminPicked && (
        <div className="flex gap-2.5 rounded-[10px] bg-primary-soft px-3.5 py-3">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" />
          <p className="text-xs leading-relaxed text-foreground">
            Asigna Admin solo a personas de plena confianza: puede invitar y eliminar usuarios y
            anular registros contables.
          </p>
        </div>
      )}
      {conflict && (
        <div className="flex gap-2.5 rounded-[10px] bg-warn-surface px-3.5 py-3">
          <Scale className="mt-0.5 size-4 shrink-0 text-on-warn" />
          <div>
            <p className="mb-0.5 text-[12.5px] font-bold text-on-warn">
              Ministro y Tesorero a la vez
            </p>
            <p className="text-xs leading-relaxed text-foreground">
              Por separación de funciones, no podrá aprobar, transferir ni rendir los fondos de sus
              propias solicitudes.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
