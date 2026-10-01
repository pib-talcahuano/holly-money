"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { VenetianMask } from "lucide-react"
import { useUser } from "@/components/providers/user-provider"
import { stopImpersonation } from "@/app/actions/impersonation"
import { rolesLabel } from "@/lib/constants/roles"

export function ImpersonationBanner() {
  const user = useUser()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  if (!user.impersonatorId || !user.realUser) return null

  function handleExit() {
    startTransition(async () => {
      await stopImpersonation()
      router.refresh()
    })
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-[#3b2f00] px-4 py-[9px] text-[12.5px] font-semibold text-[#ffd977]">
      <VenetianMask className="size-[15px] shrink-0" />
      <span>
        Estás viendo la aplicación como <strong className="text-white">{user.name}</strong> (
        {rolesLabel(user.roles)}) — se aplican sus permisos.
      </span>
      <button
        onClick={handleExit}
        disabled={isPending}
        className="h-[26px] rounded-full border border-[#ffd977]/50 bg-transparent px-3 text-[11.5px] font-bold text-[#ffd977] disabled:opacity-50 hover:bg-[#ffd977]/12"
      >
        Salir
      </button>
    </div>
  )
}
