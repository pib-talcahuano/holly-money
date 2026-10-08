"use server"

import { cookies } from "next/headers"
import { revalidatePath } from "next/cache"
import { getRealUser, IMPERSONATION_COOKIE } from "@/lib/supabase/server"
import { impersonationService } from "@/services/impersonation/impersonation.service"
import { usersService } from "@/services/users/users.service"
import { startImpersonationSchema } from "@/lib/validators/impersonation"
import { USER_ROLES, hasRole } from "@/lib/constants/roles"

async function assertRealAdmin() {
  const realUser = await getRealUser()
  if (!realUser || !hasRole(realUser, USER_ROLES.ADMIN)) {
    throw new Error("Solo un administrador puede suplantar usuarios")
  }
  return realUser
}

export async function listImpersonationTargets() {
  const realUser = await assertRealAdmin()
  const users = await usersService.list()
  return users.filter(
    (u) => u.id !== realUser.id && !hasRole(u, USER_ROLES.ADMIN) && u.status === "ACTIVE"
  )
}

export async function startImpersonation(targetUserId: string) {
  const realUser = await assertRealAdmin()
  const { targetUserId: validatedId } = startImpersonationSchema.parse({ targetUserId })

  const session = await impersonationService.start(realUser.id, validatedId)

  const cookieStore = await cookies()
  cookieStore.set(IMPERSONATION_COOKIE, session.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: new Date(session.expires_at)
  })

  revalidatePath("/", "layout")
}

export async function stopImpersonation() {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value
  cookieStore.delete(IMPERSONATION_COOKIE)

  if (!sessionId) return

  const realUser = await getRealUser()
  if (!realUser) return

  await impersonationService.stop(sessionId, "manual")
  revalidatePath("/", "layout")
}

export type ImpersonationTarget = Awaited<ReturnType<typeof listImpersonationTargets>>[number]
