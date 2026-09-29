"use server"

import { revalidatePath } from "next/cache"
import { getCurrentUser } from "@/lib/supabase/server"
import { PERMISSIONS, can, isImpersonating } from "@/lib/permissions/rbac"
import { USER_ROLES } from "@/lib/constants/roles"
import { usersService } from "@/services/users/users.service"
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

export async function deleteUser(id: string, options?: { hardDelete?: boolean }) {
  const user = assertUserAccess(await getCurrentUser())
  if (options?.hardDelete && user.role !== USER_ROLES.ADMIN) {
    throw new Error("Solo un administrador puede eliminar usuarios permanentemente")
  }
  await usersService.delete(id, user.id, { hardDelete: options?.hardDelete ?? false })
  revalidatePath("/users")
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
