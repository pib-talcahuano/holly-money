"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Clock, CheckCircle2, XCircle, FileText, Ban } from "lucide-react"
import { cn } from "@/lib/utils"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { formatDate, formatCLP, avatarColorFor, initialsFor } from "@/lib/utils"
import type { intentionsService } from "@/services/intentions/intentions.service"
import type { ministriesService } from "@/services/ministries/ministries.service"
import { useRealtimeRefresh } from "@/hooks/use-realtime-refresh"
import { NewRequestDialog } from "@/components/intentions/new-request-dialog"

type Intention = Awaited<ReturnType<typeof intentionsService.list>>[number]
type MinistryAssignment = Awaited<ReturnType<typeof ministriesService.getMinistryForUser>>
type Ministry = NonNullable<MinistryAssignment>["ministries"] | null

const STATUS_LINE_META = {
  DRAFT: { icon: FileText, color: "text-muted-foreground" },
  PENDING: { icon: Clock, color: "text-warn" },
  APPROVED: { icon: CheckCircle2, color: "text-income" },
  REJECTED: { icon: XCircle, color: "text-expense" },
  CANCELLED: { icon: Ban, color: "text-muted-foreground" }
}

const STATUS_LABELS = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  APPROVED: "Aprobada",
  REJECTED: "Rechazada",
  CANCELLED: "Cancelada"
}

const FUNDING_METHOD_LABELS = {
  REIMBURSEMENT: "Reembolso",
  TRANSFER: "Transferencia anticipada"
}

// Method pill colors: transfer reads as the "primary-2" (violet) family per the
// design spec, reimbursement stays a neutral primary tint.
const FUNDING_METHOD_PILL = {
  REIMBURSEMENT: "bg-primary-soft text-primary",
  TRANSFER: "bg-role-purple-surface text-role-purple"
}

