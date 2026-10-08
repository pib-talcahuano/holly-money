import { ShieldCheck, Wallet, ChartLine, Landmark, Users, type LucideIcon } from "lucide-react"
import type { UserRole } from "@/types/auth"

type RoleMeta = {
  icon: LucideIcon
  description: string
  // Static summary of what the role can do. The authoritative matrix lives in `role_permissions`
  // (Settings → Permisos); these lines are guidance copy for the users dialogs.
  permissions: string[]
  // Tint for the icon tile in the role picker; matches ROLE_BADGE_VARIANT.
  tileClass: string
}

export const ROLE_META: Record<UserRole, RoleMeta> = {
  ADMIN: {
    icon: ShieldCheck,
    description: "Acceso total (no se combina con otros roles)",
    permissions: ["Acceso total: usuarios, configuración, movimientos, remuneraciones y auditoría"],
    tileClass: "bg-primary/12 text-primary"
  },
  BURSAR: {
    icon: Wallet,
    description: "Ingreso de movimientos y aprobación de solicitudes",
    permissions: [
      "Crear, editar y anular movimientos contables",
      "Aprobar o rechazar solicitudes de fondos"
    ],
    tileClass: "bg-role-purple/12 text-role-purple"
  },
  FINANCE: {
    icon: ChartLine,
    description: "Gestión contable — solo lectura",
    permissions: ["Consultar movimientos y el flujo de solicitudes"],
    tileClass: "bg-income/12 text-income"
  },
  MINISTER: {
    icon: Landmark,
    description: "Solicitudes de fondos de su ministerio",
    permissions: [
      "Enviar solicitudes de fondos de su ministerio",
      "Rendir los gastos correspondientes"
    ],
    tileClass: "bg-warn/16 text-on-warn"
  },
  DELEGATE: {
    icon: Users,
    description: "Colabora en las solicitudes de un ministerio",
    permissions: ["Colaborar en las solicitudes de su ministerio"],
    tileClass: "bg-muted text-muted-foreground"
  }
}

export function permissionLinesFor(roles: readonly UserRole[]): string[] {
  return [...new Set(roles.flatMap((role) => ROLE_META[role].permissions))]
}
