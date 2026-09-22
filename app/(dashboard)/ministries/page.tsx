import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"
import { usersService } from "@/services/users/users.service"
import { MinistriesClient } from "@/components/ministries/ministries-client"
import { USER_ROLES } from "@/lib/constants/roles"

export default async function MinistriesPage() {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_MINISTRIES)) redirect("/dashboard")

  const canManageBudgets = can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)
  const db = await createSupabaseServerClient()
  const [ministries, currentAssignments, users, currentPeriod, budgetSummary] = await Promise.all([
    ministriesService.list(db),
    ministriesService.listCurrentAssignments(db),
    usersService.list(),
    // Budget data is only rendered behind the MANAGE_BUDGETS tab, but it's cheap
    // enough (and RLS-safe for BURSAR/ADMIN) to fetch unconditionally here rather
    // than branching the Promise.all shape.
    canManageBudgets ? ministryBudgetService.getCurrentPeriod(db) : Promise.resolve(null),
    canManageBudgets ? ministryBudgetService.getSummary() : Promise.resolve([])
  ])

  const ministers = users.filter((u) => u.role === USER_ROLES.MINISTER)

  return (
    <MinistriesClient
      initialMinistries={ministries}
      initialCurrentAssignments={currentAssignments}
      ministers={ministers}
      canManageBudgets={canManageBudgets}
      currentBudgetPeriod={currentPeriod}
      budgetSummary={budgetSummary}
    />
  )
}
