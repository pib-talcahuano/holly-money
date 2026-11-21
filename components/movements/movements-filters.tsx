"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Button, buttonVariants } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/native-select"
import { Label } from "@/components/ui/label"
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { startNavigationProgress } from "@/components/dashboard/navigation-progress"

type MovementType = "INCOME" | "EXPENSE" | "ALL"
type MovementStatus = "ACTIVE" | "CANCELLED" | "ALL"

type Props = {
  initialSearch: string
  initialMovementType: MovementType
  initialStatus: MovementStatus
}

export function MovementsFilters({ initialSearch, initialMovementType, initialStatus }: Props) {
  const router = useRouter()
  const [search, setSearch] = useState(initialSearch)
  const [movementType, setMovementType] = useState<MovementType>(initialMovementType)
  const [status, setStatus] = useState<MovementStatus>(initialStatus)
  const [popoverOpen, setPopoverOpen] = useState(false)

  const activeFiltersCount = (movementType !== "ALL" ? 1 : 0) + (status !== "ALL" ? 1 : 0)
  const hasAnyFilter = !!search || movementType !== "ALL" || status !== "ALL"

  function navigate(params: { search: string; movementType: MovementType; status: MovementStatus }) {
    const qs = new URLSearchParams()
    if (params.search) qs.set("search", params.search)
    if (params.movementType !== "ALL") qs.set("movement_type", params.movementType)
    if (params.status !== "ALL") qs.set("status", params.status)
    const q = qs.toString()
    startNavigationProgress()
    router.push(`/movements${q ? `?${q}` : ""}`)
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault()
    navigate({ search, movementType, status })
  }

  function handleApplyFilters() {
    setPopoverOpen(false)
    navigate({ search, movementType, status })
  }

  function handleClear() {
    setSearch("")
    setMovementType("ALL")
    setStatus("ALL")
    startNavigationProgress()
    router.push("/movements")
  }

  return (
    <div className="flex items-center gap-2">
      <form className="min-w-0 flex-1" onSubmit={handleSearchSubmit}>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar movimientos"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por entregado por/a, notas, categoría o monto..."
            className="pl-9"
          />
        </div>
      </form>

      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <PopoverTrigger
          className={cn(buttonVariants({ variant: "outline" }), "relative shrink-0 gap-2")}
        >
          <SlidersHorizontal className="size-4" />
          Filtros
          {activeFiltersCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                Tipo
              </Label>
              <NativeSelect
                value={movementType}
                onChange={(e) => setMovementType(e.target.value as MovementType)}
                className="w-full"
              >
                <option value="ALL">Todos los tipos</option>
                <option value="INCOME">Ingreso</option>
                <option value="EXPENSE">Egreso</option>
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label className="text-[11px] uppercase tracking-[0.05em] text-muted-foreground">
                Estado
              </Label>
              <NativeSelect
                value={status}
                onChange={(e) => setStatus(e.target.value as MovementStatus)}
                className="w-full"
              >
                <option value="ALL">Todos los estados</option>
                <option value="ACTIVE">Activo</option>
                <option value="CANCELLED">Anulado</option>
              </NativeSelect>
            </div>
            <Button onClick={handleApplyFilters} className="w-full">
              Aplicar
            </Button>
          </div>
        </PopoverContent>
      </Popover>

      {hasAnyFilter && (
        <Button variant="ghost" size="icon" onClick={handleClear} aria-label="Limpiar filtros">
          <X className="size-4" />
        </Button>
      )}
    </div>
  )
}
