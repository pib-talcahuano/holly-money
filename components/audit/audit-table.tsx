"use client"

import { useState } from "react"
import Link from "next/link"
import {
  AUDIT_ENTITY_LABEL,
  auditActionLabel,
  auditActionShortLabel,
  auditActionVariant,
  auditEntityLabel
} from "@/lib/constants/audit"
import { AuditDiff } from "./audit-diff"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { ClipboardList } from "lucide-react"

export type SerializedAuditEvent = {
  id: string
  // Pre-formatted server-side (not the raw ISO value) to avoid an SSR/client hydration
  // mismatch: Node's and the browser's Intl engines can render es-CL AM/PM time strings
  // with different whitespace, so the same Date must not be formatted on both sides.
  event_date_display: string
  entity: string
  action: string
  note: string | null
  user_name: string | null
  impersonator_name: string | null
  href: string | null
  previous_value: unknown
  new_value: unknown
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="text-sm font-semibold text-foreground">{value || "—"}</p>
    </div>
  )
}

export function AuditTable({ rows }: { rows: SerializedAuditEvent[] }) {
  const [selected, setSelected] = useState<SerializedAuditEvent | null>(null)

  return (
    <>
      <div className="hidden sm:block overflow-x-auto" role="table" aria-label="Registro de auditoría">
        <div
          role="row"
          className="grid grid-cols-[160px_1fr_1fr_1fr_1.4fr] gap-x-3.5 px-6 py-3.5 border-b border-border min-w-[780px]"
        >
          <span role="columnheader" className="font-extrabold text-[10.5px] uppercase tracking-[0.06em] text-faint">
            Fecha
          </span>
          <span role="columnheader" className="font-extrabold text-[10.5px] uppercase tracking-[0.06em] text-faint">
            Entidad
          </span>
          <span role="columnheader" className="font-extrabold text-[10.5px] uppercase tracking-[0.06em] text-faint">
            Acción
          </span>
          <span role="columnheader" className="font-extrabold text-[10.5px] uppercase tracking-[0.06em] text-faint">
            Usuario
          </span>
          <span role="columnheader" className="font-extrabold text-[10.5px] uppercase tracking-[0.06em] text-faint">
            Observación
          </span>
        </div>
        <div role="rowgroup">
          {rows.map((event) => (
            <div
              key={event.id}
              role="row"
              tabIndex={0}
              onClick={() => setSelected(event)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(event)}
              className="grid grid-cols-[160px_1fr_1fr_1fr_1.4fr] gap-x-3.5 items-center px-6 py-[15px] border-t border-border text-[13.5px] min-w-[780px] cursor-pointer transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span role="cell" className="text-muted-foreground whitespace-nowrap tabular-nums">
                {event.event_date_display}
              </span>
              <span role="cell" className="font-semibold text-foreground">
                {auditEntityLabel(event.entity)}
              </span>
              <span role="cell">
                <Badge
                  variant={auditActionVariant(event.action)}
                  className="uppercase tracking-wide text-[11px] font-bold"
                >
                  {auditActionShortLabel(event.action)}
                </Badge>
              </span>
              <span role="cell" className="text-muted-foreground">
                {event.user_name ?? "—"}
                {event.impersonator_name && (
                  <span className="block text-xs italic text-muted-foreground/80">
                    suplantado por {event.impersonator_name}
                  </span>
                )}
              </span>
              <span role="cell" className="text-[12.5px] text-muted-foreground">
                {event.note ?? "—"}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="sm:hidden flex min-w-0 flex-col gap-2.5 px-4 pb-4">
        {rows.map((event) => (
          <div
            key={event.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelected(event)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setSelected(event)}
            className="min-w-0 cursor-pointer rounded-[14px] border border-border bg-card px-4 py-3.5"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-2">
              <Badge
                variant={auditActionVariant(event.action)}
                className="uppercase tracking-wide text-[11px] font-bold"
              >
                {auditActionShortLabel(event.action)}
              </Badge>
              <span className="text-[11.5px] font-semibold text-faint tabular-nums">
                {event.event_date_display}
              </span>
            </div>
            <div className="text-sm font-bold mb-1">{auditEntityLabel(event.entity)}</div>
            {event.note && (
              <p className="mb-2 break-words text-[12.5px] leading-relaxed text-muted-foreground">
                {event.note}
              </p>
            )}
            <div className="break-words border-t border-border pt-2 text-[11.5px] font-semibold text-faint">
              Por {event.user_name ?? "—"}
              {event.impersonator_name && ` (suplantado por ${event.impersonator_name})`}
            </div>
          </div>
        ))}
      </div>

      {!rows.length && (
        <Empty className="border-0 py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ClipboardList />
            </EmptyMedia>
            <EmptyTitle>Sin eventos</EmptyTitle>
            <EmptyDescription>No hay eventos de auditoría registrados.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null)
        }}
      >
        {selected && (
          <DialogContent className="w-[95vw] sm:max-w-lg bg-card p-0 border border-border rounded-xl overflow-y-auto max-h-[90vh]">
            <div className="p-6 sm:p-8 flex flex-col gap-6">
              <DialogHeader>
                <div className="flex items-center gap-3 flex-wrap">
                  <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                    {auditActionLabel(selected.action)}
                  </DialogTitle>
                  {AUDIT_ENTITY_LABEL[selected.entity.toUpperCase()] && (
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide uppercase bg-muted text-muted-foreground">
                      {auditEntityLabel(selected.entity)}
                    </span>
                  )}
                </div>
                <DialogDescription className="sr-only">
                  Detalle del evento de auditoría
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Fecha" value={selected.event_date_display} />
                <Field label="Usuario" value={selected.user_name} />
                {selected.impersonator_name && (
                  <Field label="Suplantado por" value={selected.impersonator_name} />
                )}
              </div>

              {selected.note && (
                <div className="flex flex-col gap-1">
                  <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                    Observación
                  </p>
                  <p className="text-sm font-medium text-foreground leading-relaxed">
                    {selected.note}
                  </p>
                </div>
              )}

              <AuditDiff previous={selected.previous_value} next={selected.new_value} />

              {selected.href && (
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                  <Button
                    variant="outline"
                    className="h-10 px-5"
                    render={<Link href={selected.href} />}
                    nativeButton={false}
                  >
                    Ver {auditEntityLabel(selected.entity).toLowerCase()}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}
