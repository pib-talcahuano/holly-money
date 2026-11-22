"use client"

import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Input } from "@/components/ui/input"
import { cn, formatCLP, formatDate } from "@/lib/utils"
import { normalizeName } from "@/lib/utils/name-suggestions"
import type { Tither } from "@/types/tithers"

import { TitherDetailDialog } from "./tither-detail-dialog"
import { TitherSparkline } from "./tither-sparkline"

const HEADER = "text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-faint"
const COLUMNS = "sm:grid-cols-[minmax(0,1.6fr)_80px_130px_110px_130px]"

export function TithersTable({ tithers, year }: { tithers: Tither[]; year: number }) {
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<Tither | null>(null)

  const visible = useMemo(() => {
    const term = normalizeName(query)
    if (!term) return tithers
    return tithers.filter((tither) => normalizeName(tither.name).includes(term))
  }, [tithers, query])

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          type="search"
          aria-label="Filtrar por nombre"
          placeholder="Filtrar por nombre…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="h-10 pl-9"
        />
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        {tithers.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            No hay diezmos registrados en {year}.
          </p>
        ) : (
          <div role="table" aria-label="Diezmadores">
            <div role="rowgroup" className="hidden sm:block">
              <div
                role="row"
                className={cn("grid gap-3 border-b border-border px-5 py-3.5", COLUMNS)}
              >
                <span role="columnheader" className={HEADER}>
                  Nombre
                </span>
                <span role="columnheader" className={cn(HEADER, "text-right")}>
                  Diezmos
                </span>
                <span role="columnheader" className={cn(HEADER, "text-right")}>
                  Total
                </span>
                <span role="columnheader" className={HEADER}>
                  Tendencia
                </span>
                <span role="columnheader" className={HEADER}>
                  Último diezmo
                </span>
              </div>
            </div>
            <div role="rowgroup">
              {visible.length === 0 && (
                <p className="px-5 py-12 text-center text-sm text-muted-foreground">
                  Sin coincidencias.
                </p>
              )}
              {visible.map((tither) => (
                <div
                  key={tither.key}
                  role="row"
                  className={cn(
                    "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3.5 last:border-b-0",
                    COLUMNS,
                    tither.unnamed && "bg-primary/[0.03]"
                  )}
                >
                  <span role="cell" className="min-w-0">
                    <button
                      type="button"
                      onClick={() => setSelected(tither)}
                      className={cn(
                        "break-words text-left text-sm font-semibold",
                        tither.unnamed
                          ? "italic text-muted-foreground"
                          : "text-primary underline underline-offset-2 hover:text-primary/80"
                      )}
                    >
                      {tither.name}
                    </button>
                  </span>
                  <span
                    role="cell"
                    className="order-2 text-sm tabular-nums text-muted-foreground sm:order-none sm:text-right"
                  >
                    {tither.count}
                  </span>
                  <span
                    role="cell"
                    className="order-1 text-right font-bold tabular-nums text-foreground sm:order-none"
                  >
                    {formatCLP(tither.total)}
                  </span>
                  <span role="cell" className="order-4 sm:order-none">
                    <TitherSparkline values={tither.monthlyTotals} unnamed={tither.unnamed} />
                  </span>
                  <span
                    role="cell"
                    className="order-3 text-sm tabular-nums text-muted-foreground sm:order-none"
                  >
                    {formatDate(tither.lastDate)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <TitherDetailDialog tither={selected} year={year} onClose={() => setSelected(null)} />
    </div>
  )
}
