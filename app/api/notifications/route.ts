import { NextResponse } from "next/server"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, canAccessWorkflow, isMinisterWorkflowUser } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { settlementsService } from "@/services/settlements/settlements.service"
import { ministriesService } from "@/services/ministries/ministries.service"

type Db = Awaited<ReturnType<typeof createSupabaseServerClient>>

async function ministerSide(db: Db, userId: string) {
  const assignment = await ministriesService.getMinistryForUser(db, userId)
  if (!assignment) return { count: 0, items: [] }

  // Only DRAFT and RETURNED_FOR_CORRECTION need the minister's own action — PENDING and
  // IN_REVIEW are already out of their hands, waiting on tesorería.
  const [intentionsPending, settlementsDraft, settlementsReturned] = await Promise.all([
    intentionsService.list(db, { ministryId: assignment.ministry_id, status: "APPROVED" }),
    settlementsService.list(db, { status: "DRAFT", submittedBy: userId }),
    settlementsService.list(db, { status: "RETURNED_FOR_CORRECTION", submittedBy: userId })
  ])

  const items = [
    ...intentionsPending.map((i) => ({
      type: "INTENTION_APPROVED" as const,
      id: i.id,
      description: i.purpose,
      href: `/requests/${i.id}`,
      created_at: i.updated_at
    })),
    ...settlementsDraft.map((s) => ({
      type: "SETTLEMENT_DRAFT" as const,
      id: s.id,
      description: s.description,
      href: `/requests/${s.intention_id}`,
      created_at: s.created_at
    })),
    ...settlementsReturned.map((s) => ({
      type: "SETTLEMENT_RETURNED" as const,
      id: s.id,
      description: s.description,
      href: `/requests/${s.intention_id}`,
      created_at: s.created_at
    }))
  ]

  return { count: items.length, items }
}

async function reviewerSide(db: Db) {
  const [intentionCount, settlementCount, missingTransfers] = await Promise.all([
    intentionsService.getPendingCount(db),
    settlementsService.getPendingCount(db),
    intentionsService.getMissingTransfersCount(db)
  ])

  const items = [
    intentionCount > 0
      ? { type: "INTENTIONS_PENDING", count: intentionCount, href: "/requests?status=PENDING" }
      : null,
    settlementCount > 0
      ? {
          type: "SETTLEMENTS_PENDING",
          count: settlementCount,
          href: "/requests?tab=settlements&status=PENDING"
        }
      : null,
    missingTransfers > 0
      ? { type: "MISSING_TRANSFERS", count: missingTransfers, href: "/requests?tab=transfers" }
      : null
  ].filter(Boolean)

  return { count: intentionCount + settlementCount + missingTransfers, items }
}

export async function GET() {
  const user = await getCurrentUser()
  if (!user || !canAccessWorkflow(user.permissions)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const db = await createSupabaseServerClient()

  // A user can have both sides (e.g. bursar+minister): they get both sets of items. Anyone who
  // isn't minister-style (finance, bursar) gets the reviewer-style counts, as before.
  const hasMinisterSide = isMinisterWorkflowUser(user.permissions)
  const hasReviewerSide = can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS) || !hasMinisterSide

  const [minister, reviewer] = await Promise.all([
    hasMinisterSide ? ministerSide(db, user.id) : null,
    hasReviewerSide ? reviewerSide(db) : null
  ])

  const parts = [minister, reviewer].filter((part) => part !== null) as {
    count: number
    items: unknown[]
  }[]
  return NextResponse.json({
    count: parts.reduce((sum, part) => sum + part.count, 0),
    items: parts.flatMap((part) => part.items)
  })
}
