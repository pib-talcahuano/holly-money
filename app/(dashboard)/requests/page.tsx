import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, canAccessWorkflow, isOwnMinistryScoped } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { ministriesService } from "@/services/ministries/ministries.service"
import { IntentionsClient } from "@/components/intentions/intentions-client"

export default async function RequestsPage() {
  const user = await getCurrentUser()
  if (!user || !canAccessWorkflow(user.permissions)) redirect("/dashboard")

  const db = await createSupabaseServerClient()

  // Reviewers (bursar, admin) keep the full list even when they also hold MINISTER; they create
  // requests for their own ministry from /ministries/[id].
  if (
    can(user.permissions, PERMISSIONS.CREATE_REQUEST) && isOwnMinistryScoped(user)
  ) {
    const assignment = await ministriesService.getMinistryForUser(db, user.id)

    const intentions = assignment
      ? await intentionsService.list(db, { ministryId: assignment.ministry_id })
      : []

    return (
      <IntentionsClient
        canCreateRequest={true}
        intentions={intentions}
        ministry={assignment?.ministries ?? null}
      />
    )
  }

  const intentions = await intentionsService.list(db)

  return <IntentionsClient canCreateRequest={false} intentions={intentions} ministry={null} />
}
