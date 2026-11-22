import { formatCLP } from "@/lib/utils"
import type { TithersTotals } from "@/types/tithers"

const LABEL = "text-[10.5px] font-bold uppercase tracking-[0.06em]"

export function TithersSummary({ totals, year }: { totals: TithersTotals; year: number }) {
  return (
    <section
      aria-label="Resumen de diezmos"
      className="grid grid-cols-1 overflow-hidden rounded-[18px] border border-border bg-card sm:grid-cols-[1.4fr_1fr_1fr]"
    >
      <div className="bg-primary px-5 py-[18px] text-primary-foreground">
        <p className={`${LABEL} mb-2.5 text-primary-foreground/70`}>Total de diezmos</p>
        <p className="mb-3 break-words font-heading text-[26px] font-extrabold tracking-tight tabular-nums">
          {formatCLP(totals.total)}
        </p>
        <p className="text-xs text-primary-foreground/65">En {year}</p>
      </div>
      <div className="px-5 py-[18px]">
        <p className={`${LABEL} mb-3 text-faint`}>Diezmadores</p>
        <p className="mb-1.5 font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
          {totals.titherCount}
        </p>
        <p className="text-xs text-muted-foreground">Sin contar “Sin nombre”</p>
      </div>
      <div className="border-t border-border px-5 py-[18px] sm:border-t-0 sm:border-l">
        <p className={`${LABEL} mb-3 text-faint`}>Diezmos registrados</p>
        <p className="mb-1.5 font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums">
          {totals.count}
        </p>
        <p className="text-xs text-muted-foreground">En el año</p>
      </div>
    </section>
  )
}
