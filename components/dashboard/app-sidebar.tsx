"use client"

import type React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useMemo } from "react"
import {
  LayoutDashboard,
  ArrowLeftRight,
  Users,
  ClipboardList,
  Landmark,
  History,
  Settings2,
  Mail,
  ShieldCheck,
  CreditCard,
  Tags,
  Banknote
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar
} from "@/components/ui/sidebar"
import { NavUser } from "@/components/dashboard/nav-user"

type NavLink = {
  href: string
  label: string
  icon: React.ElementType
  roles?: string[]
}

type NavGroup = {
  label: string | null
  links: NavLink[]
}

// Placeholder href swapped for the user's own ministry id at render time — the only
// nav link whose destination isn't static (see visibleGroups below).
const MY_MINISTRY_HREF = "/ministries/__mine__"

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Principal",
    links: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: LayoutDashboard,
        roles: ["ADMIN", "BURSAR", "FINANCE"]
      }
    ]
  },
  {
    label: "Finanzas",
    links: [
      {
        href: "/movements",
        label: "Movimientos",
        icon: ArrowLeftRight,
        roles: ["ADMIN", "BURSAR", "FINANCE"]
      },
      {
        href: "/payroll",
        label: "Remuneraciones",
        icon: Banknote,
        roles: ["ADMIN", "BURSAR"]
      }
    ]
  },
  {
    label: "Ministerios",
    links: [
      { href: "/ministries", label: "Ministerios", icon: Landmark, roles: ["ADMIN", "BURSAR"] },
      {
        href: MY_MINISTRY_HREF,
        label: "Mi ministerio",
        icon: Landmark,
        roles: ["MINISTER", "DELEGATE"]
      },
      {
        href: "/requests",
        label: "Solicitudes",
        icon: ClipboardList,
        roles: ["ADMIN", "BURSAR", "FINANCE", "MINISTER", "DELEGATE"]
      }
    ]
  },
  {
    label: "Administración",
    links: [
      { href: "/settings/general", label: "General", icon: Settings2, roles: ["ADMIN"] },
      { href: "/settings/inbound-email", label: "Correo entrante", icon: Mail, roles: ["ADMIN"] },
      { href: "/settings/permissions", label: "Permisos", icon: ShieldCheck, roles: ["ADMIN"] },
      {
        href: "/settings/payment-methods",
        label: "Medios de pago",
        icon: CreditCard,
        roles: ["ADMIN"]
      },
      {
        href: "/settings/categories",
        label: "Categorías",
        icon: Tags,
        roles: ["ADMIN", "BURSAR"]
      },
      { href: "/users", label: "Usuarios", icon: Users, roles: ["ADMIN"] },
      { href: "/audit", label: "Auditoría", icon: History, roles: ["ADMIN"] }
    ]
  }
]

const GROUP_THRESHOLD = 5

export function AppSidebar({
  user
}: {
  user: {
    name: string
    email: string
    initials: string
    role: string
    ministryId?: string | null
  }
}) {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()

  const visibleGroups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        links: group.links
          .filter((l) => !l.roles || l.roles.includes(user.role))
          .filter((l) => l.href !== MY_MINISTRY_HREF || user.ministryId)
          .map((l) =>
            l.href === MY_MINISTRY_HREF ? { ...l, href: `/ministries/${user.ministryId}` } : l
          )
      })).filter((group) => group.links.length > 0),
    [user.role, user.ministryId]
  )

  const useGroups = useMemo(
    () => visibleGroups.reduce((sum, g) => sum + g.links.length, 0) >= GROUP_THRESHOLD,
    [visibleGroups]
  )

  const renderLinks = (links: NavLink[]) =>
    links.map((link) => {
      const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`)
      return (
        <SidebarMenuItem key={link.href}>
          <SidebarMenuButton
            render={<Link href={link.href} />}
            isActive={isActive}
            tooltip={link.label}
            onClick={() => setOpenMobile(false)}
          >
            <link.icon />
            <span className="text-[13px] font-sans">{link.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      )
    })

  return (
    <Sidebar>
      <SidebarHeader>
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 group-data-[collapsible=icon]:justify-center"
        >
          <div className="flex aspect-square size-9 flex-none items-center justify-center rounded-[10px] bg-white/[0.18] text-white">
            <Landmark className="size-5" />
          </div>
          <div className="grid flex-1 text-left group-data-[collapsible=icon]:hidden">
            <span className="truncate text-[13.5px] leading-[1.2] font-bold text-sidebar-foreground">
              Sistema Contable
            </span>
            <span className="truncate text-[11px] font-medium text-sidebar-foreground/50">
              PIBT
            </span>
          </div>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {useGroups ? (
          visibleGroups.map((group) => (
            <SidebarGroup key={group.label ?? "__general"}>
              {group.label && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>{renderLinks(group.links)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>{renderLinks(visibleGroups.flatMap((g) => g.links))}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
        <a
          href={`https://github.com/pib-talcahuano/holly-money/commit/${process.env.NEXT_PUBLIC_COMMIT_SHA_FULL}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 pb-1 font-mono text-[10.5px] text-sidebar-foreground/50 hover:text-sidebar-foreground/80 transition-colors"
        >
          v: {process.env.NEXT_PUBLIC_COMMIT_SHA}
        </a>
      </SidebarFooter>
    </Sidebar>
  )
}
