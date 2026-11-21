"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowDownLeft, ArrowUpRight, Search } from "lucide-react"
import { searchMovements, type MovementSearchResult } from "@/app/actions/movements"
import { Button } from "@/components/ui/button"
import {
  Command,
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from "@/components/ui/command"
import { useUser } from "@/components/providers/user-provider"
import { PERMISSIONS } from "@/lib/permissions/rbac"
import { cn, formatCLP, formatDate } from "@/lib/utils"

const MIN_QUERY_LENGTH = 2
const DEBOUNCE_MS = 250

type Status = "idle" | "loading" | "done" | "error"

function ResultRow({
  item,
  onSelect
}: {
  item: MovementSearchResult
  onSelect: (item: MovementSearchResult) => void
}) {
  const Icon = item.movement_type === "INCOME" ? ArrowDownLeft : ArrowUpRight
  const cancelled = item.status === "CANCELLED"
  const subtitle = [item.category_name, item.delivered_by].filter(Boolean).join(" · ")

  return (
    <CommandItem
      value={item.id}
      onSelect={() => onSelect(item)}
      className={cn(cancelled && "opacity-60")}
    >
      <Icon
        className={cn(
          "size-4",
          item.movement_type === "INCOME" ? "text-emerald-600" : "text-rose-600"
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm">{subtitle || "Sin detalle"}</span>
        {cancelled && <span className="text-xs text-muted-foreground">Anulado</span>}
      </div>
      <span className="text-sm font-medium tabular-nums">{formatCLP(item.amount)}</span>
      <CommandShortcut>{formatDate(item.movement_date)}</CommandShortcut>
    </CommandItem>
  )
}

export function GlobalSearch() {
  const { can } = useUser()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [results, setResults] = useState<MovementSearchResult[]>([])
  const [status, setStatus] = useState<Status>("idle")
  const [selected, setSelected] = useState("")
  const requestId = useRef(0)
  const allowed = can(PERMISSIONS.VIEW_MOVEMENT)

  useEffect(() => {
    if (!allowed) return
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onKeyDown)
    return () => document.removeEventListener("keydown", onKeyDown)
  }, [allowed])

  useEffect(() => {
    const query = text.trim()
    const id = ++requestId.current
    if (query.length < MIN_QUERY_LENGTH) {
      return
    }
    const timer = setTimeout(() => {
      searchMovements(query)
        .then((data) => {
          if (id !== requestId.current) return
          setResults(data)
          const first = data.find((r) => r.movement_type === "INCOME") ?? data[0]
          setSelected(first ? first.id : "")
          setStatus("done")
        })
        .catch(() => {
          if (id !== requestId.current) return
          setResults([])
          setStatus("error")
        })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const handleTextChange = useCallback((value: string) => {
    setText(value)
    if (value.trim().length >= MIN_QUERY_LENGTH) {
      setStatus("loading")
    } else {
      setResults([])
      setStatus("idle")
    }
  }, [])

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next)
    if (!next) {
      requestId.current++
      setText("")
      setResults([])
      setStatus("idle")
    }
  }, [])

  if (!allowed) return null

  const query = text.trim()
  const searchable = query.length >= MIN_QUERY_LENGTH
  const showResults = status === "done"
  const incomes = results.filter((r) => r.movement_type === "INCOME")
  const expenses = results.filter((r) => r.movement_type === "EXPENSE")

  function goTo(path: string) {
    handleOpenChange(false)
    router.push(path)
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="rounded-[8px] text-muted-foreground shadow-none hover:bg-muted"
        onClick={() => setOpen(true)}
        aria-label="Abrir buscador"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Buscar</span>
        <kbd className="ml-1 hidden rounded border px-1 text-[10px] sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={handleOpenChange}
        title="Buscar movimientos"
        description="Busca por entregado por, notas, categoría o monto"
      >
        <Command
          shouldFilter={false}
          label="Buscar movimientos"
          value={selected}
          onValueChange={setSelected}
        >
          <CommandInput
            value={text}
            onValueChange={handleTextChange}
            aria-label="Buscar movimientos"
            placeholder="Buscar por nombre, nota, categoría o monto…"
          />
          <CommandList>
            {!searchable && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Escribe al menos 2 caracteres.
              </p>
            )}
            {searchable && status === "loading" && (
              <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
            )}
            {status === "error" && (
              <p className="py-6 text-center text-sm text-destructive">No se pudo buscar</p>
            )}
            {status === "done" && results.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados</p>
            )}
            {showResults && incomes.length > 0 && (
              <CommandGroup heading="Ingresos">
                {incomes.map((item) => (
                  <ResultRow
                    key={item.id}
                    item={item}
                    onSelect={(i) => goTo(`/movements/${i.id}`)}
                  />
                ))}
              </CommandGroup>
            )}
            {showResults && expenses.length > 0 && (
              <CommandGroup heading="Egresos">
                {expenses.map((item) => (
                  <ResultRow
                    key={item.id}
                    item={item}
                    onSelect={(i) => goTo(`/movements/${i.id}`)}
                  />
                ))}
              </CommandGroup>
            )}
            {showResults && results.length > 0 && (
              <CommandGroup>
                <CommandItem
                  value="__view-all__"
                  onSelect={() => goTo(`/movements?search=${encodeURIComponent(query)}`)}
                >
                  <Search className="size-4" />
                  Ver todos los resultados
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  )
}
