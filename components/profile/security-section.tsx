"use client"

import { useState } from "react"
import { ChangePasswordForm } from "@/components/profile/change-password-form"

export function SecuritySection() {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-2xl bg-card border border-border p-6 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-bold text-foreground">Seguridad</p>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="py-2 -my-2 text-[12.5px] font-bold text-primary hover:underline"
        >
          {open ? "Cancelar" : "Cambiar contraseña"}
        </button>
      </div>
      <p className="text-[12.5px] text-muted-foreground">
        Cambia tu contraseña de acceso periódicamente.
      </p>
      {open && (
        <div className="mt-4">
          <ChangePasswordForm />
        </div>
      )}
    </div>
  )
}
