import { formatCLP } from "@/lib/utils"
import type { MinistryBudgetSummaryRow } from "@/services/ministries/ministry-budget.service"

export type BreakdownSubItem = {
  id: string
  name: string
  assigned_amount: number
  used_amount: number
  remaining: number
}

const remainingClass = (value: number) => (value < 0 ? "text-destructive" : "")

// Read-only: the ministry's sub-items, the spend no sub-item claims, and the totals.
export function MinistryBudgetBreakdown({
  budget,
  subItems
}: {
  budget: MinistryBudgetSummaryRow
  subItems: BreakdownSubItem[]
}) {
  if (subItems.length === 0) return null
  return (
    <div className="rounded-2xl bg-card border border-border overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h2 className="text-[13px] font-bold text-foreground">Sub-ítems del presupuesto</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm" data-testid="ministry-sub-items">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase tracking-wide">
            <tr>
              <th className="px-5 py-2.5 text-left font-medium">Nombre</th>
              <th className="px-5 py-2.5 text-right font-medium">Asignado</th>
              <th className="px-5 py-2.5 text-right font-medium">Usado</th>
              <th className="px-5 py-2.5 text-right font-medium">Restante</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {subItems.map((s) => (
              <tr key={s.id}>
                <td className="px-5 py-3 font-medium">{s.name}</td>
                <td className="px-5 py-3 text-right tabular-nums">
                  {formatCLP(s.assigned_amount)}
                </td>
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                  {formatCLP(s.used_amount)}
                </td>
                <td
                  className={`px-5 py-3 text-right tabular-nums font-medium ${remainingClass(s.remaining)}`}
                >
                  {formatCLP(s.remaining)}
                </td>
              </tr>
            ))}
            {budget.initial_used_amount > 0 && (
              <tr>
                <td className="px-5 py-3 italic text-muted-foreground">Usado inicial</td>
                <td />
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                  {formatCLP(budget.initial_used_amount)}
                </td>
                <td />
              </tr>
            )}
            {budget.unassigned_used > 0 && (
              <tr>
                <td className="px-5 py-3 italic text-muted-foreground">Sin asignar</td>
                <td />
                <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                  {formatCLP(budget.unassigned_used)}
                </td>
                <td />
              </tr>
            )}
          </tbody>
          <tfoot className="bg-muted/50 text-sm font-bold">
            <tr>
              <td className="px-5 py-3">Total</td>
              <td className="px-5 py-3 text-right tabular-nums">
                {formatCLP(budget.assigned_amount)}
              </td>
              <td className="px-5 py-3 text-right tabular-nums">{formatCLP(budget.used_amount)}</td>
              <td
                className={`px-5 py-3 text-right tabular-nums ${remainingClass(budget.remaining)}`}
              >
                {formatCLP(budget.remaining)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
