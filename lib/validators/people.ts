import { z } from "zod"
import { normalizeTargetName } from "@/lib/utils/people"

export const peopleMergeSchema = z.object({
  movement_type: z.enum(["INCOME", "EXPENSE"]),
  from_names: z
    .array(z.string().min(1, "Elige al menos un nombre"))
    .min(1, "Elige al menos un nombre")
    .max(50, "No puedes unir más de 50 nombres a la vez"),
  to_name: z
    .string()
    .transform(normalizeTargetName)
    .pipe(
      z
        .string()
        .min(1, "Escribe el nombre final")
        .max(100, "El nombre final no puede superar 100 caracteres")
    )
})

export type PeopleMergeInput = z.infer<typeof peopleMergeSchema>
