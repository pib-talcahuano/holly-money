import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { peopleService } from "@/services/people/people.service"
import { PeopleTable } from "@/components/people/people-table"
import { cn } from "@/lib/utils"

type Props = {
  searchParams: Promise<{ type?: string | string[] }>
}

const TABS = [
  { value: "INCOME", label: "Ingresos" },
  { value: "EXPENSE", label: "Egresos" }
] as const

export default async function PeoplePage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_PEOPLE)) redirect("/dashboard")

  const params = await searchParams
  const rawType = Array.isArray(params.type) ? params.type[0] : params.type
  const movementType = rawType === "EXPENSE" ? "EXPENSE" : "INCOME"

  const db = await createSupabaseServerClient()
  const names = await peopleService.list(db, { movementType })

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
          Personas
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          Nombres de “Entregado por” y “Entregado a”: une los que son la misma persona
        </p>
      </div>

      <nav aria-label="Tipo de movimiento" className="flex w-fit gap-1 rounded-xl bg-secondary p-1">
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={`/people?type=${tab.value}`}
            aria-current={movementType === tab.value ? "page" : undefined}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              movementType === tab.value
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <PeopleTable names={names} movementType={movementType} />
    </div>
  )
}
