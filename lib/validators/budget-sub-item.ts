import { z } from "zod"
import { uuidSchema } from "./ministry-budget"

// The fields a user types in the form; the parent is attached when submitting.
export const subItemFormSchema = z.object({
  id: uuidSchema("ID de sub-ítem inválido").optional(),
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres"),
  assigned_amount: z.coerce.number().positive("El monto asignado debe ser mayor a 0"),
  category_id: uuidSchema("Categoría inválida").nullable().optional(),
  notes: z.string().optional()
})

export const upsertSubItemSchema = subItemFormSchema
  .extend({
    ministry_budget_id: uuidSchema("Presupuesto de ministerio inválido").nullable().optional(),
    budget_item_id: uuidSchema("Ítem inválido").nullable().optional()
  })
  .refine((v) => Boolean(v.ministry_budget_id) !== Boolean(v.budget_item_id), {
    message: "El sub-ítem debe pertenecer a un ministerio o a un ítem, no a ambos",
    path: ["ministry_budget_id"]
  })

export const setSubItemActiveSchema = z.object({
  id: uuidSchema("ID de sub-ítem inválido"),
  is_active: z.boolean()
})

export type SubItemFormInput = z.infer<typeof subItemFormSchema>
export type UpsertSubItemInput = z.infer<typeof upsertSubItemSchema>
export type SetSubItemActiveInput = z.infer<typeof setSubItemActiveSchema>
