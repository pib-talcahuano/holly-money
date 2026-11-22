"use client"

import Link from "next/link"

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { formatCLP, formatDate } from "@/lib/utils"
import { titherMovementsHref } from "@/lib/utils/tithers"
import type { Tither } from "@/types/tithers"

import { TitherMonthlyChartLazy } from "./tither-monthly-chart-lazy"

const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre"
]

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.06em]"

type Props = { tither: Tither | null; year: number; onClose: () => void }

export function TitherDetailDialog({ tither, year, onClose }: Props) {
  return (
    <Dialog open={tither !== null} onOpenChange={(open) => !open && onClose()}>
      {tither && (
        <DialogContent className="max-h-[90vh] w-[95vw] gap-5 overflow-y-auto rounded-xl border border-border bg-card p-6 sm:max-w-xl">
          <div className="flex flex-col gap-1 pr-8">
            <DialogTitle className="break-words text-xl font-bold tracking-tight text-foreground">
              {tither.name} · {year}
            </DialogTitle>
            <DialogDescription>Diezmos mes a mes</DialogDescription>
          </div>

          <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-border">
            <div className="bg-primary px-4 py-3 text-primary-foreground">
              <p className={`${LABEL} mb-1 text-primary-foreground/70`}>Total</p>
              <p className="break-words font-heading text-lg font-extrabold tabular-nums">
                {formatCLP(tither.total)}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className={`${LABEL} mb-1 text-faint`}>Diezmos</p>
              <p className="font-heading text-lg font-extrabold tabular-nums text-foreground">
                {tither.count}
              </p>
            </div>
            <div className="px-4 py-3">
              <p className={`${LABEL} mb-1 text-faint`}>Último diezmo</p>
              <p className="text-sm font-bold tabular-nums text-foreground">
                {formatDate(tither.lastDate)}
              </p>
            </div>
          </div>

          <TitherMonthlyChartLazy monthlyTotals={tither.monthlyTotals} />

          <table className="w-full text-sm">
            <thead>
              <tr className={`${LABEL} text-left text-faint`}>
                <th scope="col" className="py-1.5 font-extrabold">
                  Mes
                </th>
                <th scope="col" className="py-1.5 text-right font-extrabold">
                  Diezmos
                </th>
                <th scope="col" className="py-1.5 text-right font-extrabold">
                  Monto
                </th>
              </tr>
            </thead>
            <tbody>
              {MONTH_NAMES.map((month, index) => {
                const empty = tither.monthlyCounts[index] === 0
                return (
                  <tr
                    key={month}
                    className={`border-t border-border ${empty ? "text-muted-foreground/60" : "text-foreground"}`}
                  >
                    <th scope="row" className="py-1.5 text-left font-medium">
                      {month}
                    </th>
                    <td className="py-1.5 text-right tabular-nums">
                      {tither.monthlyCounts[index]}
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {formatCLP(tither.monthlyTotals[index])}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {!tither.unnamed && (
            <Link
              href={titherMovementsHref(tither.name)}
              className="text-[12.5px] font-semibold text-primary hover:text-primary/80"
            >
              Ver movimientos de {tither.name}
            </Link>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
