"use client"

import dynamic from "next/dynamic"

// Recharts is ~110 KB gzipped. Loading it on demand lets the KPIs, category bars and
// movements table paint without waiting for it; each placeholder reserves the chart's
// exact height so nothing shifts when it arrives.
export const IncomeExpenseChart = dynamic(
  () => import("@/components/dashboard/dashboard-charts").then((mod) => mod.IncomeExpenseChart),
  { ssr: false, loading: () => <div className="h-[170px] w-full" aria-hidden /> }
)

export const BalanceHistoryChart = dynamic(
  () => import("@/components/dashboard/dashboard-charts").then((mod) => mod.BalanceHistoryChart),
  { ssr: false, loading: () => <div className="h-[150px] w-full" aria-hidden /> }
)
