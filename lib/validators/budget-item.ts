import { z } from "zod"
import { uuidSchema } from "./ministry-budget"

export const upsertBudgetItemSchema = z.object({
  id: uuidSchema("ID de ítem inválido").optional(),
  budget_period_id: uuidSchema("Período inválido"),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  assigned_amount: z.coerce.number().min(0, "El monto asignado no puede ser negativo"),
  initial_used_amount: z.coerce
    .number()
    .min(0, "El monto inicial utilizado no puede ser negativo")
    .default(0),
  category_id: uuidSchema("Categoría inválida").nullable().optional(),
  notes: z.string().optional()
})

export const setBudgetItemActiveSchema = z.object({
  id: uuidSchema("ID de ítem inválido"),
  is_active: z.boolean()
})

export const updateBudgetItemAmountsSchema = z.object({
  id: uuidSchema("ID de ítem inválido"),
  // Omitted for a parent whose total is the sum of its sub-items: the stored amount is kept.
  assigned_amount: z.coerce.number().min(0, "El monto asignado no puede ser negativo").optional(),
  initial_used_amount: z.coerce
    .number()
    .min(0, "El monto inicial utilizado no puede ser negativo")
    .default(0)
})

export type UpsertBudgetItemInput = z.infer<typeof upsertBudgetItemSchema>
export type SetBudgetItemActiveInput = z.infer<typeof setBudgetItemActiveSchema>
export type UpdateBudgetItemAmountsInput = z.infer<typeof updateBudgetItemAmountsSchema>