export function IntentionsClient({
  canCreateRequest,
  intentions: initialIntentions,
  ministry
}: {
  canCreateRequest: boolean
  intentions: Intention[]
  ministry: Ministry
}) {
  const router = useRouter()
  const [intentions, setIntentions] = useState<Intention[]>(initialIntentions)

  // Resync on router.refresh() (e.g. from useRealtimeRefresh below) — useState's
  // initial value only applies on first mount, and this list is locally mutated
  // for the viewer's own actions (see handleSubmit).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncing local list state after router.refresh() brings fresh server props; there's no way to do this during render since the previous prop value isn't otherwise observable
    setIntentions(initialIntentions)
  }, [initialIntentions])
  useRealtimeRefresh([{ table: "budget_intentions" }])

  const isMinister = canCreateRequest

  // Closed = rejected/cancelled outright, or its settlement flow was closed out
  // by tesorería (settlement_closed_at set). Everything else still needs
  // someone's attention (including DRAFT, which is still being worked on).
  const closedIntentions = intentions.filter(
    (i) => i.status === "REJECTED" || i.status === "CANCELLED" || !!i.settlement_closed_at
  )
  const openIntentions = intentions.filter(
    (i) => i.status !== "REJECTED" && i.status !== "CANCELLED" && !i.settlement_closed_at
  )
  const openTotal = openIntentions.reduce((sum, i) => sum + i.amount, 0)
  const rejectedCount = intentions.filter((i) => i.status === "REJECTED").length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
            Solicitudes de Dinero
          </h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">
            {isMinister ? (
              ministry ? (
                <>
                  Ministerio:{" "}
                  <Link
                    href={`/ministries/${ministry.id}`}
                    className="font-semibold hover:underline"
                  >
                    {ministry.name}
                  </Link>
                </>
              ) : (
                "Ministerio: Sin asignar"
              )
            ) : (
              "Todas las solicitudes"
            )}
          </p>
        </div>
        {isMinister && (
          <NewRequestDialog
            onCreated={(created) =>
              setIntentions((prev) => [created as unknown as Intention, ...prev])
            }
          />
        )}
      </div>

      {intentions.length === 0 ? (
        <Empty>
          <EmptyMedia>
            <FileText className="size-10 text-muted-foreground" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>Sin solicitudes</EmptyTitle>
            <EmptyDescription>
              {isMinister
                ? "Crea tu primera solicitud de dinero."
                : "No hay solicitudes registradas."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 mb-7">
            <div className="rounded-[14px] bg-card border border-border px-[18px] py-4">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-2">
                Solicitado (abiertas)
              </div>
              <div className="text-[21px] font-extrabold">{formatCLP(openTotal)}</div>
            </div>
            <div className="rounded-[14px] bg-card border border-border px-[18px] py-4">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-2">
                Solicitudes abiertas
              </div>
              <div className="text-[21px] font-extrabold">{openIntentions.length}</div>
            </div>
            <div className="rounded-[14px] bg-card border border-border px-[18px] py-4">
              <div className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint mb-2">
                Rechazadas
              </div>
              <div className="text-[21px] font-extrabold text-expense">{rejectedCount}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-income" />
                <h2 className="text-[12.5px] font-bold uppercase tracking-[0.04em] text-foreground">
                  Abiertas
                </h2>
                <span className="text-[11.5px] font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {openIntentions.length}
                </span>
              </div>
              {openIntentions.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {openIntentions.map((intention) => (
                    <IntentionCard
                      key={intention.id}
                      intention={intention}
                      isMinister={isMinister}
                      closed={false}
                      onClick={() => router.push(`/requests/${intention.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground px-1">Sin solicitudes abiertas.</p>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-expense" />
                <h2 className="text-[12.5px] font-bold uppercase tracking-[0.04em] text-foreground">
                  Cerradas
                </h2>
                <span className="text-[11.5px] font-bold text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                  {closedIntentions.length}
                </span>
              </div>
              {closedIntentions.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {closedIntentions.map((intention) => (
                    <IntentionCard
                      key={intention.id}
                      intention={intention}
                      isMinister={isMinister}
                      closed
                      onClick={() => router.push(`/requests/${intention.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground px-1">Sin solicitudes cerradas.</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function IntentionCard({
  intention,
  isMinister,
  closed,
  onClick
}: {
  intention: Intention
  isMinister: boolean
  closed: boolean
  onClick: () => void
}) {
  const ministryName = intention.ministries?.name ?? "Sin ministerio"
  const { icon: StatusIcon, color: statusColor } = STATUS_LINE_META[intention.status]

  return (
    <div
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-2xl border border-border p-[18px] transition-colors",
        closed ? "bg-muted/40" : "bg-card shadow-[0_1px_2px_rgba(22,17,41,.04)] hover:border-input"
      )}
    >
      {!isMinister && (
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2.5">
            <div
              className={cn(
                "flex size-[30px] shrink-0 items-center justify-center rounded-[9px] text-[11px] font-extrabold text-white",
                closed && "opacity-60"
              )}
              style={{ background: avatarColorFor(ministryName) }}
            >
              {initialsFor(ministryName)}
            </div>
            <span
              className={cn(
                "text-xs font-semibold",
                closed ? "text-muted-foreground" : "text-foreground"
              )}
            >
              {ministryName}
            </span>
          </div>
          <span
            className={cn(
              "rounded-full px-[9px] py-[3px] text-[11px] font-bold",
              closed
                ? "bg-muted text-muted-foreground"
                : FUNDING_METHOD_PILL[intention.funding_method]
            )}
          >
            {FUNDING_METHOD_LABELS[intention.funding_method]}
          </span>
        </div>
      )}

      <p
        className={cn(
          "font-heading text-[22px] font-extrabold tracking-tight tabular-nums",
          closed && "text-muted-foreground"
        )}
      >
        {formatCLP(intention.amount)}
      </p>
      <p
        className={cn(
          "text-[13px] mb-3.5",
          closed ? "text-muted-foreground/70" : "text-muted-foreground"
        )}
      >
        {intention.purpose}
      </p>
      {isMinister && (
        <p className="text-xs text-muted-foreground mb-3.5 -mt-2.5">
          {FUNDING_METHOD_LABELS[intention.funding_method]}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-border pt-2.5">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-bold", statusColor)}>
          <StatusIcon className="size-3.5" />
          {STATUS_LABELS[intention.status]}
        </span>
        <span className="text-[11.5px] text-faint">{formatDate(intention.created_at)}</span>
      </div>
    </div>
  )
}
