import Link from "next/link"
import { ArrowLeft, Banknote, Download, FileText, TrendingDown, Vault } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { formatDate, formatCLP } from "@/lib/utils"
import { attachmentHref } from "@/lib/storage/attachments"
import type { payrollService } from "@/services/payroll/payroll.service"

type PayrollRecord = Awaited<ReturnType<typeof payrollService.getById>>

function formatPeriod(period: string) {
  const d = new Date(`${period}T00:00`)
  const label = d.toLocaleDateString("es-CL", { month: "long", year: "numeric" })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

function formatFileSize(bytes: number) {
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

export function PayrollDetailClient({
  record,
  reserveForPeriod,
  fondoAcumulado
}: {
  record: PayrollRecord
  reserveForPeriod: number | null
  fondoAcumulado: number
}) {
  const lines = record.payroll_movements.map((pm) => ({
    id: pm.id,
    title: pm.title,
    amount: Number(pm.movements?.amount ?? 0),
    deliveredTo: pm.movements?.delivered_by,
    date: pm.movements?.movement_date,
    attachments: pm.movements?.movement_attachments ?? []
  }))
  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  const allAttachments = [
    ...(record.liquidacion_storage_path
      ? [
          {
            id: "liquidacion",
            fileName: record.liquidacion_file_name ?? "Liquidación",
            path: record.liquidacion_storage_path,
            sizeBytes: record.liquidacion_size_bytes,
            mimeType: record.liquidacion_mime_type
          }
        ]
      : []),
    ...lines.flatMap((l) =>
      l.attachments.map((a) => ({
        id: a.id,
        fileName: a.file_name,
        path: a.storage_path,
        sizeBytes: a.size_bytes,
        mimeType: a.mime_type
      }))
    )
  ]

  return (
    <div className="max-w-6xl space-y-6">
      <Link
        href="/payroll"
        className="inline-flex items-center gap-1.5 text-[12.5px] font-bold text-foreground hover:text-primary w-fit py-1.5 -my-1.5"
      >
        <ArrowLeft className="size-4" />
        Volver a remuneraciones
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[15px] bg-primary-soft">
            <Banknote className="size-[22px] text-primary" />
          </div>
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
                Remuneración · {formatPeriod(record.period)}
              </h1>
              <Badge variant="income">Registrada</Badge>
            </div>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-bold uppercase tracking-[0.05em] text-faint mb-0.5">
            Total del período
          </p>
          <p className="text-2xl font-extrabold tabular-nums">{formatCLP(total)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Transferido
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-expense-surface">
              <TrendingDown className="size-3.5 text-expense" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums">{formatCLP(total)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {lines.length} {lines.length === 1 ? "transferencia" : "transferencias"} · categoría
              Remuneraciones
            </p>
          </div>
        </div>
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Reserva del mes
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-primary-soft">
              <Vault className="size-3.5 text-primary" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums">
              {reserveForPeriod !== null ? formatCLP(reserveForPeriod) : "—"}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              No genera transferencia; suma al fondo
            </p>
          </div>
        </div>
        <div className="rounded-[18px] bg-card border border-border px-5 py-[18px] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
              Fondo acumulado
            </span>
            <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-income-surface">
              <Vault className="size-3.5 text-income" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-extrabold tabular-nums">{formatCLP(fondoAcumulado)}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Después de este registro</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-card border border-border overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h2 className="text-sm font-bold text-foreground">Transferencias del período</h2>
            </div>
            <div className="flex flex-col">
              {lines.map((line) => (
                <div
                  key={line.id}
                  className="flex items-center gap-3.5 px-5 py-4 border-t border-border first:border-t-0"
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-[11px] bg-expense-surface">
                    <TrendingDown className="size-4 text-expense" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-bold">{line.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {line.deliveredTo ? `Entregado a ${line.deliveredTo}` : "—"}
                      {line.date ? ` · ${formatDate(line.date)}` : ""}
                    </p>
                  </div>
                  <Badge variant="neutral" className="shrink-0">
                    Egreso
                  </Badge>
                  <span className="text-[14.5px] font-extrabold tabular-nums">
                    {formatCLP(line.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {reserveForPeriod !== null && reserveForPeriod > 0 && (
            <div className="rounded-2xl bg-primary-soft border border-border p-5 flex items-center gap-3.5">
              <div className="flex size-[38px] shrink-0 items-center justify-center rounded-[11px] bg-card">
                <Vault className="size-[17px] text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-bold text-primary">Reserva de indemnización</p>
                <p className="text-xs text-muted-foreground">
                  Se contabiliza y suma al fondo acumulado del pastor
                </p>
              </div>
              <span className="text-[15px] font-extrabold tabular-nums">
                {formatCLP(reserveForPeriod)}
              </span>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4">
            <h2 className="text-[13px] font-bold text-foreground">Archivos adjuntos</h2>
            {allAttachments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin archivos adjuntos.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {allAttachments.map((a) => (
                  <a
                    key={a.id}
                    href={attachmentHref("attachments", a.path) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2.5 rounded-[10px] border border-border px-3 py-2.5 hover:bg-muted transition-colors"
                  >
                    <div className="flex size-[30px] shrink-0 items-center justify-center rounded-[8px] bg-primary-soft">
                      <FileText className="size-3.5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold truncate">{a.fileName}</p>
                      <p className="text-[11px] text-faint">
                        {a.sizeBytes ? formatFileSize(a.sizeBytes) : a.mimeType}
                      </p>
                    </div>
                    <Download className="size-3.5 text-faint shrink-0" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl bg-card border border-border p-5 flex flex-col gap-4">
            <h2 className="text-[13px] font-bold text-foreground">Registro</h2>
            <div className="flex flex-col gap-3">
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Registrada por
                </p>
                <p className="text-sm font-semibold">
                  {record.created_by_user?.full_name ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Fecha de registro
                </p>
                <p className="text-sm font-semibold">{formatDate(record.created_at)}</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Categoría
                </p>
                <p className="text-sm font-semibold">Remuneraciones</p>
              </div>
              <div>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
                  Período
                </p>
                <p className="text-sm font-semibold">{formatPeriod(record.period)}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
