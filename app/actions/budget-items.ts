"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { budgetItemsService } from "@/services/ministries/budget-items.service"
import {
  upsertBudgetItemSchema,
  setBudgetItemActiveSchema,
  type UpsertBudgetItemInput,
  type SetBudgetItemActiveInput
} from "@/lib/validators/budget-item"

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

export async function upsertBudgetItem(input: UpsertBudgetItemInput) {
  const user = assertBudgetsAccess(await getCurrentUser())
  const parsed = parseOrThrow(upsertBudgetItemSchema, input)
  const db = await createSupabaseServerClient()
  const data = await budgetItemsService.upsertItem(db, parsed, user.id)
  revalidatePath("/budgets")
  return data
}

export async function setBudgetItemActive(input: SetBudgetItemActiveInput) {
  const user = assertBudgetsAccess(await getCurrentUser())
  const parsed = parseOrThrow(setBudgetItemActiveSchema, input)
  const db = await createSupabaseServerClient()
  const data = await budgetItemsService.setActive(db, parsed, user.id)
  revalidatePath("/budgets")
  return data
}
