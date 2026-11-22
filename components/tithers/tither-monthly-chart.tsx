"use client"

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts"

import { ChartConfig, ChartContainer, ChartTooltip } from "@/components/ui/chart"
import { formatCLP } from "@/lib/utils"

export const MONTH_INITIALS = ["e", "f", "m", "a", "m", "j", "j", "a", "s", "o", "n", "d"]
export const MONTH_ABBREVIATIONS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic"
]

const config = {
  total: { label: "Diezmos", color: "var(--primary)" }
} satisfies ChartConfig

export function TitherMonthlyChart({ monthlyTotals }: { monthlyTotals: number[] }) {
  const data = monthlyTotals.map((total, index) => ({
    name: MONTH_ABBREVIATIONS[index],
    initial: MONTH_INITIALS[index],
    total
  }))

  return (
    <div className="h-[170px] w-full">
      <ChartContainer config={config} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
            <XAxis
              dataKey="initial"
              interval={0}
              tickLine={false}
              axisLine={{ stroke: "var(--color-border)" }}
              tickMargin={6}
              fontSize={10.5}
              fontWeight={700}
              stroke="var(--color-faint)"
            />
            <YAxis hide />
            <ChartTooltip
              cursor={{ fill: "hsl(var(--on-surface-variant) / 0.05)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const item = payload[0].payload as { name: string; total: number }
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <p className="font-semibold capitalize text-foreground">{item.name}</p>
                    <p className="tabular-nums text-muted-foreground">{formatCLP(item.total)}</p>
                  </div>
                )
              }}
            />
            <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={20} />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
}
