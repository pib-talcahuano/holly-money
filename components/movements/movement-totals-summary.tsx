import { cn, formatCLP } from "@/lib/utils"
import type { MovementTotals } from "@/types/movement-totals"

type Props = {
  totals: MovementTotals
  movementType: "ALL" | "INCOME" | "EXPENSE"
}

function recordsLabel(count: number) {
  return `${count} ${count === 1 ? "registro" : "registros"}`
}

function TotalCard({
  label,
  amount,
  caption,
  className
}: {
  label: string
  amount: number
  caption: string
  className?: string
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 rounded-xl border border-border bg-card px-4 py-3.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn("break-words text-[22px] font-bold leading-tight tabular-nums", className)}
      >
        {formatCLP(amount)}
      </span>
      <span className="text-xs text-muted-foreground">{caption}</span>
    </div>
  )
}

export function MovementTotalsSummary({ totals, movementType }: Props) {
  const showIncome = movementType !== "EXPENSE"
  const showExpense = movementType !== "INCOME"
  const matches = (showIncome ? totals.income.count : 0) + (showExpense ? totals.expense.count : 0)
  if (totals.income.count + totals.expense.count === 0) return null

  return (
    <section aria-label="Totales de la búsqueda" className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row">
        {showIncome && (
          <TotalCard
            label="Ingresos"
            amount={totals.income.total}
            caption={recordsLabel(totals.income.count)}
            className="text-on-income"
          />
        )}
        {showExpense && (
          <TotalCard
            label="Egresos"
            amount={totals.expense.total}
            caption={recordsLabel(totals.expense.count)}
            className="text-on-expense"
          />
        )}
        {movementType === "ALL" && (
          <TotalCard label="Neto" amount={totals.net} caption="Ingresos menos egresos" />
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {matches === 1
          ? "Suma de la 1 coincidencia de todo el historial, no solo de esta página. Los movimientos anulados no suman."
          : `Suma de las ${matches} coincidencias de todo el historial, no solo de esta página. Los movimientos anulados no suman.`}
      </p>
    </section>
  )
}
