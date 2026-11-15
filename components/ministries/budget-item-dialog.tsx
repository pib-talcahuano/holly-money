"use client"

import { useEffect } from "react"
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
import { upsertBudgetItemSchema, type UpsertBudgetItemInput } from "@/lib/validators/budget-item"
import { upsertBudgetItem } from "@/app/actions/budget-items"
import type { BudgetRow } from "./budget-rows"

type FormValues = z.input<typeof upsertBudgetItemSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  periodId: string
  categories: { id: string; name: string }[]
  // null = create mode
  item: BudgetRow | null
}

function defaultsFor(periodId: string, item: BudgetRow | null): FormValues {
  return item
    ? {
        id: item.id,
        budget_period_id: periodId,
        name: item.name,
        assigned_amount: item.assigned ?? 0,
        initial_used_amount: item.initial,
        category_id: item.categoryId ?? null,
        notes: item.notes ?? ""
      }
    : {
        budget_period_id: periodId,
        name: "",
        assigned_amount: "" as unknown as number,
        initial_used_amount: 0,
        category_id: null,
        notes: ""
      }
}

export function BudgetItemDialog({ open, onOpenChange, periodId, categories, item }: Props) {
  const router = useRouter()
  const form = useForm<FormValues, unknown, UpsertBudgetItemInput>({
    resolver: zodResolver(upsertBudgetItemSchema),
    defaultValues: defaultsFor(periodId, item)
  })

  useEffect(() => {
    if (open) form.reset(defaultsFor(periodId, item))
  }, [open, periodId, item, form])

  async function onSubmit(values: UpsertBudgetItemInput) {
    try {
      await upsertBudgetItem(values)
      toast.success("Ítem guardado")
      onOpenChange(false)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar el ítem")
    }
  }

  const errors = form.formState.errors

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{item ? "Editar ítem" : "Nuevo ítem de presupuesto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
          <Field>
            <FieldLabel htmlFor="item-name">Nombre *</FieldLabel>
            <Input id="item-name" placeholder="Remuneraciones" {...form.register("name")} />
            <FieldError errors={[errors.name]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="item-category">Categoría de egresos</FieldLabel>
            <NativeSelect
              id="item-category"
              className="w-full"
              {...form.register("category_id", {
                setValueAs: (value: string) => (value === "" ? null : value)
              })}
            >
              <option value="">Sin categoría (usado manual)</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              Con categoría, el usado se calcula con los egresos del período en esa categoría.
            </p>
            <FieldError errors={[errors.category_id]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="item-assigned">Asignado *</FieldLabel>
            <Input
              id="item-assigned"
              type="number"
              min="0"
              step="1"
              {...form.register("assigned_amount")}
            />
            <FieldError errors={[errors.assigned_amount]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="item-initial">Usado inicial</FieldLabel>
            <Input
              id="item-initial"
              type="number"
              min="0"
              step="1"
              {...form.register("initial_used_amount")}
            />
            <FieldError errors={[errors.initial_used_amount]} />
          </Field>
          <Field>
            <FieldLabel htmlFor="item-notes">Notas</FieldLabel>
            <Textarea id="item-notes" rows={2} {...form.register("notes")} />
          </Field>
          <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? "Guardando..." : "Guardar ítem"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
