"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { ministryBudgetService } from "@/services/ministries/ministry-budget.service"
import {
  upsertBudgetPeriodSchema,
  upsertMinistryBudgetSchema,
  type UpsertBudgetPeriodInput,
  type UpsertMinistryBudgetInput
} from "@/lib/validators/ministry-budget"

function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Datos inválidos")
  }
  return result.data
}

function assertBudgetsAccess(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  if (!user || !can(user.permissions, PERMISSIONS.MANAGE_BUDGETS)) {
    throw new Error("Sin permisos para gestionar presupuestos")
  }
  return user
}

function revalidateBudgetConsumers(ministryId?: string) {
  revalidatePath("/ministries")
  if (ministryId) revalidatePath(`/ministries/${ministryId}`)
}

export async function upsertBudgetPeriod(input: UpsertBudgetPeriodInput) {
  const user = assertBudgetsAccess(await getCurrentUser())
  const parsed = parseOrThrow(upsertBudgetPeriodSchema, input)
  const db = await createSupabaseServerClient()
  const data = await ministryBudgetService.upsertPeriod(db, parsed, user.id)
  revalidateBudgetConsumers()
  return data
}

export async function upsertMinistryBudget(input: UpsertMinistryBudgetInput) {
  const user = assertBudgetsAccess(await getCurrentUser())
  const parsed = parseOrThrow(upsertMinistryBudgetSchema, input)
  const db = await createSupabaseServerClient()
  const data = await ministryBudgetService.upsertBudget(db, parsed, user.id)
  revalidateBudgetConsumers(parsed.ministry_id)
  return data
}
