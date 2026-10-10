import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { Database } from "@/types/database.types"

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        }
      }
    }
  )

  const {
    data: { user }
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const PUBLIC_PATHS = [
    "/",
    "/auth/callback",
    "/activate",
    "/forgot-password",
    "/api/auth/verify",
    "/api/auth/forgot-password",
    // Cron endpoint: no session, authenticated by the x-cron-secret header
    "/api/comment-notifications"
  ]
  const isPublicPath = PUBLIC_PATHS.some((p) =>
    p === "/" ? pathname === "/" : pathname.startsWith(p)
  )

  // Unauthenticated user trying to access a protected page → send to login
  // Authenticated users at "/" are handled by the page component (server-side redirect)
  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone()
    url.pathname = "/"
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
}
