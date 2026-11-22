"use client"

import dynamic from "next/dynamic"

// Recharts loads on demand; the placeholder reserves the chart's exact height.
export const TitherMonthlyChartLazy = dynamic(
  () => import("@/components/tithers/tither-monthly-chart").then((mod) => mod.TitherMonthlyChart),
  { ssr: false, loading: () => <div className="h-[170px] w-full" aria-hidden /> }
)
