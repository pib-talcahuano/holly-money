"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministriesService } from "@/services/ministries/ministries.service"
import { deleteMinistrySchema } from "@/lib/validators/ministry"
import type {
  CreateMinistryInput,
  UpdateMinistryInput,
  AssignMinisterInput,
  InviteDelegateInput
} from "@/lib/validators/ministry"

function assertMinistriesAccess(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_MINISTRIES)) {
    throw new Error("Sin permisos para gestionar ministerios")
  }
  return user
}

// ADMIN/BURSAR manage delegates for any ministry; a minister can additionally
// manage delegates for their own ministry (mirrors ministry_delegates_insert/
// delete RLS — see 20260722045102_add_ministry_delegates.sql).
async function assertDelegateAccess(
  user: Awaited<ReturnType<typeof getCurrentUser>>,
  db: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  ministryId: string
) {
  if (!user) throw new Error("Sin permisos para gestionar delegados")
  if (can(user.permissions, PERMISSIONS.MANAGE_MINISTRIES)) return user

  const currentAssignment = await ministriesService.getCurrentAssignment(db, ministryId)
  if (currentAssignment?.user_id === user.id) return user

  throw new Error("Sin permisos para gestionar delegados")
}

export async function createMinistry(input: CreateMinistryInput) {
  const user = assertMinistriesAccess(await getCurrentUser())
  const db = await createSupabaseServerClient()
  const data = await ministriesService.create(db, input, user.id)
  revalidatePath("/ministries")
  return data
}

export async function deleteMinistry(id: string, confirmName: string) {
  const user = assertMinistriesAccess(await getCurrentUser())
  const { confirmName: typedName } = deleteMinistrySchema.parse({ confirmName })
  const db = await createSupabaseServerClient()
  const ministry = await ministriesService.getById(db, id)
  if (typedName.trim() !== ministry.name) {
    throw new Error("El nombre no coincide")
  }
  const result = await ministriesService.delete(db, id, user.id)
  if (!result.deleted) {
    throw new Error("No se puede eliminar: tiene historial. Puedes desactivarlo.")
  }
  revalidatePath("/ministries")
}

export async function getMinistryAssignments(ministryId: string) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_MINISTRIES)) {
    throw new Error("Sin permisos")
  }
  const db = await createSupabaseServerClient()
  return ministriesService.getAssignments(db, ministryId)
}

export async function assignMinister(ministryId: string, input: AssignMinisterInput) {
  const user = assertMinistriesAccess(await getCurrentUser())
  const db = await createSupabaseServerClient()
  const data = await ministriesService.assign(db, ministryId, input, user.id)
  revalidatePath("/ministries")
  return data
}

export async function updateMinistry(id: string, input: UpdateMinistryInput) {
  const user = assertMinistriesAccess(await getCurrentUser())
  const db = await createSupabaseServerClient()
  const data = await ministriesService.update(db, id, input, user.id)
  revalidatePath("/ministries")
  return data
}

export async function unassignMinister(ministryId: string) {
  const user = assertMinistriesAccess(await getCurrentUser())
  const db = await createSupabaseServerClient()
  await ministriesService.unassign(db, ministryId, user.id)
  revalidatePath("/ministries")
}

export async function inviteDelegate(ministryId: string, input: InviteDelegateInput) {
  const db = await createSupabaseServerClient()
  const user = await assertDelegateAccess(await getCurrentUser(), db, ministryId)
  const data = await ministriesService.inviteDelegate(db, ministryId, input, user.id)
  revalidatePath(`/ministries/${ministryId}`)
  revalidatePath("/requests")
  return data
}

export async function removeDelegate(delegateId: string, ministryId: string) {
  const db = await createSupabaseServerClient()
  const user = await assertDelegateAccess(await getCurrentUser(), db, ministryId)
  await ministriesService.removeDelegate(db, delegateId, user.id)
  revalidatePath(`/ministries/${ministryId}`)
  revalidatePath("/requests")
}
