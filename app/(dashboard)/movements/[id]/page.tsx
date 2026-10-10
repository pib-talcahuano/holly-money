import { notFound } from "next/navigation"
import Link from "next/link"
import { movementsService } from "@/services/movements/movements.service"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { CancelButton } from "@/components/movements/cancel-button"
import { RegeneratePdfButton } from "@/components/movements/regenerate-pdf-button"
import { VoucherActions } from "@/components/vouchers/voucher-actions"
import { Button } from "@/components/ui/button"
import { cn, formatDate, formatDateTime, formatCLP } from "@/lib/utils"
import { attachmentHref } from "@/lib/storage/attachments"
import { auditActionLabel, auditActionVariant } from "@/lib/constants/audit"
import { AuditDiff } from "@/components/audit/audit-diff"
import type { MovementIntegrationPayload } from "@/services/google/types"
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Edit,
  Ban,
  AlignLeft,
  Paperclip,
  History,
  Download,
  FileText,
  ImageIcon,
  Plus,
  Receipt
} from "lucide-react"

type Props = { params: Promise<{ id: string }> }

const TIMELINE_DOT_CLASS: Record<string, string> = {
  income: "bg-income-surface text-income",
  primary: "bg-primary-surface text-primary",
  warn: "bg-warn-surface text-on-warn",
  expense: "bg-expense-surface text-expense",
  neutral: "bg-muted text-muted-foreground"
}

