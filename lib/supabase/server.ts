import { cache } from "react"
import { unstable_cache, revalidateTag } from "next/cache"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "@/types/database.types"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import { mergePermissions } from "@/lib/permissions/rbac"
import type { UserRole } from "@/types/auth"

export const IMPERSONATION_COOKIE = "impersonation_session"

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll called from a Server Component — cookies can't be set,
            // but middleware handles session refresh so this is safe to ignore.
          }
        }
      }
    }
  )
}

// Cached across requests per role for 24 h. Tag-invalidated when permissions change.
const getPermissionsForRole = unstable_cache(
  async (role: UserRole) => {
    const admin = createSupabaseAdminClient()
    const { data } = await admin
      .from("role_permissions")
      .select("permission")
      .eq("role", role)
      .eq("enabled", true)
    return (data ?? []).map((p) => p.permission)
  },
  ["role-permissions-v2"],
  { tags: ["role-permissions"], revalidate: 86400 }
)

export function revalidateRolePermissions() {
  revalidateTag("role-permissions", "days")
}

async function loadIdentity(userId: string) {
  // Service-role client: this loads either the real user's own row or, while
  // impersonating, a different user's row — RLS-as-self would not cover the latter.
  const admin = createSupabaseAdminClient()
  const { data: profile } = await admin
    .from("users")
    .select("id, full_name, email, roles, status")
    .eq("id", userId)
    .single()

  if (!profile || profile.status !== "ACTIVE") return null

  const permissions = mergePermissions(
    await Promise.all(profile.roles.map((role) => getPermissionsForRole(role)))
  )

  return {
    id: profile.id,
    email: profile.email,
    name: profile.full_name,
    roles: profile.roles,
    status: profile.status,
    permissions
  }
}

// The actually-authenticated user, ignoring any impersonation overlay. Used to gate
// starting/stopping impersonation itself — never derived from the effective identity.
export const getRealUser = cache(async function getRealUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user }
  } = await supabase.auth.getUser()

  if (!user) return null

  return loadIdentity(user.id)
})

async function getActiveImpersonation(realUserId: string) {
  const cookieStore = await cookies()
  const sessionId = cookieStore.get(IMPERSONATION_COOKIE)?.value
  if (!sessionId) return null

  const admin = createSupabaseAdminClient()
  const { data: session } = await admin
    .from("impersonation_sessions")
    .select("id, target_user_id, expires_at")
    .eq("id", sessionId)
    .eq("impersonator_id", realUserId)
    .is("ended_at", null)
    .maybeSingle()

  if (!session) return null

  if (new Date(session.expires_at) <= new Date()) {
    await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "expired" })
      .eq("id", session.id)
    return null
  }

  return session
}

// cache() deduplicates calls within a single React render tree (one request).
// Layout + page both call getCurrentUser — this ensures it only runs once.
export const getCurrentUser = cache(async function getCurrentUser() {
  const realUser = await getRealUser()
  if (!realUser) return null

  const impersonation = await getActiveImpersonation(realUser.id)
  if (!impersonation) {
    return { ...realUser, impersonatorId: null, realUser: null }
  }

  const target = await loadIdentity(impersonation.target_user_id)
  if (!target) {
    // Target was deactivated (or removed) mid-session — auto-terminate and fall
    // back to the real identity rather than error or trust stale state.
    const admin = createSupabaseAdminClient()
    await admin
      .from("impersonation_sessions")
      .update({ ended_at: new Date().toISOString(), ended_reason: "target_inactive" })
      .eq("id", impersonation.id)
    return { ...realUser, impersonatorId: null, realUser: null }
  }

  return {
    ...target,
    impersonatorId: realUser.id,
    realUser: { id: realUser.id, email: realUser.email, name: realUser.name, roles: realUser.roles }
  }
})
