import { z } from "zod"

export const attachmentInputSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive()
})

export const movementBaseSchema = z.object({
  movement_date: z.string().date("La fecha no tiene un formato válido"),
  movement_type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().positive("El monto debe ser mayor a 0"),
  category_id: z.string().uuid("Selecciona una categoría"),
  subcategory_id: z.string().uuid().optional().nullable(),
  delivered_by: z.string().optional().nullable(),
  receipt_email: z
    .union([z.literal(""), z.string().email("Correo inválido")])
    .optional()
    .nullable(),
  payment_method_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  // Defaults true (the old, only behavior) so existing callers of the REST
  // API (app/api/movements) that don't yet know about this field keep
  // getting notified rather than a 400 or a silent opt-out.
  notify_by_email: z.boolean().optional().default(true),
  attachments: z.array(attachmentInputSchema).max(10, "Máximo 10 adjuntos").optional().default([])
})

export const createMovementSchema = movementBaseSchema

export const updateMovementSchema = movementBaseSchema.extend({
  id: z.string().min(1)
})

export const cancelMovementSchema = z.object({
  cancellation_reason: z.string().min(3, "Debes indicar un motivo de anulacion")
})

export const movementFiltersSchema = z.object({
  search: z.string().optional(),
  movement_type: z.enum(["INCOME", "EXPENSE", "ALL"]).optional().default("ALL"),
  status: z.enum(["ACTIVE", "CANCELLED", "ALL"]).optional().default("ALL")
})

export const movementSearchSchema = z.object({
  query: z.string().trim().min(2).max(100)
})

export type AttachmentInput = z.infer<typeof attachmentInputSchema>
export type CreateMovementInput = z.infer<typeof createMovementSchema>
export type UpdateMovementInput = z.infer<typeof updateMovementSchema>
export type CancelMovementInput = z.infer<typeof cancelMovementSchema>
export type MovementFilters = z.infer<typeof movementFiltersSchema>
export type MovementSearchInput = z.infer<typeof movementSearchSchema>
