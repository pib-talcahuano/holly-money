"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can, isImpersonating } from "@/lib/permissions/rbac"
import { peopleService } from "@/services/people/people.service"
import { peopleMergeSchema } from "@/lib/validators/people"
import type { PeopleMergeInput } from "@/lib/validators/people"

// Expected failures are returned (not thrown): Next.js strips thrown server-action
// messages in production builds, and the UI must show the Spanish message.
export type PreviewPeopleMergeResult = { ok: true; affected: number } | { ok: false; error: string }
export type MergePeopleResult = { ok: true; updated: number } | { ok: false; error: string }

const NO_PERMISSION = "Sin permisos para unir nombres"
const IMPERSONATING = "No disponible mientras actúas como otro usuario"
const GENERIC_ERROR = "No se pudo completar la operación"

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  console.error("people action failed", error)
  return GENERIC_ERROR
}

function revalidatePeoplePaths() {
  revalidatePath("/people")
  revalidatePath("/tithers")
  revalidatePath("/movements")
}

export async function previewPeopleMerge(
  input: PeopleMergeInput
): Promise<PreviewPeopleMergeResult> {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_PEOPLE)) {
    return { ok: false, error: NO_PERMISSION }
  }
  if (isImpersonating(user)) return { ok: false, error: IMPERSONATING }

  const parsed = peopleMergeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  try {
    const db = await createSupabaseServerClient()
    const { affected } = await peopleService.preview(db, {
      movementType: parsed.data.movement_type,
      fromNames: parsed.data.from_names,
      toName: parsed.data.to_name
    })
    return { ok: true, affected }
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) }
  }
}

export async function mergePeople(input: PeopleMergeInput): Promise<MergePeopleResult> {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_PEOPLE)) {
    return { ok: false, error: NO_PERMISSION }
  }
  if (isImpersonating(user)) return { ok: false, error: IMPERSONATING }

  const parsed = peopleMergeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  try {
    const db = await createSupabaseServerClient()
    const { updated } = await peopleService.merge(db, {
      movementType: parsed.data.movement_type,
      fromNames: parsed.data.from_names,
      toName: parsed.data.to_name,
      userId: user.id
    })
    revalidatePeoplePaths()
    return { ok: true, updated }
  } catch (error) {
    // A partial failure may already have changed rows, so refresh the lists anyway.
    revalidatePeoplePaths()
    return { ok: false, error: toErrorMessage(error) }
  }
}
