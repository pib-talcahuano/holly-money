import { z } from "zod"

// Not z.string().uuid(): Zod v4's .uuid() enforces the RFC4122 version/variant
// nibbles, which the repo's own local seed IDs (e.g. "e2e00000-0000-0000-0000-
// 0000000000a1") don't follow. These are DB foreign keys — Postgres already
// enforces the real uuid type and FK integrity — so this only needs to reject
// obviously malformed input, not police RFC4122 compliance.
export const uuidSchema = (message: string) =>
  z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, message)

export const createBudgetPeriodSchema = z.object({
  year: z.number().int("Año inválido").min(2000, "Año inválido").max(2100, "Año inválido")
})

export const upsertMinistryBudgetSchema = z.object({
  ministry_id: uuidSchema("Ministerio inválido"),
  budget_period_id: uuidSchema("Período inválido"),
  // Omitted for a parent whose total is the sum of its sub-items: the stored amount is kept.
  assigned_amount: z.coerce.number().min(0, "El monto asignado no puede ser negativo").optional(),
  initial_used_amount: z.coerce
    .number()
    .min(0, "El monto inicial utilizado no puede ser negativo")
    .default(0),
  notes: z.string().optional()
})

export type CreateBudgetPeriodInput = z.infer<typeof createBudgetPeriodSchema>
export type UpsertMinistryBudgetInput = z.infer<typeof upsertMinistryBudgetSchema>
