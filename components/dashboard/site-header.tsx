"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ChevronRight, PanelLeft } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { GlobalSearch } from "@/components/dashboard/global-search"
import { NotificationBell } from "@/components/dashboard/notification-bell"

const PAGE_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/movements": "Movimientos",
  "/movements/new": "Nuevo Movimiento",
  "/tithers": "Diezmadores",
  "/users": "Usuarios",
  "/audit": "Auditoría",
  "/requests": "Solicitudes",
  "/ministries": "Ministerios",
  "/settings": "Administración",
  "/payroll": "Remuneraciones",
  "/profile": "Mi perfil",
  "/notifications": "Notificaciones",
  "/voucher-book": "Talonario Unificado"
}

const SETTINGS_SUBPAGE_LABELS: Record<string, string> = {
  "/settings/general": "General",
  "/settings/inbound-email": "Correo entrante",
  "/settings/permissions": "Permisos",
  "/settings/payment-methods": "Medios de pago",
  "/settings/categories": "Categorías"
}

function usePageLabel() {
  const pathname = usePathname()
  if (pathname.startsWith("/movements/") && pathname !== "/movements/new") {
    return { parent: { label: "Movimientos", href: "/movements" }, current: "Detalle" }
  }
  if (pathname === "/movements/new") {
    return { parent: { label: "Movimientos", href: "/movements" }, current: "Nuevo" }
  }
  if (pathname.startsWith("/requests/")) {
    return { parent: { label: "Solicitudes", href: "/requests" }, current: "Detalle" }
  }
  if (pathname.startsWith("/ministries/")) {
    return { parent: { label: "Ministerios", href: "/ministries" }, current: "Detalle" }
  }
  if (pathname.startsWith("/settings/")) {
    const label = SETTINGS_SUBPAGE_LABELS[pathname] ?? "..."
    return { parent: { label: "Administración", href: "/settings" }, current: label }
  }
  const label = PAGE_LABELS[pathname]
  return { parent: null, current: label ?? "..." }
}

export function SiteHeader() {
  const { toggleSidebar } = useSidebar()
  const { parent, current } = usePageLabel()

  return (
    <header className="sticky top-0 z-50 flex h-14 w-full flex-none items-center justify-between border-b bg-background px-5">
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon-sm"
          className="rounded-[8px] text-muted-foreground shadow-none hover:bg-muted"
          onClick={toggleSidebar}
          aria-label="Toggle sidebar"
        >
          <PanelLeft className="size-4" />
        </Button>
        <Breadcrumb className="hidden sm:block">
          <BreadcrumbList className="flex-nowrap gap-1.5 text-[13px] text-muted-foreground/70">
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/dashboard" />}>Sistema Contable</BreadcrumbLink>
            </BreadcrumbItem>
            {parent && (
              <>
                <BreadcrumbSeparator>
                  <ChevronRight className="size-[13px]" />
                </BreadcrumbSeparator>
                <BreadcrumbItem>
                  <BreadcrumbLink render={<Link href={parent.href} />}>
                    {parent.label}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator>
              <ChevronRight className="size-[13px]" />
            </BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-foreground">{current}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-2.5">
        <GlobalSearch />
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  )
}
