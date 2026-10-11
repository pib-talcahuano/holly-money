import Link from "next/link"
import { HandCoins } from "lucide-react"
import { cn, formatCLP, avatarColorFor, initialsFor } from "@/lib/utils"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"

type MinistryLeftoverTotal = {
  ministry_id: string
  ministry_name: string
  transferred: number
  settled: number
  leftover: number
}

export function MinistryLeftoverWidget({ totals }: { totals: MinistryLeftoverTotal[] }) {
  const grandTransferred = totals.reduce((sum, t) => sum + t.transferred, 0)
  const grandSettled = totals.reduce((sum, t) => sum + t.settled, 0)
  const grandTotal = totals.reduce((sum, t) => sum + t.leftover, 0)

  return (
    <div className="rounded-[14px] bg-card border border-border overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <h2 className="font-heading text-[15px] font-bold tracking-tight text-foreground">
            Remanentes por ministerio
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Fondos transferidos aún no rendidos
          </p>
        </div>
        <Link
          href="/ministries"
          className="py-2 -my-2 text-[12.5px] font-semibold text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
        >
          Ver ministerios →
        </Link>
      </div>

      {totals.length === 0 ? (
        <Empty className="border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoins />
            </EmptyMedia>
            <EmptyTitle>Sin remanentes</EmptyTitle>
            <EmptyDescription>
              No hay fondos transferidos a ministerios pendientes de rendir.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="hidden sm:grid grid-cols-[minmax(0,1fr)_90px_90px_100px] gap-3 px-5 py-3.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-faint">
            <span>Ministerio</span>
            <span className="text-right">Transferido</span>
            <span className="text-right">Rendido</span>
            <span className="text-right">Remanente</span>
          </div>
          {totals.map((t) => {
            const pct = t.transferred > 0 ? Math.min(100, (t.settled / t.transferred) * 100) : 0
            return (
              <Link
                key={t.ministry_id}
                href={`/ministries/${t.ministry_id}`}
                className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_90px_90px_100px] gap-3 items-center px-5 py-3.5 border-t border-border text-[13px] hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-extrabold text-white"
                    style={{ background: avatarColorFor(t.ministry_name) }}
                  >
                    {initialsFor(t.ministry_name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-foreground truncate mb-1">{t.ministry_name}</div>
                    <div className="flex items-center gap-2">
                      <div className="h-[5px] w-full max-w-[120px] rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-[11px] font-bold text-faint whitespace-nowrap">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <span className="text-right text-muted-foreground tabular-nums hidden sm:block">
                  {formatCLP(t.transferred)}
                </span>
                <span className="text-right text-muted-foreground tabular-nums hidden sm:block">
                  {formatCLP(t.settled)}
                </span>
                <span
                  className={cn(
                    "text-right font-bold tabular-nums hidden sm:block",
                    t.leftover > 0 ? "text-warn" : t.leftover < 0 ? "text-destructive" : "text-foreground"
                  )}
                >
                  {formatCLP(t.leftover)}
                </span>
              </Link>
            )
          })}
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_90px_90px_100px] gap-3 items-center px-5 py-3.5 border-t border-border text-[13px] bg-muted/40">
            <span className="font-extrabold">Total</span>
            <span className="text-right font-bold hidden sm:block">{formatCLP(grandTransferred)}</span>
            <span className="text-right font-bold hidden sm:block">{formatCLP(grandSettled)}</span>
            <span className="text-right font-extrabold text-warn">{formatCLP(grandTotal)}</span>
          </div>
        </>
      )}
    </div>
  )
}
