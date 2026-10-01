import { z } from "zod"
import { ROLE_ORDER } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"

const userRoleEnum = ROLE_ORDER as [UserRole, ...UserRole[]]

// A user holds one or more roles. ADMIN is exclusive: it can't be combined with other roles.
const rolesSchema = z
  .array(z.enum(userRoleEnum))
  .min(1, "Selecciona al menos un rol")
  .refine((roles) => new Set(roles).size === roles.length, "Roles duplicados")
  .refine((roles) => !roles.includes("ADMIN") || roles.length === 1, {
    message: "El rol Admin no se puede combinar con otros roles"
  })

export const createUserSchema = z.object({
  full_name: z.string().min(3, "Nombre requerido"),
  email: z.email("Email inválido"),
  roles: rolesSchema
})

export const updateUserSchema = z.object({
  id: z.string().min(1),
  full_name: z.string().min(3, "Nombre requerido"),
  roles: rolesSchema,
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING_ACTIVATION", "PENDING_RESET"])
})

export const updateOwnProfileSchema = z.object({
  full_name: z.string().min(3, "Nombre requerido")
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>
