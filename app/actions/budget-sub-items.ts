"use server"

import { revalidatePath } from "next/cache"
import type { z } from "zod"
import { getCurrentUser, createSupabaseServerClient } from "@/lib/supabase/server"
import { PERMISSIONS, can } from "@/lib/permissions/rbac"
import { budgetSubItemsService } from "@/services/ministries/budget-sub-items.service"
import {
  upsertSubItemSchema,
  setSubItemActiveSchema,
  type UpsertSubItemInput,
  type SetSubItemActiveInput
} from "@/lib/validators/budget-sub-item"

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

export async function upsertSubItem(input: UpsertSubItemInput) {
  const user = assertBudgetsAccess(await getCurrentUser())
  const parsed = parseOrThrow(upsertSubItemSchema, input)
  const db = await createSupabaseServerClient()
  const data = await budgetSubItemsService.upsert(db, parsed, user.id)
  revalidatePath("/budgets")
  return data
}

export async function setSubItemActive(input: SetSubItemActiveInput) {
  const user = assertBudgetsAccess(await getCurrentUser())
  const parsed = parseOrThrow(setSubItemActiveSchema, input)
  const db = await createSupabaseServerClient()
  const data = await budgetSubItemsService.setActive(db, parsed, user.id)
  revalidatePath("/budgets")
  return data
}
