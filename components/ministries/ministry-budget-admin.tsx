"use client"

import { Fragment, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CalendarRange,
  ChevronDown,
  ChevronRight,
  Pencil,
  Plus,
  Wallet,
  EyeOff
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { formatCLP, formatDate } from "@/lib/utils"
import { createBudgetPeriod, upsertMinistryBudget } from "@/app/actions/ministry-budgets"
import { updateBudgetItemAmounts, setBudgetItemActive } from "@/app/actions/budget-items"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"
import type { BudgetItemSummaryRow } from "@/services/ministries/budget-items.service"
import type { BudgetSubItemSummaryRow } from "@/services/ministries/budget-sub-items.service"
import { BudgetCopyPanel, type BudgetCopySource } from "./budget-copy-panel"
import { BudgetItemDialog } from "./budget-item-dialog"
import { BudgetRowSubItems } from "./budget-row-sub-items"
import { SubItemDialog, type EditableSubItem, type SubItemParentRef } from "./sub-item-dialog"
import {
  buildBudgetRows,
  pendingEdits,
  sumTotals,
  type BudgetRow,
  type Draft,
  type SubItemRow
} from "./budget-rows"

type Ministry = { id: string; name: string; is_active: boolean }
type BudgetPeriod = {
  id: string
  year: number
  label: string
  start_date: string
  end_date: string
}

type Props = {
  ministries: Ministry[]
  periods: BudgetPeriod[]
  selectedPeriod: BudgetPeriod | null
  suggestedYear: number
  summary: MinistryBudgetSummaryRow[]
  itemSummary: BudgetItemSummaryRow[]
  subItemSummary: BudgetSubItemSummaryRow[]
  // Category and notes of each active sub-item (the summary doesn't carry them).
  subItemDetails: { id: string; category_id: string | null; notes: string | null }[]
  // ministry_budgets row ids of the selected period, to attach sub-items to them.
  ministryBudgetIds: { id: string; ministry_id: string }[]
  expenseCategories: { id: string; name: string }[]
  // Read-only budget of the year to copy from (null when there is no other year).
  copySource: BudgetCopySource | null
}

export function MinistryBudgetAdmin({
  ministries,
  periods,
  selectedPeriod,
  suggestedYear,
  summary,
  itemSummary,
  subItemSummary,
  subItemDetails,
  ministryBudgetIds,
  expenseCategories,
  copySource
}: Props) {
  const router = useRouter()
  const [creatingPeriod, setCreatingPeriod] = useState(false)
  const [itemDialogOpen, setItemDialogOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<BudgetRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [copyOpen, setCopyOpen] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [subItemDialog, setSubItemDialog] = useState<{
    open: boolean
    parent: SubItemParentRef | null
    subItem: EditableSubItem | null
    confirmMessage: string | null
  }>({ open: false, parent: null, subItem: null, confirmMessage: null })
  // Only the user's pending edits; displayed values fall back to the saved ones from props,
  // so rows added or removed by a refresh never leave stale state behind.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})

  const budgetRows = buildBudgetRows(ministries, summary, itemSummary, subItemSummary)
  const totals = sumTotals(budgetRows)
  // The copy panel opens by itself on a year with no budget yet, or on demand.
  const showCopyPanel =
    !!selectedPeriod && (copyOpen || (summary.length === 0 && itemSummary.length === 0))

  function assignedOf(r: BudgetRow) {
    return drafts[r.id]?.assigned ?? (r.assigned === null ? "" : String(r.assigned))
  }
  function initialOf(r: BudgetRow) {
    return drafts[r.id]?.initial ?? String(r.initial)
  }
  function setDraft(id: string, patch: Draft) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))
  }

  async function handleCreatePeriod() {
    setCreatingPeriod(true)
    try {
      await createBudgetPeriod({ year: suggestedYear })
      toast.success(`Presupuesto ${suggestedYear} creado`)
      router.push(`/budgets?year=${suggestedYear}`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear el presupuesto")
    } finally {
      setCreatingPeriod(false)
    }
  }

  async function handleSaveBudgets() {
    if (!selectedPeriod) return
    setSaving(true)
    try {
      await Promise.all(
        pendingEdits(budgetRows, drafts).map((e) =>
          e.kind === "ministry"
            ? upsertMinistryBudget({
                ministry_id: e.id,
                budget_period_id: selectedPeriod.id,
                assigned_amount: e.assigned,
                initial_used_amount: e.initial
              })
            : updateBudgetItemAmounts({
                id: e.id,
                assigned_amount: e.assigned,
                initial_used_amount: e.initial
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

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  function parentRefOf(r: BudgetRow): SubItemParentRef | null {
    if (r.kind === "item") return { kind: "item", budgetItemId: r.id, name: r.name }
    if (!selectedPeriod) return null
    return {
      kind: "ministry",
      ministryId: r.id,
      periodId: selectedPeriod.id,
      ministryBudgetId: ministryBudgetIds.find((b) => b.ministry_id === r.id)?.id ?? null,
      name: r.name
    }
  }

  function openAddSubItem(r: BudgetRow) {
    // The first sub-item replaces a stored amount with the sum of the sub-items: confirm first.
    const replacesAmount = !r.derived && (r.assigned ?? 0) > 0
    setSubItemDialog({
      open: true,
      parent: parentRefOf(r),
      subItem: null,
      confirmMessage: replacesAmount
        ? `El total de este ${r.kind === "ministry" ? "ministerio" : "ítem"} pasará a ser la suma de sus sub-ítems`
        : null
    })
  }

  function openEditSubItem(r: BudgetRow, c: SubItemRow) {
    const details = subItemDetails.find((d) => d.id === c.id)
    setSubItemDialog({
      open: true,
      parent: parentRefOf(r),
      confirmMessage: null,
      subItem: {
        id: c.id,
        name: c.name,
        assigned: c.assigned,
        categoryId: details?.category_id ?? null,
        notes: details?.notes ?? null
      }
    })
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
            {selectedPeriod ? (
              <>
                <p className="text-sm font-bold text-foreground">{selectedPeriod.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(selectedPeriod.start_date)} – {formatDate(selectedPeriod.end_date)}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-bold text-foreground">No hay presupuestos</p>
                <p className="text-xs text-muted-foreground">
                  Crea uno para poder cargar montos por ministerio
                </p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {periods.length > 0 && (
            <select
              aria-label="Año del presupuesto"
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
              value={selectedPeriod?.year ?? ""}
              onChange={(e) => router.push(`/budgets?year=${e.target.value}`)}
            >
              {periods.map((p) => (
                <option key={p.id} value={p.year}>
                  {p.year}
                </option>
              ))}
            </select>
          )}
          {selectedPeriod && periods.length > 1 && (
            <Button variant="outline" onClick={() => setCopyOpen((v) => !v)}>
              Copiar desde otro año
            </Button>
          )}
          <Button
            variant={selectedPeriod ? "outline" : "default"}
            onClick={handleCreatePeriod}
            disabled={creatingPeriod}
          >
            {creatingPeriod ? "Creando..." : `Crear presupuesto ${suggestedYear}`}
          </Button>
        </div>
      </div>

      {!selectedPeriod ? (
        <Empty>
          <EmptyMedia>
            <Wallet className="size-10 text-muted-foreground" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No hay presupuestos</EmptyTitle>
            <EmptyDescription>
              Crea un presupuesto arriba para poder cargar montos por ministerio.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div
          className={
            showCopyPanel ? "grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]" : undefined
          }
        >
          <div className="min-w-0 rounded-2xl bg-card border border-border overflow-hidden">
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
                    <Fragment key={`${r.kind}-${r.id}`}>
                      <tr>
                        <td className="px-5 py-3 font-medium">
                          <button
                            type="button"
                            className="mr-1.5 inline-flex align-middle text-muted-foreground"
                            aria-expanded={expanded.has(r.id)}
                            aria-label={`${expanded.has(r.id) ? "Contraer" : "Expandir"} ${r.name}`}
                            onClick={() => toggleExpanded(r.id)}
                          >
                            {expanded.has(r.id) ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                          {r.name}
                          {r.children.length > 0 && (
                            <span className="ml-2 text-xs font-normal text-muted-foreground">
                              {r.children.length} sub-ítem{r.children.length === 1 ? "" : "s"}
                            </span>
                          )}
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
                          {r.derived ? (
                            <span
                              className="block font-medium"
                              title="Suma de sus sub-ítems"
                              data-testid={`assigned-derived-${r.id}`}
                            >
                              {formatCLP(r.assigned ?? 0)}
                            </span>
                          ) : (
                            <Input
                              type="number"
                              min="0"
                              step="1"
                              aria-label={`Asignado ${r.name}`}
                              className="w-32 ml-auto text-right"
                              value={assignedOf(r)}
                              onChange={(e) => setDraft(r.id, { assigned: e.target.value })}
                            />
                          )}
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
                      {expanded.has(r.id) && (
                        <BudgetRowSubItems
                          row={r}
                          onAdd={openAddSubItem}
                          onEdit={openEditSubItem}
                        />
                      )}
                    </Fragment>
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
          {showCopyPanel && (
            <BudgetCopyPanel
              ministries={ministries}
              targetPeriod={{ id: selectedPeriod.id, year: selectedPeriod.year }}
              sourcePeriods={periods.filter((p) => p.id !== selectedPeriod.id)}
              source={copySource}
            />
          )}
        </div>
      )}

      <SubItemDialog
        open={subItemDialog.open}
        onOpenChange={(open) => setSubItemDialog((prev) => ({ ...prev, open }))}
        parent={subItemDialog.parent}
        categories={expenseCategories}
        subItem={subItemDialog.subItem}
        confirmMessage={subItemDialog.confirmMessage}
      />

      {selectedPeriod && (
        <BudgetItemDialog
          open={itemDialogOpen}
          onOpenChange={setItemDialogOpen}
          periodId={selectedPeriod.id}
          categories={expenseCategories}
          item={editingItem}
        />
      )}
    </div>
  )
}
