import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, canAccessWorkflow, isMinisterScoped } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { ministriesService } from "@/services/ministries/ministries.service"
import { IntentionsClient } from "@/components/intentions/intentions-client"

export default async function RequestsPage() {
  const user = await getCurrentUser()
  if (!user || !canAccessWorkflow(user.permissions)) redirect("/dashboard")

  const db = await createSupabaseServerClient()

  if (can(user.permissions, PERMISSIONS.CREATE_REQUEST)) {
    const assignment = await ministriesService.getMinistryForUser(db, user.id)

    // A minister who is also a reviewer (e.g. MINISTER + BURSAR) sees every request but can
    // still create requests for their own ministry.
    const viewAll = !isMinisterScoped(user.permissions)
    const intentions = viewAll
      ? await intentionsService.list(db)
      : assignment
        ? await intentionsService.list(db, { ministryId: assignment.ministry_id })
        : []

    return (
      <IntentionsClient
        canCreateRequest={true}
        viewAll={viewAll}
        intentions={intentions}
        ministry={assignment?.ministries ?? null}
      />
    )
  }

  const intentions = await intentionsService.list(db)

  return <IntentionsClient canCreateRequest={false} intentions={intentions} ministry={null} />
}
