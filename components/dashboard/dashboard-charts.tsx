"use client"

import { memo, useMemo } from "react"
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  XAxis,
  YAxis
} from "recharts"

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart"
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyMedia } from "@/components/ui/empty"
import { BarChart2, TrendingUp as TrendUpIcon } from "lucide-react"

type SeriesItem = { name: string; income: number; expense: number }
const incomeExpenseConfig = {
  income: {
    label: "Ingresos",
    color: "var(--income)"
  },
  expense: {
    label: "Egresos",
    color: "var(--expense)"
  }
} satisfies ChartConfig

export const IncomeExpenseChart = memo(function IncomeExpenseChart({
  data
}: {
  data: SeriesItem[]
}) {
  if (!data.length) {
    return (
      <Empty className="border-dashed h-[170px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BarChart2 />
          </EmptyMedia>
          <EmptyTitle>Sin datos</EmptyTitle>
          <EmptyDescription>No hay movimientos en el período seleccionado.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="h-[170px] w-full">
      <ChartContainer config={incomeExpenseConfig} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 0, left: 0, bottom: 0 }} barGap={5}>
            <XAxis
              dataKey="name"
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
              content={<ChartTooltipContent indicator="dashed" />}
            />
            <Legend
              verticalAlign="top"
              align="right"
              iconType="square"
              content={({ payload }) => (
                <div className="flex justify-end gap-3.5 mb-2">
                  {[...(payload ?? [])]
                    .sort((a, b) => (a.dataKey === "income" ? -1 : b.dataKey === "income" ? 1 : 0))
                    .map((entry, index) => {
                    const key = entry.dataKey as keyof typeof incomeExpenseConfig
                    const label = incomeExpenseConfig[key]?.label ?? entry.value
                    return (
                      <div key={index} className="flex items-center gap-1.5">
                        <div
                          className="size-[9px] rounded-[3px]"
                          style={{ backgroundColor: entry.color }}
                        />
                        <span className="text-[11.5px] font-semibold text-muted-foreground">
                          {label}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            />
            <Bar
              dataKey="income"
              name="Ingresos"
              fill="var(--color-income)"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
            <Bar
              dataKey="expense"
              name="Egresos"
              fill="var(--color-expense)"
              radius={[4, 4, 0, 0]}
              barSize={20}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
})

const balanceConfig = {
  balance: {
    label: "Saldo",
    color: "var(--color-primary)"
  }
} satisfies ChartConfig

export const BalanceHistoryChart = memo(function BalanceHistoryChart({
  data
}: {
  data: SeriesItem[]
}) {
  const balanceSeries = useMemo(() => {
    let running = 0
    return data.map((item) => {
      running += item.income - item.expense
      return { name: item.name, balance: running }
    })
  }, [data])

  if (!balanceSeries.length) {
    return (
      <Empty className="border-dashed h-[150px]">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <TrendUpIcon />
          </EmptyMedia>
          <EmptyTitle>Sin datos</EmptyTitle>
          <EmptyDescription>No hay movimientos en el período seleccionado.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <div className="h-[150px] w-full">
      <ChartContainer config={balanceConfig} className="h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={balanceSeries} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke="hsl(var(--outline-variant) / 0.3)"
            />
            <XAxis
              dataKey="name"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              fontSize={10.5}
              fontWeight={700}
              stroke="var(--color-faint)"
            />
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <ChartTooltip
              cursor={{ stroke: "var(--color-primary)", strokeDasharray: "3 3" }}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Area
              type="monotone"
              dataKey="balance"
              name="Saldo"
              stroke="var(--color-primary)"
              fill="url(#balanceFill)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartContainer>
    </div>
  )
})
