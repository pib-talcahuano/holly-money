import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"
import { budgetItemsService } from "@/services/ministries/budget-items.service"
import { budgetSubItemsService } from "@/services/ministries/budget-sub-items.service"
import { MinistryBudgetAdmin } from "@/components/ministries/ministry-budget-admin"

type Props = { searchParams: Promise<{ year?: string }> }

export default async function BudgetsPage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)) redirect("/dashboard")

  const { year } = await searchParams
  const db = await createSupabaseServerClient()
  const [ministries, periods, currentPeriod, expenseCategories] = await Promise.all([
    ministriesService.list(db),
    ministryBudgetService.listPeriods(db),
    ministryBudgetService.getCurrentPeriod(db),
    budgetItemsService.listExpenseCategories(db)
  ])

  // Selected year: ?year= if it matches an existing period, else the period containing today,
  // else the most recent one (periods come ordered by year desc).
  const selectedPeriod =
    periods.find((p) => String(p.year) === year) ??
    periods.find((p) => p.id === currentPeriod?.id) ??
    periods[0] ??
    null
  const suggestedYear = periods.length > 0 ? periods[0].year + 1 : new Date().getFullYear()

  const [budgetSummary, itemSummary, subItemSummary, subItemDetails, ministryBudgetIds] =
    selectedPeriod
      ? await Promise.all([
          ministryBudgetService.getSummary(selectedPeriod.id),
          budgetItemsService.getSummary(selectedPeriod.id),
          budgetSubItemsService.getSummary(selectedPeriod.id),
          budgetSubItemsService.listDetails(db),
          ministryBudgetService.listBudgetIds(db, selectedPeriod.id)
        ])
      : [[], [], [], [], []]

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
          Presupuesto
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          Presupuesto por ministerio y otros ítems por año (marzo a febrero).
        </p>
      </div>

      <MinistryBudgetAdmin
        ministries={ministries}
        periods={periods}
        selectedPeriod={selectedPeriod}
        suggestedYear={suggestedYear}
        summary={budgetSummary}
        itemSummary={itemSummary}
        subItemSummary={subItemSummary}
        subItemDetails={subItemDetails}
        ministryBudgetIds={ministryBudgetIds}
        expenseCategories={expenseCategories}
      />
    </section>
  )
}
