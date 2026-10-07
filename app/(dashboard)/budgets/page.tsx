import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"
import { MinistryBudgetAdmin } from "@/components/ministries/ministry-budget-admin"

export default async function BudgetsPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)) redirect("/dashboard")

  const db = await createSupabaseServerClient()
  const [ministries, currentPeriod, budgetSummary] = await Promise.all([
    ministriesService.list(db),
    ministryBudgetService.getCurrentPeriod(db),
    ministryBudgetService.getSummary()
  ])

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
          Presupuesto
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          Presupuesto por ministerio para el período vigente.
        </p>
      </div>

      <MinistryBudgetAdmin
        ministries={ministries}
        currentPeriod={currentPeriod}
        summary={budgetSummary}
      />
    </section>
  )
}
