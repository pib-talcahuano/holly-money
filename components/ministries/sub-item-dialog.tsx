"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { NativeSelect } from "@/components/ui/native-select"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldLabel, FieldError } from "@/components/ui/field"
import {
  subItemFormSchema,
  type SubItemFormInput,
  type UpsertSubItemInput
} from "@/lib/validators/budget-sub-item"
import { upsertSubItem, setSubItemActive } from "@/app/actions/budget-sub-items"
import { upsertMinistryBudget } from "@/app/actions/ministry-budgets"

type FormValues = z.input<typeof subItemFormSchema>

export type SubItemParentRef =
  | {
      kind: "ministry"
      ministryId: string
      periodId: string
      // null when the ministry has no budget row yet for the period.
      ministryBudgetId: string | null
      name: string
    }
  | { kind: "item"; budgetItemId: string; name: string }

export type EditableSubItem = {
  id: string
  name: string
  assigned: number
  categoryId: string | null
  notes: string | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  parent: SubItemParentRef | null
  // Expense categories; only offered for sub-items of non-ministry items.
  categories: { id: string; name: string }[]
  // null = create mode
  subItem: EditableSubItem | null
  // When set, creating the first sub-item changes the parent's total: ask first.
  confirmMessage: string | null
}

function defaultsFor(subItem: EditableSubItem | null): FormValues {
  return subItem
    ? {
        id: subItem.id,
        name: subItem.name,
        assigned_amount: subItem.assigned,
        category_id: subItem.categoryId,
        notes: subItem.notes ?? ""
      }
    : { name: "", assigned_amount: "" as unknown as number, category_id: null, notes: "" }
}

export function SubItemDialog({
  open,
  onOpenChange,
  parent,
  categories,
  subItem,
  confirmMessage
}: Props) {
  const router = useRouter()
  const [pending, setPending] = useState<SubItemFormInput | null>(null)
  const [busy, setBusy] = useState(false)
  // Each time the dialog opens it starts at the form: a confirmation left over from a previous
  // session (whatever way it closed) must never come back. Adjusted during render, not in an
  // effect, per React's "storing information from previous renders".
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPending(null)
  }
  const form = useForm<FormValues, unknown, SubItemFormInput>({
    resolver: zodResolver(subItemFormSchema),
    defaultValues: defaultsFor(subItem)
  })

  useEffect(() => {
    if (open) form.reset(defaultsFor(subItem))
  }, [open, subItem, form])

  async function save(values: SubItemFormInput) {
    if (!parent) return
    setBusy(true)
    try {
      let parentRef: Pick<UpsertSubItemInput, "ministry_budget_id" | "budget_item_id"> = {}
      if (!subItem) {
        if (parent.kind === "item") {
          parentRef = { budget_item_id: parent.budgetItemId }
        } else {
          // A ministry without a budget row gets one with amount 0 first.
          const ministryBudgetId =
            parent.ministryBudgetId ??
            (
              await upsertMinistryBudget({
                ministry_id: parent.ministryId,
                budget_period_id: parent.periodId,
                assigned_amount: 0,
                initial_used_amount: 0
              })
            ).id
          parentRef = { ministry_budget_id: ministryBudgetId }
        }
      }
      await upsertSubItem({
        ...values,
        ...parentRef,
        category_id: parent.kind === "item" ? (values.category_id ?? null) : null
      })
      toast.success("Sub-ítem guardado")
      setPending(null)
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el sub-ítem")
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(values: SubItemFormInput) {
    if (!subItem && confirmMessage) setPending(values)
    else void save(values)
  }

  async function handleDeactivate() {
    if (!subItem) return
    setBusy(true)
    try {
      await setSubItemActive({ id: subItem.id, is_active: false })
      toast.success("Sub-ítem desactivado")
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al desactivar el sub-ítem")
    } finally {
      setBusy(false)
    }
  }

  // Closing always drops a half-finished confirmation, so reopening starts at the form.
  function handleOpenChange(next: boolean) {
    setPending(null)
    onOpenChange(next)
  }

  const errors = form.formState.errors
  const showCategory = parent?.kind === "item"

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {subItem ? "Editar sub-ítem" : "Nuevo sub-ítem"}
            {parent ? ` · ${parent.name}` : ""}
          </DialogTitle>
        </DialogHeader>
        {pending ? (
          <div className="space-y-4 pt-2">
            <p className="text-sm text-foreground">{confirmMessage}</p>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setPending(null)}>
                Volver
              </Button>
              <Button className="flex-1" disabled={busy} onClick={() => void save(pending)}>
                {busy ? "Guardando..." : "Continuar"}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <Field>
              <FieldLabel htmlFor="sub-item-name">Nombre *</FieldLabel>
              <Input id="sub-item-name" {...form.register("name")} />
              <FieldError errors={[errors.name]} />
            </Field>
            <Field>
              <FieldLabel htmlFor="sub-item-assigned">Asignado *</FieldLabel>
              <Input
                id="sub-item-assigned"
                type="number"
                min="0"
                step="1"
                {...form.register("assigned_amount")}
              />
              <FieldError errors={[errors.assigned_amount]} />
            </Field>
            {showCategory && (
              <Field>
                <FieldLabel htmlFor="sub-item-category">Categoría de egresos</FieldLabel>
                <NativeSelect
                  id="sub-item-category"
                  className="w-full"
                  {...form.register("category_id", {
                    setValueAs: (value: string) => (value === "" ? null : value)
                  })}
                >
                  <option value="">Sin categoría (usado en 0)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </NativeSelect>
                <FieldError errors={[errors.category_id]} />
              </Field>
            )}
            <Field>
              <FieldLabel htmlFor="sub-item-notes">Notas</FieldLabel>
              <Textarea id="sub-item-notes" rows={2} {...form.register("notes")} />
            </Field>
            <div className="flex gap-2">
              {subItem && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void handleDeactivate()}
                >
                  Desactivar
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={busy}>
                {busy ? "Guardando..." : "Guardar sub-ítem"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
