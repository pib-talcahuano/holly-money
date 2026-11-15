import { PieChart as PieChartIcon } from "lucide-react"
import { formatCLP } from "@/lib/utils"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"

type CategoryItem = { category: string; total: number }

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)"
]

// Plain CSS bars — kept out of dashboard-charts.tsx so it doesn't pull Recharts in
// and can render on the server.
export function CategoryChart({ data }: { data: CategoryItem[] }) {
  const grandTotal = data.reduce((sum, item) => sum + item.total, 0)

  if (!data.length) {
    return (
      <Empty className="border-dashed h-[200px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <PieChartIcon />
          </EmptyMedia>
          <EmptyTitle>Sin categorías</EmptyTitle>
          <EmptyDescription>No hay datos para el período seleccionado.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="flex flex-col gap-4 w-full min-w-0">
      {data.map((item, index) => {
        const pct = grandTotal > 0 ? (item.total / grandTotal) * 100 : 0
        return (
          <div key={item.category}>
            <div className="flex items-baseline justify-between gap-2.5 mb-1">
              <span className="text-xs font-semibold text-foreground min-w-0 truncate">
                {item.category}
              </span>
              <span className="text-[11.5px] font-bold text-muted-foreground whitespace-nowrap">
                {formatCLP(item.total)}{" "}
                <span className="text-faint font-semibold">· {pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: COLORS[index % COLORS.length] }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
