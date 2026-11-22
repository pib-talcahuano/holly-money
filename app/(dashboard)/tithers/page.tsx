import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { tithersService } from "@/services/tithers/tithers.service"
import { currentYearInSantiago, parseTithersYear, titherYearOptions } from "@/lib/utils/tithers"
import { TithersSummary } from "@/components/tithers/tithers-summary"
import { TithersTable } from "@/components/tithers/tithers-table"
import { TithersYearSelect } from "@/components/tithers/tithers-year-select"

type Props = {
  searchParams: Promise<{ year?: string | string[] }>
}

export default async function TithersPage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.VIEW_MOVEMENT)) redirect("/dashboard")

  const params = await searchParams
  const rawYear = Array.isArray(params.year) ? params.year[0] : params.year
  const currentYear = currentYearInSantiago()
  const year = parseTithersYear(rawYear, currentYear)

  const db = await createSupabaseServerClient()
  const { categoryFound, tithers, totals } = await tithersService.list(db, { year })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
            Diezmadores
          </h1>
          <p className="text-[13.5px] text-muted-foreground">
            Quiénes dan diezmo y cuánto, por año
          </p>
        </div>
        <TithersYearSelect year={year} options={titherYearOptions(currentYear)} />
      </div>

      {categoryFound ? (
        <>
          <TithersSummary totals={totals} year={year} />
          <TithersTable tithers={tithers} year={year} />
        </>
      ) : (
        <p className="rounded-xl border border-border bg-card px-5 py-4 text-sm text-muted-foreground">
          No se encontró la categoría Diezmos.
        </p>
      )}
    </div>
  )
}
