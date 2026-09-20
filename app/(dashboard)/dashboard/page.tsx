import { redirect } from "next/navigation"
import { dashboardService } from "@/services/dashboard/dashboard.service"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import {
  IncomeExpenseChart,
  CategoryChart,
  BalanceHistoryChart
} from "@/components/dashboard/dashboard-charts"
import { SeveranceReserveCard } from "@/components/dashboard/severance-reserve-card"
import { MinistryLeftoverWidget } from "@/components/dashboard/ministry-leftover-widget"
import { MovementsTable } from "@/components/movements/movements-table"
import { DashboardFilterBar } from "@/components/dashboard/dashboard-filter-bar"
import { TrendingUp, TrendingDown } from "lucide-react"
import { formatCLP } from "@/lib/utils"

type DashboardSearchParams = {
  from?: string
  to?: string
}

export default async function DashboardPage({
  searchParams
}: {
  searchParams?: Promise<DashboardSearchParams>
}) {
  const from = (await searchParams)?.from
  const to = (await searchParams)?.to
  const user = await getCurrentUser()
  if (!user) redirect("/")
  if (!can(user.permissions, PERMISSIONS.VIEW_DASHBOARD)) {
    // MINISTER/DELEGATE lack VIEW_DASHBOARD by default — land them on their own
    // ministry page instead of the general dashboard they can't see.
    const db = await createSupabaseServerClient()
    const assignment = await ministriesService.getMinistryForUser(db, user.id)
    redirect(assignment ? `/ministries/${assignment.ministry_id}` : "/requests")
  }
  const canWrite = can(user?.permissions, PERMISSIONS.CREATE_MOVEMENT) ?? false
  const canViewFinanceWidgets = can(user?.permissions, PERMISSIONS.VIEW_MOVEMENT) ?? false
  const data = await dashboardService.getSummary(
    { from, to },
    { includeFinanceWidgets: canViewFinanceWidgets }
  )

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-[22px]">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
            Dashboard
          </h1>
          <p className="text-[13.5px] text-muted-foreground">Resumen financiero de actividades</p>
        </div>

        <DashboardFilterBar defaultFrom={from} defaultTo={to} />
      </div>

      <div className="flex flex-wrap gap-3.5 mb-3.5">
        {/* Merged KPI surface — saldo / ingresos / egresos */}
        <div className="flex-[2.4_1_460px] min-w-0 rounded-[18px] bg-card border border-border overflow-hidden grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))]">
          <div className="bg-primary text-primary-foreground px-5 py-[18px]">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-primary-foreground/70 mb-[10px]">
              Saldo actual
            </p>
            <p className="font-heading text-[26px] font-extrabold tracking-tight tabular-nums mb-3">
              {formatCLP(data.kpis.currentBalance)}
            </p>
            <p className="text-xs text-primary-foreground/65">Al cierre del período</p>
          </div>

          <div className="px-5 py-[18px]">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
                Ingresos
              </p>
              <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-income-surface">
                <TrendingUp className="size-3.5 text-income" />
              </div>
            </div>
            <p className="font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums mb-1.5">
              {formatCLP(data.kpis.totalIncome)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.kpis.movementCount} movimientos en el período
            </p>
          </div>

          <div className="px-5 py-[18px] border-l border-border">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
                Egresos
              </p>
              <div className="flex size-[26px] items-center justify-center rounded-[8px] bg-expense-surface">
                <TrendingDown className="size-3.5 text-expense" />
              </div>
            </div>
            <p className="font-heading text-2xl font-extrabold tracking-tight text-foreground tabular-nums mb-1.5">
              {formatCLP(data.kpis.totalExpense)}
            </p>
            <p className="text-xs text-muted-foreground">En el período seleccionado</p>
          </div>
        </div>

        {canViewFinanceWidgets && data.severanceBalance !== null && (
          <div className="flex-[1_1_240px] min-w-0">
            <SeveranceReserveCard balance={data.severanceBalance} />
          </div>
        )}
      </div>

      <div className="rounded-[14px] bg-card border border-border px-5 py-[18px] mb-3.5">
        <h2 className="font-heading text-[14px] font-bold tracking-tight text-foreground mb-0.5">
          Historial de saldo
        </h2>
        <p className="text-xs text-muted-foreground mb-3.5">
          Saldo acumulado al cierre de cada mes
        </p>
        <BalanceHistoryChart data={data.incomeExpenseSeries} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-3.5 mb-3.5">
        <div className="rounded-[14px] bg-card border border-border px-5 py-[18px] flex flex-col">
          <h2 className="font-heading text-[14px] font-bold tracking-tight text-foreground mb-0.5">
            Ingresos vs Egresos
          </h2>
          <p className="text-xs text-muted-foreground mb-3.5">Tendencia por período</p>
          <IncomeExpenseChart data={data.incomeExpenseSeries} />
        </div>
        <div className="rounded-[14px] bg-card border border-border px-5 py-[18px] flex flex-col">
          <h2 className="font-heading text-[14px] font-bold tracking-tight text-foreground mb-0.5">
            Egresos por categoría
          </h2>
          <p className="text-xs text-muted-foreground mb-3.5">
            Distribución del período · {formatCLP(data.kpis.totalExpense)}
          </p>
          <CategoryChart data={data.categoryBreakdown} />
        </div>
      </div>

      {canViewFinanceWidgets && data.ministryLeftoverTotals && (
        <div className="mb-3.5">
          <MinistryLeftoverWidget totals={data.ministryLeftoverTotals} />
        </div>
      )}

      <MovementsTable
        title="Últimos movimientos"
        viewAllHref="/movements"
        canWrite={canWrite}
        rows={data.recentMovements.map((row) => ({
          id: row.id,
          movement_date: row.movement_date,
          movement_type: row.movement_type,
          amount: String(row.amount),
          category_name: (row.movement_categories as { name: string } | null)?.name ?? "—",
          subcategory_name: (row.movement_subcategories as { name: string } | null)?.name ?? null,
          delivered_by: null,
          receipt_email: null,
          payment_method_name: null,
          notes: null,
          cancellation_reason: null,
          status: row.status,
          created_by: {
            full_name: (row.created_by as { full_name: string } | null)?.full_name ?? ""
          }
        }))}
      />
    </div>
  )
}
