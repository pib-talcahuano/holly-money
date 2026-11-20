"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCLP } from "@/lib/utils"
import { copyBudgetFromPeriod } from "@/app/actions/ministry-budgets"
import type { CopyResult, CopyScope } from "@/services/ministries/ministry-budget.service"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"
import type { BudgetItemSummaryRow } from "@/services/ministries/budget-items.service"
import type { BudgetSubItemSummaryRow } from "@/services/ministries/budget-sub-items.service"
import { buildBudgetRows } from "./budget-rows"

type PeriodRef = { id: string; year: number }

export type BudgetCopySource = {
  period: PeriodRef
  summary: MinistryBudgetSummaryRow[]
  itemSummary: BudgetItemSummaryRow[]
  subItemSummary: BudgetSubItemSummaryRow[]
}

type Props = {
  ministries: { id: string; name: string; is_active: boolean }[]
  targetPeriod: PeriodRef
  // Every period except the target, to pick the source year.
  sourcePeriods: PeriodRef[]
  source: BudgetCopySource | null
  // Called after a successful copy so the parent keeps the panel open once rows appear.
  onCopied?: () => void
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export function copyToastMessage({ copied, skipped }: CopyResult) {
  const total = copied.ministry_budgets + copied.budget_items + copied.sub_items
  const skippedTotal = skipped.ministry_budgets + skipped.budget_items + skipped.sub_items
  const existed = skippedTotal === 1 ? "1 ya existía" : `${skippedTotal} ya existían`
  if (total === 0)
    return skippedTotal > 0 ? `No se copió nada: ${existed}` : "No había nada que copiar"
  const parts = [
    plural(copied.ministry_budgets, "ministerio", "ministerios"),
    plural(copied.budget_items, "ítem", "ítems"),
    plural(copied.sub_items, "sub-ítem", "sub-ítems")
  ]
  const text = `Se copiaron ${parts[0]}, ${parts[1]} y ${parts[2]}`
  return skippedTotal > 0 ? `${text}; ${existed}` : text
}

export function BudgetCopyPanel({
  ministries,
  targetPeriod,
  sourcePeriods,
  source,
  onCopied
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  const rows = source
    ? buildBudgetRows(ministries, source.summary, source.itemSummary, source.subItemSummary).filter(
        (r) => r.assigned !== null
      )
    : []

  async function copy(key: string, scope: CopyScope) {
    if (!source) return
    setBusy(key)
    try {
      const result = await copyBudgetFromPeriod({
        from_period_id: source.period.id,
        to_period_id: targetPeriod.id,
        scope
      })
      toast.success(copyToastMessage(result))
      onCopied?.()
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al copiar el presupuesto")
    } finally {
      setBusy(null)
    }
  }

  return (
    <aside
      aria-label="Copiar desde otro año"
      className="min-w-0 rounded-2xl bg-card border border-border overflow-hidden"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border">
        <h2 className="text-sm font-bold text-foreground">Copiar desde otro año</h2>
        {sourcePeriods.length > 0 && (
          <select
            aria-label="Año de origen"
            className="h-8 rounded-lg border border-border bg-background px-2 text-sm"
            value={source?.period.year ?? ""}
            onChange={(e) =>
              router.push(`/budgets?year=${targetPeriod.year}&from=${e.target.value}`)
            }
          >
            {!source && <option value="">Elegir año</option>}
            {sourcePeriods.map((p) => (
              <option key={p.id} value={p.year}>
                {p.year}
              </option>
            ))}
          </select>
        )}
      </div>

      {!source ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">
          No hay otro año del que copiar el presupuesto.
        </p>
      ) : (
        <div className="p-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Solo se copian los montos asignados; lo ya existente en {targetPeriod.year} no se
            modifica. El «usado inicial» siempre parte en 0.
          </p>
          <Button
            size="sm"
            className="w-full"
            disabled={busy !== null || rows.length === 0}
            onClick={() => copy("ALL", "ALL")}
          >
            <Copy className="size-3.5" />
            {busy === "ALL" ? "Copiando..." : `Copiar todo (${source.period.year})`}
          </Button>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              El año {source.period.year} no tiene datos.
            </p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {rows.map((r) => {
                const parentScope: CopyScope =
                  r.kind === "ministry" ? { ministry_id: r.id } : { budget_item_id: r.id }
                return (
                  <li key={`${r.kind}-${r.id}`} className="px-3 py-2">
                    <CopyLine
                      label={r.name}
                      amount={r.assigned ?? 0}
                      strong
                      busy={busy !== null}
                      onCopy={() => copy(`${r.kind}-${r.id}`, parentScope)}
                    />
                    {r.children.map((c) => (
                      <div key={c.id} className="pl-4">
                        <CopyLine
                          label={c.name}
                          amount={c.assigned}
                          busy={busy !== null}
                          onCopy={() => copy(`sub-${c.id}`, { sub_item_id: c.id })}
                        />
                      </div>
                    ))}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  )
}

function CopyLine({
  label,
  amount,
  strong,
  busy,
  onCopy
}: {
  label: string
  amount: number
  strong?: boolean
  busy: boolean
  onCopy: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-1">
      <div className="min-w-0">
        <p
          className={`truncate text-sm ${strong ? "font-medium text-foreground" : "text-muted-foreground"}`}
        >
          {label}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">{formatCLP(amount)}</p>
      </div>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={onCopy}
        aria-label={`Copiar ${label}`}
      >
        Copiar
      </Button>
    </div>
  )
}
