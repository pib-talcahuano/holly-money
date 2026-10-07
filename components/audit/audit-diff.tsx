import { formatDate, formatCLP } from "@/lib/utils"
import { rolesLabel } from "@/lib/constants/roles"

// Known JSONB keys across every auditService.logSystem/logMovement call site — used to
// humanize the diff view. Unmapped keys fall back to a title-cased version of the key.
const KEY_LABEL: Record<string, string> = {
  status: "Estado",
  amount: "Monto",
  intention_id: "Solicitud",
  ministry_id: "Ministerio",
  message: "Mensaje",
  movement_id: "Movimiento",
  settlement_closed_at: "Cierre de rendición",
  transfer_date: "Fecha de transferencia",
  expense_date: "Fecha de gasto",
  reviewed_at: "Fecha de revisión",
  is_late: "Fuera de plazo",
  description: "Descripción",
  file_name: "Archivo",
  name: "Nombre",
  role: "Rol",
  roles: "Roles",
  is_active: "Activo"
}

const AMOUNT_KEYS = new Set(["amount"])
const DATE_KEYS = new Set(["transfer_date", "expense_date", "settlement_closed_at", "reviewed_at"])

function humanizeKey(key: string): string {
  if (KEY_LABEL[key]) return KEY_LABEL[key]
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (typeof value === "boolean") return value ? "Sí" : "No"
  if (AMOUNT_KEYS.has(key) && typeof value === "number") return formatCLP(value)
  if (DATE_KEYS.has(key) && typeof value === "string" && !Number.isNaN(new Date(value).getTime())) {
    return formatDate(value)
  }
  if (key === "roles" && Array.isArray(value)) return rolesLabel(value.map(String))
  return String(value)
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function DiffRow({
  label,
  value,
  previousValue
}: {
  label: string
  value: string
  previousValue?: string
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
      <span className="font-semibold text-foreground">{label}:</span>
      {previousValue !== undefined && (
        <>
          <span className="text-muted-foreground">{previousValue}</span>
          <span className="text-muted-foreground">→</span>
        </>
      )}
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}

export function AuditDiff({ previous, next }: { previous: unknown; next: unknown }) {
  const prev = isPlainRecord(previous) ? previous : null
  const nxt = isPlainRecord(next) ? next : null

  if (prev && nxt) {
    const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(nxt)])).filter(
      (key) => JSON.stringify(prev[key]) !== JSON.stringify(nxt[key])
    )
    if (!keys.length) return null
    return (
      <div className="flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Cambios
        </p>
        <div className="flex flex-col gap-1.5">
          {keys.map((key) => (
            <DiffRow
              key={key}
              label={humanizeKey(key)}
              previousValue={formatValue(key, prev[key])}
              value={formatValue(key, nxt[key])}
            />
          ))}
        </div>
      </div>
    )
  }

  const only = prev ?? nxt
  if (!only) return null
  const keys = Object.keys(only)
  if (!keys.length) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        Datos
      </p>
      <div className="flex flex-col gap-1.5">
        {keys.map((key) => (
          <DiffRow key={key} label={humanizeKey(key)} value={formatValue(key, only[key])} />
        ))}
      </div>
    </div>
  )
}