export default async function MovementDetailPage({ params }: Props) {
  const { id } = await params
  const user = await getCurrentUser()
  const canWrite = can(user?.permissions, PERMISSIONS.CREATE_MOVEMENT) ?? false

  const db = await createSupabaseServerClient()
  const row = await movementsService.findById(db, id).catch(() => null)
  if (!row) notFound()

  const createdBy = row.created_by as { full_name: string; email: string } | null
  const cancelledBy = row.cancelled_by as { full_name: string; email: string } | null
  const paymentMethod = row.payment_methods as { name: string } | null
  const category = row.movement_categories as { name: string } | null
  const subcategory = row.movement_subcategories as { name: string } | null
  const auditLog = (row.movement_audit_log ?? []) as Array<{
    id: string
    action: string
    event_date: string
    note: string | null
    previous_value: unknown
    new_value: unknown
    users: { full_name: string } | null
    impersonator: { full_name: string } | null
  }>
  const attachments = (row.movement_attachments ?? []) as Array<{
    id: string
    file_name: string
    mime_type: string
    storage_path: string
  }>
  const deliveredByLabel = row.movement_type === "INCOME" ? "Entregado por" : "Entregado a"
  const isIncome = row.movement_type === "INCOME"
  const isActive = row.status === "ACTIVE"

  const voucherPayload: MovementIntegrationPayload = {
    movementId: row.id,
    movementTypeLabel: row.movement_type === "INCOME" ? "INGRESO" : "EGRESO",
    movementDate: row.movement_date,
    amount: Number(row.amount),
    category: category?.name ?? "",
    deliveredBy: row.delivered_by,
    paymentMethodLabel: paymentMethod?.name ?? null,
    receiptEmail: row.receipt_email,
    notes: row.notes,
    registeredBy: createdBy?.full_name ?? "",
    user: createdBy?.full_name ?? "",
    registeredEmail: createdBy?.email ?? "",
    registeredAt: row.created_at,
    organizationName: "Sistema contable PIBT"
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-[18px]">
        <Link
          href="/movements"
          className="group flex items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" />
          Volver a movimientos
        </Link>
        {canWrite && row.status !== "CANCELLED" && (
          <div className="flex gap-2">
            <RegeneratePdfButton movement={row} />
            <Button
              variant="outline"
              className="h-9 rounded-full px-4 text-[13px]"
              render={<Link href={`/movements/${row.id}/edit`} />}
              nativeButton={false}
            >
              <Edit className="size-3.5 text-primary" data-icon="inline-start" />
              Editar
            </Button>
          </div>
        )}
      </div>

      {/* Hero */}
      <div className="rounded-2xl bg-card border border-border p-4 sm:p-6 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-[18px]">
          <div>
            <div
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-[11px] font-bold tracking-[0.02em] w-fit",
                isIncome ? "bg-income-surface text-income" : "bg-expense-surface text-expense"
              )}
            >
              {isIncome ? (
                <ArrowDownCircle className="size-3.5" />
              ) : (
                <ArrowUpCircle className="size-3.5" />
              )}
              {isIncome ? "Ingreso" : "Egreso"}
            </div>
            <div className="text-[26px] sm:text-[30px] font-extrabold tracking-tight mt-2">
              {formatCLP(Number(row.amount))}
            </div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5">
              {category?.name ?? "—"}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-muted-foreground">
              <span
                className={cn(
                  "size-[7px] rounded-full shrink-0",
                  isActive ? "bg-primary" : "bg-expense"
                )}
              />
              {isActive ? "Activo" : "Anulado"}
            </span>
            {isActive && canWrite && (
              <CancelButton
                movement={row}
                className="h-[34px] rounded-full border border-expense bg-card px-3.5 text-[12.5px] font-semibold text-expense hover:bg-expense-surface"
              />
            )}
          </div>
        </div>

        {!isActive && (
          <div className="flex gap-3 bg-expense-surface rounded-xl px-4 py-3.5 mb-[18px]">
            <Ban className="size-4 text-expense shrink-0 mt-0.5" />
            <div>
              <p className="text-[13px] font-extrabold text-expense mb-0.5">Movimiento anulado</p>
              <p className="text-[12.5px]">
                Anulado por <strong>{cancelledBy?.full_name ?? "—"}</strong>
                {row.cancelled_at && ` · ${formatDate(row.cancelled_at)}`}
              </p>
              <p className="text-[12.5px] text-muted-foreground mt-0.5">
                Razón: {row.cancellation_reason || "No especificado."}
              </p>
            </div>
          </div>
        )}

        <div className="border-t border-border pt-[18px] grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-1">
              Fecha del movimiento
            </p>
            <p className="text-[13.5px] font-semibold">{formatDate(row.movement_date)}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-1">
              Medio de pago
            </p>
            <p className="text-[13.5px] font-semibold">{paymentMethod?.name ?? "—"}</p>
          </div>
          <div>
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-1">
              Registrado por
            </p>
            <p className="text-[13.5px] font-semibold">{createdBy?.full_name ?? "—"}</p>
          </div>
          {subcategory?.name && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-1">
                Subcategoría
              </p>
              <p className="text-[13.5px] font-semibold">{subcategory.name}</p>
            </div>
          )}
          {row.delivered_by && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-1">
                {deliveredByLabel}
              </p>
              <p className="text-[13.5px] font-semibold">{row.delivered_by}</p>
            </div>
          )}
          {row.receipt_email && (
            <div>
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-1">
                Correo de comprobante
              </p>
              <p className="text-[13.5px] font-semibold">{row.receipt_email}</p>
            </div>
          )}
        </div>
      </div>

      {/* Descripción */}
      <div className="rounded-2xl bg-card border border-border px-6 py-[22px] mb-4">
        <div className="flex items-center gap-2 mb-3">
          <AlignLeft className="size-4 text-primary" />
          <span className="text-[15px] font-bold">Descripción</span>
        </div>
        <p className="text-[13.5px] leading-relaxed">
          {row.notes || "Sin observaciones adicionales."}
        </p>
      </div>

      {/* Documentos */}
      <div className="rounded-2xl bg-card border border-border px-6 py-[22px] mb-4">
        <div className="flex items-center gap-2 mb-3.5">
          <Paperclip className="size-4 text-primary" />
          <span className="text-[15px] font-bold">Documentos</span>
        </div>
        {attachments.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">Sin comprobantes adjuntos.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-3 border border-border rounded-[10px] px-3.5 py-3"
              >
                <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-primary-surface">
                  {att.mime_type.startsWith("image/") ? (
                    <ImageIcon className="size-4 text-primary" />
                  ) : (
                    <FileText className="size-4 text-primary" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-bold truncate">{att.file_name}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    Subido el {formatDate(row.movement_date)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="h-8 rounded-full px-3.5 text-xs shrink-0"
                  render={
                    <Link
                      href={attachmentHref("attachments", att.storage_path) ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                  nativeButton={false}
                >
                  <Download className="size-3.5" data-icon="inline-start" />
                  Descargar
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historial */}
      <div className="rounded-2xl bg-card border border-border px-6 py-[22px] mb-4">
        <div className="flex items-center gap-2 mb-4">
          <History className="size-4 text-primary" />
          <span className="text-[15px] font-bold">Historial</span>
        </div>
        <div className="flex flex-col">
          <TimelineEvent
            icon={<Plus className="size-3.5" />}
            colorClass={TIMELINE_DOT_CLASS.income}
            title="Movimiento creado"
            meta={`${formatDateTime(row.created_at)} · ${createdBy?.full_name ?? "—"}`}
            isLast={auditLog.length === 0}
          />
          {auditLog.map((item, index) => (
            <TimelineEvent
              key={item.id}
              icon={<History className="size-3.5" />}
              colorClass={TIMELINE_DOT_CLASS[auditActionVariant(item.action)]}
              title={auditActionLabel(item.action)}
              meta={`${formatDateTime(item.event_date)} · ${item.users?.full_name ?? "—"}${item.impersonator ? ` (suplantado por ${item.impersonator.full_name})` : ""}`}
              note={item.note}
              diff={<AuditDiff previous={item.previous_value} next={item.new_value} />}
              isLast={index === auditLog.length - 1}
            />
          ))}
        </div>
      </div>

      {isIncome && (
        <div className="rounded-2xl bg-card border border-border px-6 py-[22px]">
          <div className="flex items-center gap-2 mb-3.5">
            <Receipt className="size-4 text-primary" />
            <span className="text-[15px] font-bold">Generar comprobante</span>
          </div>
          <VoucherActions movement={voucherPayload} />
        </div>
      )}
    </div>
  )
}

function TimelineEvent({
  icon,
  colorClass,
  title,
  meta,
  note,
  diff,
  isLast
}: {
  icon: React.ReactNode
  colorClass: string
  title: string
  meta: string
  note?: string | null
  diff?: React.ReactNode
  isLast: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center flex-none">
        <div
          className={cn("flex size-[26px] items-center justify-center rounded-full", colorClass)}
        >
          {icon}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-border" />}
      </div>
      <div className={cn("min-w-0", isLast ? "pb-0" : "pb-[18px]")}>
        <p className="text-[13px] font-bold">{title}</p>
        <p className="text-xs text-muted-foreground">{meta}</p>
        {note && <p className="text-xs text-muted-foreground mt-1 max-w-lg">{note}</p>}
        {diff && <div className="mt-1 max-w-lg">{diff}</div>}
      </div>
    </div>
  )
}
