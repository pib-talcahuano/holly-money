import { notFound, redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, isMinisterWorkflowUser } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { ministryLeftoverService } from "@/services/ministries/ministry-leftover.service"
import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"
import { budgetSubItemsService } from "@/services/ministries/budget-sub-items.service"
import { intentionsService } from "@/services/intentions/intentions.service"
import { usersService } from "@/services/users/users.service"
import { MinistryDetailClient } from "@/components/ministries/ministry-detail-client"

export default async function MinistryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect("/dashboard")

  const canManage = can(user.permissions, PERMISSIONS.MANAGE_MINISTRIES)
  const { id } = await params
  const db = await createSupabaseServerClient()

  // A MINISTER can't reach here via MANAGE_MINISTRIES — only via owning the assigned
  // ministry (see the "Ministerio: {name}" link on /requests). Anyone else is denied.
  if (!canManage && !isMinisterWorkflowUser(user.permissions)) redirect("/dashboard")

  // The ownership lookup runs alongside the page data instead of ahead of it; nothing
  // is rendered until it's checked right below.
  const [
    ownAssignment,
    ministry,
    assignments,
    delegates,
    users,
    leftover,
    intentions,
    associatedMovements,
    budgetSummary,
    subItemSummary
  ] = await Promise.all([
    canManage ? null : ministriesService.getMinistryForUser(db, user.id),
    ministriesService.getById(db, id).catch(() => null),
    ministriesService.getAssignments(db, id),
    ministriesService.listDelegates(db, id),
    // The full user directory (names/emails) is only needed to populate the assign-minister
    // picker — skip it for read-only viewers instead of shipping it in the page payload.
    canManage ? usersService.list() : Promise.resolve([]),
    ministryLeftoverService.getSummary(id),
    intentionsService.list(db, { ministryId: id }),
    ministriesService.getAssociatedMovements(db, id),
    ministryBudgetService.getSummary(),
    budgetSubItemsService.getSummary()
  ])

  if (!canManage && ownAssignment?.ministry_id !== id) redirect("/dashboard")

  if (!ministry) notFound()

  const ministryBudget = budgetSummary.find((row) => row.ministry_id === id) ?? null
  // The RPCs (admin client) return every ministry and item: keep only this ministry's own
  // sub-items, and only the fields the table shows, before anything reaches the client.
  const budgetSubItems = subItemSummary
    .filter((s) => s.parent_type === "MINISTRY" && s.ministry_id === id)
    .map((s) => ({
      id: s.sub_item_id,
      name: s.name,
      assigned_amount: s.assigned_amount,
      used_amount: s.used_amount,
      remaining: s.remaining
    }))

  const currentAssignment = assignments.find((a) => a.unassigned_at === null) ?? null
  const isAssignedMinister = currentAssignment?.user_id === user.id
  const canCreateRequest =
    !canManage && can(user.permissions, PERMISSIONS.CREATE_REQUEST) && isAssignedMinister

  return (
    <MinistryDetailClient
      ministry={ministry}
      users={users}
      assignments={assignments as Parameters<typeof MinistryDetailClient>[0]["assignments"]}
      currentAssignment={
        currentAssignment as Parameters<typeof MinistryDetailClient>[0]["currentAssignment"]
      }
      delegates={delegates as Parameters<typeof MinistryDetailClient>[0]["delegates"]}
      leftover={leftover}
      intentions={intentions as Parameters<typeof MinistryDetailClient>[0]["intentions"]}
      associatedMovements={
        associatedMovements as Parameters<typeof MinistryDetailClient>[0]["associatedMovements"]
      }
      budget={ministryBudget}
      budgetSubItems={budgetSubItems}
      canManage={canManage}
      isAssignedMinister={isAssignedMinister}
      canCreateRequest={canCreateRequest}
    />
  )
}
