"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CalendarRange, Pencil, Plus, Wallet, EyeOff } from "lucide-react"
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
import { upsertBudgetItem, setBudgetItemActive } from "@/app/actions/budget-items"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"
import type { BudgetItemSummaryRow } from "@/services/ministries/budget-items.service"
import { BudgetItemDialog } from "./budget-item-dialog"
import { buildBudgetRows, sumTotals, type BudgetRow } from "./budget-rows"

type Ministry = { id: string; name: string; is_active: boolean }
type BudgetPeriod = { id: string; label: string; start_date: string; end_date: string }

type Props = {
  ministries: Ministry[]
  currentPeriod: BudgetPeriod | null
  summary: MinistryBudgetSummaryRow[]
  itemSummary: BudgetItemSummaryRow[]
  expenseCategories: { id: string; name: string }[]
}

type Draft = { assigned?: string; initial?: string }

export function MinistryBudgetAdmin({
  ministries,
  currentPeriod,
  summary,
  itemSummary,
  expenseCategories
}: Props) {
  const router = useRouter()
  const [periodDialogOpen, setPeriodDialogOpen] = useState(false)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetRow | null>(null)
  const [saving, setSaving] = useState(false)
  // Only the user's pending edits; displayed values fall back to the saved ones from props,
  // so rows added or removed by a refresh never leave stale state behind.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const budgetRows = buildBudgetRows(ministries, summary, itemSummary)
  const totals = sumTotals(budgetRows)

  function assignedOf(r: BudgetRow) {
    return drafts[r.id]?.assigned ?? (r.assigned === null ? "" : String(r.assigned))
  }
  function initialOf(r: BudgetRow) {
    return drafts[r.id]?.initial ?? String(r.initial)
  }
  function setDraft(id: string, patch: Draft) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

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
      const withAmount = budgetRows.filter((r) => assignedOf(r))
      await Promise.all(
        withAmount.map((r) =>
          r.kind === "ministry"
            ? upsertMinistryBudget({
                ministry_id: r.id,
                budget_period_id: currentPeriod.id,
                assigned_amount: Number(assignedOf(r)),
                initial_used_amount: Number(initialOf(r) || 0)
              })
            : upsertBudgetItem({
                id: r.id,
                budget_period_id: currentPeriod.id,
                name: r.name,
                category_id: r.categoryId ?? null,
                notes: r.notes ?? undefined,
                assigned_amount: Number(assignedOf(r)),
                initial_used_amount: Number(initialOf(r) || 0)
              })
        )
      )
      setDrafts({})
      toast.success("Presupuestos guardados")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar presupuestos")
    } finally {
      setSaving(false)
    }
  }

  async function handleDeactivate(r: BudgetRow) {
    try {
      await setBudgetItemActive({ id: r.id, is_active: false })
      toast.success("Ítem desactivado")
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar el ítem")
    }
  }

  function openItemDialog(item: BudgetRow | null) {
    setEditingItem(item)
    setItemDialogOpen(true)
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
                <Input
                  id="label"
                  placeholder="Presupuesto 2026"
                  {...periodForm.register("label")}
                />
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
            <h2 className="text-sm font-bold text-foreground">Presupuesto del período</h2>
            <Button size="sm" onClick={handleSaveBudgets} disabled={saving}>
              {saving ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
                <tr>
                  <th className="px-5 py-2.5 text-left font-medium">Nombre</th>
                  <th className="px-5 py-2.5 text-left font-medium">Tipo</th>
                  <th className="px-5 py-2.5 text-right font-medium">Asignado</th>
                  <th className="px-5 py-2.5 text-right font-medium">Usado inicial</th>
                  <th className="px-5 py-2.5 text-right font-medium">Usado (auto)</th>
                  <th className="px-5 py-2.5 text-right font-medium">Remanente</th>
                  <th className="px-5 py-2.5 text-right font-medium">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {budgetRows.map((r) => (
                  <tr key={`${r.kind}-${r.id}`}>
                    <td className="px-5 py-3 font-medium">
                      {r.name}
                      {r.kind === "item" && r.categoryName && (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {r.categoryName}
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                        {r.kind === "ministry" ? "Ministerio" : "Otro"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`Asignado ${r.name}`}
                        className="w-32 ml-auto text-right"
                        value={assignedOf(r)}
                        onChange={(e) => setDraft(r.id, { assigned: e.target.value })}
                      />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        aria-label={`Usado inicial ${r.name}`}
                        className="w-32 ml-auto text-right"
                        value={initialOf(r)}
                        onChange={(e) => setDraft(r.id, { initial: e.target.value })}
                      />
                    </td>
                    <td className="px-5 py-3 text-right text-muted-foreground">
                      {r.used === null ? "—" : formatCLP(r.used)}
                    </td>
                    <td
                      className={`px-5 py-3 text-right font-medium ${
                        r.remaining !== null && r.remaining < 0 ? "text-destructive" : ""
                      }`}
                    >
                      {r.remaining === null ? "—" : formatCLP(r.remaining)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.kind === "item" && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Editar ${r.name}`}
                            onClick={() => openItemDialog(r)}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`Desactivar ${r.name}`}
                            onClick={() => handleDeactivate(r)}
                          >
                            <EyeOff className="size-4" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={7} className="px-5 py-2">
                    <Button size="sm" variant="ghost" onClick={() => openItemDialog(null)}>
                      <Plus className="size-4" /> Agregar ítem
                    </Button>
                  </td>
                </tr>
              </tbody>
              <tfoot className="bg-muted/50 text-sm font-bold">
                <tr>
                  <td className="px-5 py-3" colSpan={2}>
                    Total
                  </td>
                  <td className="px-5 py-3 text-right">{formatCLP(totals.assigned)}</td>
                  <td className="px-5 py-3 text-right">{formatCLP(totals.initial)}</td>
                  <td className="px-5 py-3 text-right">{formatCLP(totals.used)}</td>
                  <td
                    className={`px-5 py-3 text-right ${totals.remaining < 0 ? "text-destructive" : ""}`}
                  >
                    {formatCLP(totals.remaining)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {currentPeriod && (
        <BudgetItemDialog
          open={itemDialogOpen}
          onOpenChange={setItemDialogOpen}
          periodId={currentPeriod.id}
          categories={expenseCategories}
          item={editingItem}
        />
      )}
    </div>
  )
}
