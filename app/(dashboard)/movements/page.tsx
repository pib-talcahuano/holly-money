import Link from "next/link"
import { redirect } from "next/navigation"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { movementsService } from "@/services/movements/movements.service"
import { MovementsTable } from "@/components/movements/movements-table"
import { MovementsFilters } from "@/components/movements/movements-filters"
import { Button } from "@/components/ui/button"
import { Plus, PiggyBank, ChevronLeft, ChevronRight } from "lucide-react"

type Props = {
  searchParams: Promise<{
    search?: string
    movement_type?: "INCOME" | "EXPENSE" | "ALL"
    status?: "ACTIVE" | "CANCELLED" | "ALL"
    page?: string
  }>
}

export default async function MovementsPage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!user || !can(user.permissions, PERMISSIONS.VIEW_MOVEMENT)) redirect("/dashboard")
  const canWrite = can(user.permissions, PERMISSIONS.CREATE_MOVEMENT) ?? false
  const params = await searchParams
  const search = params.search?.trim() ?? ""
  const movement_type = params.movement_type ?? "ALL"
  const status = params.status ?? "ALL"
  const page = Math.max(1, Number(params.page ?? "1") || 1)

  const db = await createSupabaseServerClient()
  const {
    data: rows,
    count,
    pageSize
  } = await movementsService.list(db, {
    search,
    movement_type,
    status,
    page
  })

  const totalPages = Math.max(1, Math.ceil(count / pageSize))

  const buildUrl = (p: number) => {
    const qs = new URLSearchParams()
    if (search) qs.set("search", search)
    if (movement_type !== "ALL") qs.set("movement_type", movement_type)
    if (status !== "ALL") qs.set("status", status)
    if (p > 1) qs.set("page", String(p))
    const q = qs.toString()
    return `/movements${q ? `?${q}` : ""}`
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
            Movimientos
          </h1>
          <p className="text-[13.5px] text-muted-foreground">Registro de ingresos y egresos</p>
        </div>
        {canWrite && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              render={<Link href="/movements/new?capitalInjection=1" />}
              nativeButton={false}
              className="gap-2"
            >
              <PiggyBank data-icon="inline-start" />
              Inyectar capital
            </Button>
            <Button render={<Link href="/movements/new" />} nativeButton={false} className="gap-2">
              <Plus data-icon="inline-start" />
              Nuevo Movimiento
            </Button>
          </div>
        )}
      </div>

      <MovementsFilters
        initialSearch={search}
        initialMovementType={movement_type}
        initialStatus={status}
      />

      <MovementsTable
        variant="full"
        canWrite={canWrite}
        rows={rows.map((row) => ({
          id: row.id,
          movement_date: row.movement_date,
          movement_type: row.movement_type,
          amount: String(row.amount),
          category_name: (row.movement_categories as { name: string } | null)?.name ?? "—",
          subcategory_name: (row.movement_subcategories as { name: string } | null)?.name ?? null,
          delivered_by: row.delivered_by,
          receipt_email: row.receipt_email,
          payment_method_name: (row.payment_methods as { name: string } | null)?.name ?? null,
          notes: row.notes,
          cancellation_reason: row.cancellation_reason,
          status: row.status,
          created_by: {
            full_name: (row.users as { full_name: string } | null)?.full_name ?? ""
          },
          cancelled_by: row.cancelled_by as { full_name: string } | null,
          cancelled_at: row.cancelled_at
        }))}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            Página {page} de {totalPages} · {count} resultados
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              render={page > 1 ? <Link href={buildUrl(page - 1)} /> : undefined}
              disabled={page <= 1}
              className="gap-1"
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>
            <Button
              variant="outline"
              render={page < totalPages ? <Link href={buildUrl(page + 1)} /> : undefined}
              disabled={page >= totalPages}
              className="gap-1"
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
