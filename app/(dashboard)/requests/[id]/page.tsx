import { notFound, redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, canAccessWorkflow, isMinisterScoped } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { settlementsService } from "@/services/settlements/settlements.service"
import { ministriesService } from "@/services/ministries/ministries.service"
import { IntentionDetailClient } from "@/components/intentions/intention-detail-client"

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user || !canAccessWorkflow(user.permissions)) redirect("/dashboard")

  const { id } = await params
  const db = await createSupabaseServerClient()
  let intention

  try {
    intention = await intentionsService.getById(db, id)
  } catch {
    notFound()
  }

  const canCreateSettlement = can(user.permissions, PERMISSIONS.CREATE_SETTLEMENT)
  // Segregation of duties: someone who is both minister and reviewer can't review their own
  // request (also enforced in the service layer and by DB triggers).
  const canReview =
    can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS) && intention.requested_by !== user.id
  const canCreateRequest = can(user.permissions, PERMISSIONS.CREATE_REQUEST)

  if (isMinisterScoped(user.permissions)) {
    const assignment = await ministriesService.getMinistryForUser(db, user.id)
    if (!assignment || assignment.ministry_id !== intention.ministry_id) {
      redirect("/requests")
    }
  }

  const [comments, transfer, settlements] = await Promise.all([
    intentionsService.getComments(db, id, "INTENTION"),
    intentionsService.getTransfer(db, id),
    settlementsService.list(db, { intentionId: id })
  ])

  const settlementComments = await settlementsService.getCommentsBySettlementIds(
    db,
    settlements.map((s) => s.id)
  )

  return (
    <IntentionDetailClient
      intention={intention}
      comments={comments}
      transfer={transfer}
      settlements={settlements}
      settlementComments={settlementComments}
      canReview={canReview}
      canSubmit={canCreateSettlement}
      canCreateRequest={canCreateRequest}
      currentUserId={user.id}
    />
  )
}
