"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { CalendarRange, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import { formatCLP, formatDate } from "@/lib/utils"
import {
  upsertBudgetPeriodSchema,
  type UpsertBudgetPeriodInput
} from "@/lib/validators/ministry-budget"
import { upsertBudgetPeriod, upsertMinistryBudget } from "@/app/actions/ministry-budgets"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"

type Ministry = { id: string; name: string; is_active: boolean }
type BudgetPeriod = { id: string; label: string; start_date: string; end_date: string }

type Props = {
  ministries: Ministry[]
  currentPeriod: BudgetPeriod | null
  summary: MinistryBudgetSummaryRow[]
}

export function MinistryBudgetAdmin({ ministries, currentPeriod, summary }: Props) {
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [rows, setRows] = useState<Record<string, { assigned: string; initial: string }>>(() => {
    const initial: Record<string, { assigned: string; initial: string }> = {}
    for (const m of ministries) {
      const existing = summary.find((s) => s.ministry_id === m.id)
      initial[m.id] = {
        assigned: existing ? String(existing.assigned_amount) : "",
        initial: existing ? String(existing.initial_used_amount) : "0"
      }
    }
    return initial
  })

  const periodForm = useForm<UpsertBudgetPeriodInput>({
    resolver: zodResolver(upsertBudgetPeriodSchema),
    defaultValues: currentPeriod
      ? {
          id: currentPeriod.id,
          label: currentPeriod.label,
          start_date: currentPeriod.start_date,
          end_date: currentPeriod.end_date
        }
      : { label: "", start_date: "", end_date: "" }
  })

  async function handlePeriodSubmit(values: UpsertBudgetPeriodInput) {
    try {
      await upsertBudgetPeriod(values)
      setPeriodDialogOpen(false)
      toast.success("Período guardado")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el período")
    }
  }

  async function handleSaveBudgets() {
    if (!currentPeriod) return
    setSaving(true)
    try {
      const activeMinistries = ministries.filter((m) => m.is_active && rows[m.id]?.assigned)
      await Promise.all(
        activeMinistries.map((m) =>
          upsertMinistryBudget({
            ministry_id: m.id,
            budget_period_id: currentPeriod.id,
            assigned_amount: Number(rows[m.id].assigned),
            initial_used_amount: Number(rows[m.id].initial || 0)
          })
        )
      )
      toast.success("Presupuestos guardados")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar presupuestos")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-card border border-border px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-[10px] bg-primary-soft">
            <CalendarRange className="size-4 text-primary" />
          </div>
          <div>
            {currentPeriod ? (
              <>
                <p className="text-sm font-bold text-foreground">{currentPeriod.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(currentPeriod.start_date)} – {formatDate(currentPeriod.end_date)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">No hay período vigente</p>
                <p className="text-xs text-muted-foreground">
                  Crea uno para poder cargar montos por ministerio
                </p>
              </>
            )}
          </div>
        </div>
        <Dialog open={periodDialogOpen} onOpenChange={setPeriodDialogOpen}>
          <DialogTrigger
            render={
              <Button variant={currentPeriod ? "outline" : "default"}>
                {currentPeriod ? "Editar período" : "Crear período"}
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {currentPeriod ? "Editar período" : "Nuevo período de presupuesto"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={periodForm.handleSubmit(handlePeriodSubmit)} className="space-y-4 pt-2">
              <Field>
                <FieldLabel htmlFor="label">Nombre *</FieldLabel>
                <Input id="label" placeholder="Presupuesto 2026" {...periodForm.register("label")} />
                <FieldError errors={[periodForm.formState.errors.label]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="start_date">Desde *</FieldLabel>
                <Input id="start_date" type="date" {...periodForm.register("start_date")} />
                <FieldError errors={[periodForm.formState.errors.start_date]} />
              </Field>
              <Field>
                <FieldLabel htmlFor="end_date">Hasta *</FieldLabel>
                <Input id="end_date" type="date" {...periodForm.register("end_date")} />
                <FieldError errors={[periodForm.formState.errors.end_date]} />
              </Field>
              <Button type="submit" className="w-full" disabled={periodForm.formState.isSubmitting}>
                {periodForm.formState.isSubmitting ? "Guardando..." : "Guardar período"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {!currentPeriod ? (
        <Empty>
          <EmptyMedia>
            <Wallet className="size-10 text-muted-foreground" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No hay período vigente</EmptyTitle>
            <EmptyDescription>
              Crea un período arriba para poder cargar montos por ministerio.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-2xl bg-card border border-border overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 border-b border-border">
            <h2 className="text-sm font-bold text-foreground">Presupuesto por ministerio</h2>
            <Button size="sm" onClick={handleSaveBudgets} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="px-5 py-2.5 text-left font-medium">Ministerio</th>
                <th className="px-5 py-2.5 text-right font-medium">Asignado</th>
                <th className="px-5 py-2.5 text-right font-medium">Usado inicial</th>
                <th className="px-5 py-2.5 text-right font-medium">Usado (auto)</th>
                <th className="px-5 py-2.5 text-right font-medium">Remanente</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {ministries
                .filter((m) => m.is_active)
                .map((m) => {
                  const existing = summary.find((s) => s.ministry_id === m.id)
                  return (
                    <tr key={m.id}>
                      <td className="px-5 py-3 font-medium">{m.name}</td>
                      <td className="px-5 py-3 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          className="w-32 ml-auto text-right"
                          value={rows[m.id]?.assigned ?? ""}
                          onChange={(e) =>
                            setRows((prev) => ({
                              ...prev,
                              [m.id]: { ...prev[m.id], assigned: e.target.value }
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          className="w-32 ml-auto text-right"
                          value={rows[m.id]?.initial ?? ""}
                          onChange={(e) =>
                            setRows((prev) => ({
                              ...prev,
                              [m.id]: { ...prev[m.id], initial: e.target.value }
                            }))
                          }
                        />
                      </td>
                      <td className="px-5 py-3 text-right text-muted-foreground">
                        {existing ? formatCLP(existing.used_amount - existing.initial_used_amount) : "—"}
                      </td>
                      <td
                        className={`px-5 py-3 text-right font-medium ${
                          existing && existing.remaining < 0 ? "text-destructive" : ""
                        }`}
                      >
                        {existing ? formatCLP(existing.remaining) : "—"}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
