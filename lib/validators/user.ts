import { z } from "zod"
import { USER_ROLES, ROLE_ORDER, EXCLUSIVE_ROLES } from "@/lib/constants/roles"
import type { UserRole } from "@/types/auth"

const userRoleEnum = ROLE_ORDER as [UserRole, ...UserRole[]]

// DELEGATE is created only by the ministries flow, never from the users dialog.
const CREATABLE_ROLES: UserRole[] = [
  USER_ROLES.ADMIN,
  USER_ROLES.BURSAR,
  USER_ROLES.FINANCE,
  USER_ROLES.MINISTER
]

function rolesSchema(allowed: readonly UserRole[]) {
  return z
    .array(z.enum(userRoleEnum))
    .min(1, "Selecciona al menos un rol")
    .refine((roles) => roles.every((role) => allowed.includes(role)), "Rol no permitido")
    .refine((roles) => new Set(roles).size === roles.length, "Roles duplicados")
    .refine(
      (roles) => roles.length === 1 || !roles.some((role) => EXCLUSIVE_ROLES.includes(role)),
      "Este rol no se puede combinar con otros"
    )
}

export const createUserSchema = z.object({
  full_name: z.string().min(3, "Nombre requerido"),
  email: z.email("Email inválido"),
  roles: rolesSchema(CREATABLE_ROLES)
})

export const updateUserSchema = z.object({
  id: z.string().min(1),
  full_name: z.string().min(3, "Nombre requerido"),
  // Update accepts every role so a DELEGATE (or ADMIN) user can resubmit the dialog unchanged;
  // usersService.update refuses to change a DELEGATE user's roles.
  roles: rolesSchema(ROLE_ORDER),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING_ACTIVATION", "PENDING_RESET"])
})

export const updateOwnProfileSchema = z.object({
  full_name: z.string().min(3, "Nombre requerido")
})

export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type UpdateOwnProfileInput = z.infer<typeof updateOwnProfileSchema>
