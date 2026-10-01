import { NextResponse } from "next/server"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { intentionsService } from "@/services/intentions/intentions.service"
import { ministriesService } from "@/services/ministries/ministries.service"
import { createIntentionSchema, intentionFiltersSchema } from "@/lib/validators/intention"

export async function GET(request: Request) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ message: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const parsed = intentionFiltersSchema.safeParse(Object.fromEntries(searchParams))
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Invalid filters", errors: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const db = await createSupabaseServerClient()

  // A user who is both a minister and a reviewer (e.g. MINISTER + BURSAR) is not scoped to
  // their ministry: they fall through to the org-wide list below.
  if (
    can(user.permissions, PERMISSIONS.CREATE_REQUEST) &&
    !can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS)
  ) {
    const assignment = await ministriesService.getMinistryForUser(db, user.id)
    if (!assignment) return NextResponse.json([])
    const data = await intentionsService.list(db, {
      ministryId: assignment.ministry_id,
      status: parsed.data.status
    })
    return NextResponse.json(data)
  }

  if (!can(user.permissions, PERMISSIONS.REVIEW_INTENTIONS)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  const data = await intentionsService.list(db, {
    ministryId: parsed.data.ministry_id,
    status: parsed.data.status
  })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.CREATE_REQUEST)) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 })
  }

  try {
    const db = await createSupabaseServerClient()
    const assignment = await ministriesService.getMinistryForUser(db, user.id)
    if (!assignment) {
      return NextResponse.json({ message: "No ministry assigned to your account" }, { status: 400 })
    }

    const body: unknown = await request.json()
    const parsed = createIntentionSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { message: "Invalid data", errors: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const data = await intentionsService.create(db, parsed.data, user.id, assignment.ministry_id)
    return NextResponse.json(data, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error"
    return NextResponse.json({ message }, { status: 500 })
  }
}
