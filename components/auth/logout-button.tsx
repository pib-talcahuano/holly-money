"use client"

import { signOut } from "@/app/actions/auth"
import { Button } from "@/components/ui/button"
import { LogOut } from "lucide-react"

export function LogoutButton() {
  async function handleSignOut() {
    await signOut()
    window.location.assign("/")
  }

  return (
    <Button
      variant="ghost"
      onClick={() => void handleSignOut()}
      className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-2 px-3 h-10 border-none bg-transparent"
    >
      <LogOut className="h-4 w-4" />
      <span className="text-xs font-bold uppercase tracking-widest">Cerrar Sesión</span>
    </Button>
  )
}
