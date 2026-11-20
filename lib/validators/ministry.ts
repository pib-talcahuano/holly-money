import { z } from "zod"

export const createMinistrySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  description: z.string().optional()
})

export const updateMinistrySchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres").optional(),
  description: z.string().optional(),
  is_active: z.boolean().optional()
})

export const deleteMinistrySchema = z.object({
  confirmName: z.string().min(1, "Escribe el nombre del ministerio para confirmar")
})

export const assignMinisterSchema = z.object({
  user_id: z.string().uuid("ID de usuario inválido"),
  notes: z.string().optional()
})

export const inviteDelegateSchema = z.object({
  full_name: z.string().min(3, "Nombre requerido"),
  email: z.email("Email inválido")
})

export type CreateMinistryInput = z.infer<typeof createMinistrySchema>
export type UpdateMinistryInput = z.infer<typeof updateMinistrySchema>
export type DeleteMinistryInput = z.infer<typeof deleteMinistrySchema>
export type AssignMinisterInput = z.infer<typeof assignMinisterSchema>
export type InviteDelegateInput = z.infer<typeof inviteDelegateSchema>
