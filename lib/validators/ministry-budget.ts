import { z } from "zod"

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido")

// Not z.string().uuid(): Zod v4's .uuid() enforces the RFC4122 version/variant
// nibbles, which the repo's own local seed IDs (e.g. "e2e00000-0000-0000-0000-
// 0000000000a1") don't follow. These are DB foreign keys — Postgres already
// enforces the real uuid type and FK integrity — so this only needs to reject
// obviously malformed input, not police RFC4122 compliance.
const uuidSchema = (message: string) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, message)

export const upsertBudgetPeriodSchema = z
  .object({
    id: uuidSchema("ID de período inválido").optional(),
    label: z.string().min(2, "El nombre del período debe tener al menos 2 caracteres"),
    start_date: dateSchema,
    end_date: dateSchema
  })
  .refine((data) => data.end_date > data.start_date, {
    message: "La fecha de término debe ser posterior a la fecha de inicio",
    path: ["end_date"]
  })

export const upsertMinistryBudgetSchema = z.object({
  ministry_id: uuidSchema("Ministerio inválido"),
  budget_period_id: uuidSchema("Período inválido"),
  assigned_amount: z.coerce.number().positive("El monto asignado debe ser mayor a 0"),
  initial_used_amount: z.coerce
    .number()
    .min(0, "El monto inicial utilizado no puede ser negativo")
    .default(0),
  notes: z.string().optional()
})

export type UpsertBudgetPeriodInput = z.infer<typeof upsertBudgetPeriodSchema>
export type UpsertMinistryBudgetInput = z.infer<typeof upsertMinistryBudgetSchema>
