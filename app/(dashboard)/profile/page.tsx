import { redirect } from "next/navigation"
import { getCurrentUser } from "@/lib/supabase/server"
import { rolesLabel } from "@/lib/constants/roles"
import { initialsFor, avatarColorFor } from "@/lib/utils"
import { ProfileInfoForm } from "@/components/profile/profile-info-form"
import { SecuritySection } from "@/components/profile/security-section"

export default async function ProfilePage() {
  const user = await getCurrentUser()
  if (!user) redirect("/")

  const name = user.name ?? "—"
  const email = user.email ?? "—"

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground">
          Perfil
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">Tu información de cuenta y seguridad</p>
      </div>

      <div className="flex items-center gap-4 rounded-2xl bg-card border border-border p-6">
        <div
          className="flex size-16 shrink-0 items-center justify-center rounded-[18px] text-[22px] font-extrabold text-white"
          style={{ background: avatarColorFor(name) }}
        >
          {initialsFor(name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-extrabold truncate">{name}</p>
          <p className="text-[13px] text-muted-foreground truncate mb-1.5">{email}</p>
          <span className="inline-block text-[11px] font-bold bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
            {rolesLabel(user.roles)}
          </span>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border p-6">
        <p className="text-[13px] font-bold text-foreground mb-4">Información personal</p>
        <ProfileInfoForm fullName={name} email={email} />
      </div>

      <SecuritySection />
    </div>
  )
}
