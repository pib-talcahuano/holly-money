import { z } from "zod"
import { uuidSchema } from "./ministry-budget"

export const upsertBudgetItemSchema = z.object({
  id: uuidSchema("ID de ítem inválido").optional(),
  budget_period_id: uuidSchema("Período inválido"),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  assigned_amount: z.coerce.number().positive("El monto asignado debe ser mayor a 0"),
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

export type UpsertBudgetItemInput = z.infer<typeof upsertBudgetItemSchema>
export type SetBudgetItemActiveInput = z.infer<typeof setBudgetItemActiveSchema>
