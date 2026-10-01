import { NextResponse } from "next/server"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, canAccessWorkflow, isMinisterWorkflowUser } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { settlementsService } from "@/services/settlements/settlements.service"
import { ministriesService } from "@/services/ministries/ministries.service"

type DB = Awaited<ReturnType<typeof createSupabaseServerClient>>

// What the user owes as a minister: only DRAFT and RETURNED_FOR_CORRECTION need their own
// action — PENDING and IN_REVIEW are already out of their hands, waiting on tesorería.
async function getMinisterItems(db: DB, userId: string) {
  const assignment = await ministriesService.getMinistryForUser(db, userId)
  if (!assignment) return []

  const [intentionsPending, settlementsDraft, settlementsReturned] = await Promise.all([
    intentionsService.list(db, { ministryId: assignment.ministry_id, status: "APPROVED" }),
    settlementsService.list(db, { status: "DRAFT", submittedBy: userId }),
    settlementsService.list(db, { status: "RETURNED_FOR_CORRECTION", submittedBy: userId })
  ])

  return [
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
}

// What the user owes as a reviewer (tesorería): pending reviews and missing transfers.
async function getReviewerItems(db: DB) {
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

  const isMinister = isMinisterWorkflowUser(user.permissions)
  const isReviewer = can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS)

  // A user can be both (e.g. MINISTER + BURSAR): they get their own to-dos plus the review queue.
  if (isMinister && !isReviewer) {
    const items = await getMinisterItems(db, user.id)
    return NextResponse.json({ count: items.length, items })
  }

  const reviewer = await getReviewerItems(db)
  if (!isMinister) return NextResponse.json(reviewer)

  const ministerItems = await getMinisterItems(db, user.id)
  return NextResponse.json({
    count: reviewer.count + ministerItems.length,
    items: [...ministerItems, ...reviewer.items]
  })
}
