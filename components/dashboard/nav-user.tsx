"use client"

import { useCallback, useTransition } from "react"
import { useRouter } from "next/navigation"
import { createSupabaseBrowserClient } from "@/lib/supabase/client"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import { ChevronsUpDown, LogOut, Moon, Sun, UserCircle, VenetianMask } from "lucide-react"
import Link from "next/link"
import { stopImpersonation } from "@/app/actions/impersonation"
import { useUser } from "@/components/providers/user-provider"
import { useTheme } from "@/hooks/use-theme"
import { rolesLabel } from "@/lib/constants/roles"

const ITEM_CLASS = "h-[38px] gap-2.5 rounded-[9px] px-2.5 text-[13px] font-semibold [&_svg]:text-muted-foreground"

export function NavUser({
  user
}: {
  user: {
    name: string
    email: string
    initials: string
    roles: string[]
  }
}) {
  const router = useRouter()
  const { dark, toggle: toggleTheme } = useTheme()
  const { impersonatorId } = useUser()
  const [isStoppingImpersonation, startStopImpersonation] = useTransition()

  const handleSignOut = useCallback(async () => {
    const supabase = createSupabaseBrowserClient()
    await supabase.auth.signOut()
    router.push("/")
    router.refresh()
  }, [router])

  const handleStopImpersonating = () => {
    startStopImpersonation(async () => {
      await stopImpersonation()
      router.refresh()
    })
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton className="h-auto gap-2.5 rounded-[11px] p-2 hover:bg-white/10 aria-expanded:bg-white/[0.12] aria-expanded:hover:bg-white/[0.12]" />
            }
          >
            <Avatar className="size-8">
              <AvatarFallback className="bg-white/20 text-xs font-bold text-white">
                {user.initials}
              </AvatarFallback>
            </Avatar>
            <div className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-[12.5px] font-semibold text-sidebar-foreground">
                {user.name}
              </span>
              <span className="truncate text-[11px] text-sidebar-foreground/50">
                {rolesLabel(user.roles)}
              </span>
            </div>
            <ChevronsUpDown className="size-[15px] flex-none text-sidebar-foreground/50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[232px] rounded-[14px] p-1.5 shadow-[0_18px_40px_-12px_rgba(15,14,30,0.4)]"
            side="top"
            align="start"
            sideOffset={6}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="mb-1.5 flex items-center gap-2.5 border-b border-border px-2.5 pt-2.5 pb-3">
                <Avatar className="size-[34px]">
                  <AvatarFallback className="bg-primary text-xs font-extrabold text-primary-foreground">
                    {user.initials}
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 flex-1 text-left leading-tight">
                  <span className="truncate text-[13px] font-bold">{user.name}</span>
                  <span className="truncate text-[11px] text-muted-foreground">{user.email}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {impersonatorId && (
                <DropdownMenuItem
                  className={ITEM_CLASS}
                  disabled={isStoppingImpersonation}
                  onClick={handleStopImpersonating}
                >
                  <VenetianMask />
                  Dejar de personificar
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className={ITEM_CLASS} render={<Link href="/profile" />}>
                <UserCircle />
                Perfil
              </DropdownMenuItem>
              <DropdownMenuItem className={ITEM_CLASS} onClick={toggleTheme}>
                {dark ? <Sun /> : <Moon />}
                {dark ? "Modo claro" : "Modo oscuro"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator className="mx-1 my-1.5" />
            <DropdownMenuItem
              className="h-[38px] gap-2.5 rounded-[9px] px-2.5 text-[13px] font-bold hover:bg-expense-surface"
              variant="destructive"
              onClick={() => void handleSignOut()}
            >
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
