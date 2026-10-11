import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { MovementForm } from "@/components/movements/movement-form"
import { MovementWizard } from "@/components/movements/movement-wizard"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { paymentMethodsService } from "@/services/payment-methods/payment-methods.service"
import { categoriesService, subcategoriesService } from "@/services/categories/categories.service"

type Props = {
  searchParams: Promise<{ capitalInjection?: string }>
}

export default async function NewMovementPage({ searchParams }: Props) {
  const user = await getCurrentUser()
  if (!(can(user?.permissions, PERMISSIONS.CREATE_MOVEMENT) ?? false)) {
    redirect("/movements")
  }

  const { capitalInjection } = await searchParams
  const isCapitalInjection = capitalInjection === "1"

  const db = await createSupabaseServerClient()
  const [paymentMethods, categories, subcategories] = await Promise.all([
    paymentMethodsService.list(db),
    categoriesService.list(db),
    subcategoriesService.list(db)
  ])

  // Defensive: the "Aporte de Capital" category is seeded by migration and
  // should always exist, but fall back to no default rather than crashing
  // the "Inyectar capital" quick-entry flow if it's ever missing/renamed.
  const capitalInjectionCategoryId = isCapitalInjection
    ? categories.find((c) => c.name === "Aporte de Capital" && c.movement_type === "INCOME")?.id
    : undefined

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <Link
          href="/movements"
          className="group flex items-center gap-1.5 text-[12.5px] font-bold text-muted-foreground hover:text-foreground transition-colors w-fit py-1.5 -mt-1.5 mb-2"
        >
          <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-1" />
          Volver a movimientos
        </Link>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-foreground mb-1">
          {isCapitalInjection ? "Inyectar capital" : "Registro de Movimiento"}
        </h1>
        <p className="text-[13.5px] text-muted-foreground">
          {isCapitalInjection
            ? "Registro de un aporte de capital como ingreso."
            : "Formulario para el control de ingresos y egresos."}
        </p>
      </div>
      {isCapitalInjection ? (
        <div className="rounded-2xl bg-card border border-border p-7">
          <MovementForm
            mode="create"
            paymentMethods={paymentMethods}
            categories={categories}
            subcategories={subcategories}
            isCapitalInjection
            defaultValues={{ movement_type: "INCOME", category_id: capitalInjectionCategoryId }}
          />
        </div>
      ) : (
        <div className="w-full">
          <MovementWizard
            mode="create"
            paymentMethods={paymentMethods}
            categories={categories}
            subcategories={subcategories}
          />
        </div>
      )}
    </div>
  )
}
