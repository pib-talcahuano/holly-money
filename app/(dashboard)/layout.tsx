import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/dashboard/app-sidebar"
import { SiteHeader } from "@/components/dashboard/site-header"
import { ImpersonationBanner } from "@/components/dashboard/impersonation-banner"
import { UserProvider } from "@/components/providers/user-provider"
import { ministriesService } from "@/services/ministries/ministries.service"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()
  if (!user) {
    redirect("/")
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n: string) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "U"

  const sessionUser = { ...user, permissions: [...user.permissions] }

  let ministryId: string | null = null
  if (user.role === "MINISTER" || user.role === "DELEGATE") {
    const db = await createSupabaseServerClient()
    const assignment = await ministriesService.getMinistryForUser(db, user.id)
    ministryId = assignment?.ministry_id ?? null
  }

  return (
    <UserProvider user={sessionUser}>
      <div className="flex min-h-svh flex-col">
        <ImpersonationBanner />
        <SidebarProvider className="min-h-0 flex-1">
          <AppSidebar
            user={{
              name: user.name ?? "",
              email: user.email ?? "",
              initials,
              role: user.role,
              ministryId
            }}
          />
          <SidebarInset>
            <SiteHeader />
            <div className="flex-1 p-4 sm:p-6 lg:p-8 min-h-0 overflow-x-hidden">{children}</div>
          </SidebarInset>
        </SidebarProvider>
      </div>
    </UserProvider>
  )
}
