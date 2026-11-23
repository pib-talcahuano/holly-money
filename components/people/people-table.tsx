"use client"

import { useMemo, useState } from "react"
import { SearchIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn, formatCLP, formatDate } from "@/lib/utils"
import { normalizeName } from "@/lib/utils/name-suggestions"
import type { PeopleMovementType, PersonName } from "@/types/people"

import { MergeDialog } from "./merge-dialog"

const HEADER = "text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-faint"
const COLUMNS = "sm:grid-cols-[28px_minmax(0,1.6fr)_110px_130px_130px_90px]"

type Props = { names: PersonName[]; movementType: PeopleMovementType }

export function PeopleTable({ names, movementType }: Props) {
  const [query, setQuery] = useState("")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [dialogNames, setDialogNames] = useState<PersonName[] | null>(null)

  const visible = useMemo(() => {
    const term = normalizeName(query)
    if (!term) return names
    return names.filter((person) => normalizeName(person.name).includes(term))
  }, [names, query])

  const selected = useMemo(
    () => names.filter((person) => checked.has(person.name)),
    [names, checked]
  )

  const hiddenSelected = selected.filter((person) => !visible.includes(person)).length

  function toggle(name: string) {
    setChecked((previous) => {
      const next = new Set(previous)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-sm sm:flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            aria-label="Filtrar por nombre"
            placeholder="Filtrar por nombre…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={selected.length < 2}
            onClick={() => setDialogNames(selected)}
          >
            Unir seleccionados ({selected.length})
          </Button>
          {hiddenSelected > 0 && (
            <p className="text-xs text-muted-foreground">
              {`${selected.length} seleccionados, ${hiddenSelected} ocultos por el filtro`}
            </p>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-border bg-card">
        {names.length === 0 ? (
          <p className="px-5 py-16 text-center text-sm text-muted-foreground">
            No hay nombres para unir.
          </p>
        ) : visible.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-muted-foreground">Sin coincidencias.</p>
        ) : (
          <div role="table" aria-label="Nombres">
            <div role="rowgroup" className="hidden sm:block">
              <div
                role="row"
                className={cn("grid gap-3 border-b border-border px-5 py-3.5", COLUMNS)}
              >
                <span role="columnheader" className={HEADER}>
                  <span className="sr-only">Seleccionar</span>
                </span>
                <span role="columnheader" className={HEADER}>
                  Nombre
                </span>
                <span role="columnheader" className={cn(HEADER, "text-right")}>
                  Movimientos
                </span>
                <span role="columnheader" className={cn(HEADER, "text-right")}>
                  Total
                </span>
                <span role="columnheader" className={HEADER}>
                  Último movimiento
                </span>
                <span role="columnheader" className={HEADER}>
                  <span className="sr-only">Acciones</span>
                </span>
              </div>
            </div>
            <div role="rowgroup">
              {visible.map((person) => {
                const isChecked = checked.has(person.name)
                return (
                  <div
                    key={person.name}
                    role="row"
                    className={cn(
                      "grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border px-5 py-3.5 last:border-b-0",
                      COLUMNS,
                      isChecked && "bg-primary/[0.06]"
                    )}
                  >
                    <span role="cell">
                      <input
                        type="checkbox"
                        aria-label={`Seleccionar ${person.name}`}
                        checked={isChecked}
                        onChange={() => toggle(person.name)}
                        className="size-4 cursor-pointer accent-primary"
                      />
                    </span>
                    <span role="cell" className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="whitespace-pre-wrap break-words text-sm font-bold text-foreground">
                        {person.name}
                      </span>
                      {person.sameAs.length > 0 && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
                          Misma persona, distinta escritura
                        </span>
                      )}
                    </span>
                    <span
                      role="cell"
                      className="order-2 col-start-2 text-sm tabular-nums text-muted-foreground sm:order-none sm:col-start-auto sm:text-right"
                    >
                      <span className="mr-1 text-faint sm:hidden">Movimientos:</span>
                      {person.count}
                    </span>
                    <span
                      role="cell"
                      className="order-1 text-right font-bold tabular-nums text-foreground sm:order-none"
                    >
                      {formatCLP(person.total)}
                    </span>
                    <span
                      role="cell"
                      className="order-3 col-start-2 text-sm tabular-nums text-muted-foreground sm:order-none sm:col-start-auto"
                    >
                      <span className="mr-1 text-faint sm:hidden">Último:</span>
                      {formatDate(person.lastDate)}
                    </span>
                    <span
                      role="cell"
                      className="order-4 col-start-2 sm:order-none sm:col-start-auto"
                    >
                      <button
                        type="button"
                        aria-label={`Renombrar ${person.name}`}
                        onClick={() => setDialogNames([person])}
                        className="text-[12.5px] font-semibold text-primary hover:text-primary/80"
                      >
                        Renombrar
                      </button>
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <MergeDialog
        movementType={movementType}
        selected={dialogNames ?? []}
        open={dialogNames !== null}
        onOpenChange={(open) => !open && setDialogNames(null)}
        onDone={() => {
          setChecked(new Set())
          setDialogNames(null)
        }}
      />
    </div>
  )
}
