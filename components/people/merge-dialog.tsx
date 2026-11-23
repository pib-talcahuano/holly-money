"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { mergePeople, previewPeopleMerge } from "@/app/actions/people"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { normalizeTargetName } from "@/lib/utils/people"
import type { PeopleMovementType, PersonName } from "@/types/people"

const DEBOUNCE_MS = 250
const OTHER = "__other__"
const GENERIC_ERROR = "No se pudo completar la operación"

type Props = {
  movementType: PeopleMovementType
  selected: PersonName[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}

type PreviewState = {
  key: string
  result: { ok: true; affected: number } | { ok: false; error: string }
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

export function MergeDialog({ movementType, selected, open, onOpenChange, onDone }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  const renaming = selected.length === 1
  // In-flight state lives here so it outlives the form for the whole time the dialog is open.
  const inFlight = useRef(false)
  const [submitting, setSubmitting] = useState(false)

  function beginSubmit() {
    if (inFlight.current) return false
    inFlight.current = true
    setSubmitting(true)
    return true
  }

  function endSubmit() {
    inFlight.current = false
    setSubmitting(false)
  }

  function handleOpenChange(next: boolean) {
    // Closing mid-merge would let a late response act on a different dialog instance.
    if (inFlight.current) return
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {open && selected.length > 0 && (
        <DialogContent
          initialFocus={titleRef}
          showCloseButton={!submitting}
          className="max-h-[90dvh] w-[95vw] gap-5 overflow-y-auto rounded-xl border border-border bg-card p-6 sm:max-w-lg"
        >
          <MergeForm
            // Remount when the selection changes so the form never keeps stale state.
            key={selected.map((person) => person.name).join("\u0000")}
            titleRef={titleRef}
            renaming={renaming}
            movementType={movementType}
            selected={selected}
            submitting={submitting}
            beginSubmit={beginSubmit}
            endSubmit={endSubmit}
            onOpenChange={onOpenChange}
            onDone={onDone}
          />
        </DialogContent>
      )}
    </Dialog>
  )
}

function MergeForm({
  titleRef,
  renaming,
  movementType,
  selected,
  submitting,
  beginSubmit,
  endSubmit,
  onOpenChange,
  onDone
}: Omit<Props, "open"> & {
  titleRef: React.RefObject<HTMLHeadingElement | null>
  renaming: boolean
  submitting: boolean
  beginSubmit: () => boolean
  endSubmit: () => void
}) {
  const router = useRouter()
  const fromNames = selected.map((person) => person.name)
  const current = renaming ? selected[0].name : ""

  const [choice, setChoice] = useState(renaming ? OTHER : "")
  const [custom, setCustom] = useState(current)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function changeChoice(next: string) {
    setChoice(next)
    setSubmitError(null)
  }

  function changeCustom(next: string) {
    setCustom(next)
    setSubmitError(null)
  }

  const typed = choice === OTHER
  // Same normalization the server schema applies, so preview and merge refer to this exact string.
  const target = normalizeTargetName(typed ? custom : choice)
  // Renaming to the same text (or leaving it empty) is not a change worth previewing.
  const previewable = target !== "" && !(renaming && target === current)
  const key = `${fromNames.join("\u0000")}\u0001${target}`
  const fromKey = fromNames.join("\u0000")

  useEffect(() => {
    if (!previewable) return
    let stale = false
    const run = () => {
      previewPeopleMerge({
        movement_type: movementType,
        from_names: fromKey.split("\u0000"),
        to_name: target
      })
        .then((result) => {
          if (!stale) setPreview({ key, result })
        })
        .catch((error) => {
          console.error("preview people merge failed", error)
          if (!stale) setPreview({ key, result: { ok: false, error: GENERIC_ERROR } })
        })
    }
    if (typed) {
      const timer = setTimeout(run, DEBOUNCE_MS)
      return () => {
        stale = true
        clearTimeout(timer)
      }
    }
    run()
    return () => {
      stale = true
    }
  }, [previewable, typed, movementType, fromKey, target, key])

  const currentPreview = previewable && preview?.key === key ? preview.result : null
  const loading = previewable && currentPreview === null
  const canConfirm = currentPreview?.ok === true && currentPreview.affected > 0 && !submitting

  async function handleConfirm() {
    if (!canConfirm || !beginSubmit()) return
    setSubmitError(null)
    try {
      const result = await mergePeople({
        movement_type: movementType,
        from_names: fromNames,
        to_name: target
      })
      // Even a failed merge may have changed some rows.
      router.refresh()
      if (!mounted.current) return
      if (result.ok) {
        toast.success(
          `${plural(result.updated, "movimiento actualizado", "movimientos actualizados")}`
        )
        endSubmit()
        onOpenChange(false)
        onDone()
      } else {
        setSubmitError(result.error)
      }
    } catch (error) {
      console.error("merge people failed", error)
      if (mounted.current) setSubmitError(GENERIC_ERROR)
    } finally {
      endSubmit()
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1 pr-8">
        <DialogTitle
          ref={titleRef}
          tabIndex={-1}
          className="break-words text-xl font-bold tracking-tight text-foreground outline-none"
        >
          {renaming ? "Renombrar" : "Unir nombres"}
        </DialogTitle>
        <DialogDescription>
          Todos los movimientos de estos nombres quedarán con el nombre que elijas.
        </DialogDescription>
      </div>

      {renaming ? (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="people-final-name"
            className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint"
          >
            Nombre final
          </label>
          <Input
            id="people-final-name"
            aria-label="Nombre final"
            value={custom}
            onChange={(event) => changeCustom(event.target.value)}
            className="h-10"
          />
        </div>
      ) : (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.06em] text-faint">
            Nombre final
          </legend>
          {selected.map((person) => (
            <label
              key={person.name}
              className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]"
            >
              <input
                type="radio"
                name="people-final-name"
                className="mt-0.5 size-4 accent-primary"
                checked={choice === person.name}
                onChange={() => changeChoice(person.name)}
              />
              <span className="min-w-0 whitespace-pre-wrap break-words text-sm font-semibold text-foreground">
                {person.name}
                <span className="ml-2 font-normal text-muted-foreground">
                  ({plural(person.count, "movimiento", "movimientos")})
                </span>
              </span>
            </label>
          ))}
          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border px-3 py-2.5 has-[:checked]:border-primary has-[:checked]:bg-primary/[0.06]">
            <input
              type="radio"
              name="people-final-name"
              className="mt-0.5 size-4 accent-primary"
              checked={typed}
              onChange={() => changeChoice(OTHER)}
            />
            <span className="text-sm font-semibold text-foreground">Otro nombre…</span>
          </label>
          {typed && (
            <Input
              aria-label="Nombre personalizado"
              placeholder="Escribe el nombre final"
              value={custom}
              onChange={(event) => changeCustom(event.target.value)}
              className="h-10"
            />
          )}
        </fieldset>
      )}

      <div role="status" aria-live="polite" className="flex flex-col gap-1">
        {loading && <p className="text-[13px] text-muted-foreground">Calculando…</p>}
        {currentPreview?.ok === true && currentPreview.affected === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            No hay movimientos para cambiar.
          </p>
        )}
        {currentPreview?.ok === true && currentPreview.affected > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <p>{`${plural(currentPreview.affected, "movimiento cambiará", "movimientos cambiarán")} de nombre.`}</p>
            <p>Cada cambio queda en la auditoría, con el nombre anterior.</p>
            <p className="mt-1 break-words font-semibold">{`Nombre final: ${target}`}</p>
          </div>
        )}
      </div>
      <div role="alert" className="flex flex-col gap-1">
        {currentPreview?.ok === false && (
          <p className="text-[13px] text-destructive">{currentPreview.error}</p>
        )}
        {submitError && <p className="text-[13px] text-destructive">{submitError}</p>}
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={submitting}
          onClick={() => onOpenChange(false)}
        >
          Cancelar
        </Button>
        <Button type="button" disabled={!canConfirm || loading} onClick={handleConfirm}>
          {renaming ? "Renombrar" : "Unir nombres"}
        </Button>
      </div>
    </>
  )
}
