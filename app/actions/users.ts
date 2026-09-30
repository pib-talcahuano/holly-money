"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/supabase/server"
import { PERMISSIONS, can, isImpersonating } from "@/lib/permissions/rbac"
import { USER_ROLES } from "@/lib/constants/roles"
import { usersService, type UserPurgePreview } from "@/services/users/users.service"
import type { CreateUserInput, UpdateUserInput, UpdateOwnProfileInput } from "@/lib/validators/user"

function assertUserAccess(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_USERS) || isImpersonating(user)) {
    throw new Error("Sin permisos para gestionar usuarios")
  }
  return user
}

export async function inviteUser(input: CreateUserInput) {
  const user = assertUserAccess(await getCurrentUser())
  const created = await usersService.invite(input, user.id)
  revalidatePath("/users")
  return created
}

export async function updateUser(input: UpdateUserInput) {
  const user = assertUserAccess(await getCurrentUser())
  const updated = await usersService.update(input, user.id)
  revalidatePath("/users")
  return updated
}

// Returns { error } instead of throwing: in production Next.js replaces the message of any
// error thrown from a server action with a generic "Server Components render" one (React
// error #441), so a thrown Spanish message would never reach the toast.
export async function deleteUser(
  id: string,
  options?: { hardDelete?: boolean }
): Promise<{ ok: true } | { error: string }> {
  try {
    const user = assertUserAccess(await getCurrentUser())
    if (options?.hardDelete && user.role !== USER_ROLES.ADMIN) {
      return { error: "Solo un administrador puede eliminar usuarios permanentemente" }
    }
    await usersService.delete(id, user.id, { hardDelete: options?.hardDelete ?? false })
    revalidatePath("/users")
    return { ok: true }
  } catch (e) {
    console.error("deleteUser failed", e)
    return { error: e instanceof Error ? e.message : "No se pudo eliminar el usuario" }
  }
}

export async function getUserPurgePreview(
  id: string
): Promise<{ preview: UserPurgePreview } | { error: string }> {
  try {
    const user = assertUserAccess(await getCurrentUser())
    if (user.role !== USER_ROLES.ADMIN) {
      return { error: "Solo un administrador puede eliminar usuarios permanentemente" }
    }
    return { preview: await usersService.previewPurge(id, user.id) }
  } catch (e) {
    console.error("getUserPurgePreview failed", e)
    return { error: e instanceof Error ? e.message : "No se pudo calcular el impacto" }
  }
}

export async function resendInvite(id: string) {
  const user = assertUserAccess(await getCurrentUser())
  return usersService.resendInvite(id, user.id)
}

export async function resetUser(id: string) {
  const user = assertUserAccess(await getCurrentUser())
  await usersService.resetAccount(id, user.id)
}

export async function updateOwnProfile(input: UpdateOwnProfileInput) {
  const user = await getCurrentUser()
  if (!user) throw new Error("Sesión no encontrada")
  const updated = await usersService.updateOwnProfile(input, user.id)
  revalidatePath("/profile")
  return updated
}
