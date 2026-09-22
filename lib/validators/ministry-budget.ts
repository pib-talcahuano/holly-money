import { z } from "zod"

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido")

export const upsertBudgetPeriodSchema = z
  .object({
    id: z.string().uuid().optional(),
    label: z.string().min(2, "El nombre del período debe tener al menos 2 caracteres"),
    start_date: dateSchema,
    end_date: dateSchema
  })
  .refine((data) => data.end_date > data.start_date, {
    message: "La fecha de término debe ser posterior a la fecha de inicio",
    path: ["end_date"]
  })

export const upsertMinistryBudgetSchema = z.object({
  ministry_id: z.string().uuid("Ministerio inválido"),
  budget_period_id: z.string().uuid("Período inválido"),
  assigned_amount: z.coerce.number().positive("El monto asignado debe ser mayor a 0"),
  initial_used_amount: z.coerce
    .number()
    .min(0, "El monto inicial utilizado no puede ser negativo")
    .default(0),
  notes: z.string().optional()
})

export type UpsertBudgetPeriodInput = z.infer<typeof upsertBudgetPeriodSchema>
export type UpsertMinistryBudgetInput = z.infer<typeof upsertMinistryBudgetSchema>
