import { notFound, redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, canAccessWorkflow, isOwnMinistryScoped } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { settlementsService } from "@/services/settlements/settlements.service"
import { ministriesService } from "@/services/ministries/ministries.service"
import { IntentionDetailClient } from "@/components/intentions/intention-detail-client"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser()
  if (!user || !canAccessWorkflow(user.permissions)) redirect("/dashboard")

  const { id } = await params
  // The queries below run in parallel, so a malformed id would fail all of them with a
  // Postgres uuid syntax error instead of a clean 404.
  if (!UUID_RE.test(id)) notFound()
  const db = await createSupabaseServerClient()
  const canCreateSettlement = can(user.permissions, PERMISSIONS.CREATE_SETTLEMENT)
  const canReview = can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS)
  const canCreateRequest = can(user.permissions, PERMISSIONS.CREATE_REQUEST)

  // One round of parallel queries instead of four sequential ones. Every query here
  // runs as the signed-in user, so RLS decides what comes back; the own-ministry
  // check below only decides whether to render it.
  const [intention, assignment, comments, transfer, settlements] = await Promise.all([
    intentionsService.getById(db, id).catch(() => null),
    isOwnMinistryScoped(user) ? ministriesService.getMinistryForUser(db, user.id) : null,
    intentionsService.getComments(db, id, "INTENTION"),
    intentionsService.getTransfer(db, id),
    settlementsService.list(db, { intentionId: id })
  ])

  if (!intention) notFound()

  if (isOwnMinistryScoped(user)) {
    if (!assignment || assignment.ministry_id !== intention.ministry_id) {
      redirect("/requests")
    }
  }

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
