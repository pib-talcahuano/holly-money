import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { auditService } from "@/services/audit/audit.service"
import { groupDeliveredByNames, normalizeTargetName } from "@/lib/utils/people"
import type { DeliveredByRow, PeopleMovementType, PersonName } from "@/types/people"

type DB = SupabaseClient<Database>

const PAGE_SIZE = 1000
const UPDATE_CHUNK_SIZE = 200
const MAX_NAME_LENGTH = 100

type IdNameRow = { id: string; delivered_by: string | null }

/** Reads every page of a movement-type query; the order always ends in `id` so pages are stable. */
async function fetchAllRows<T>(
  db: DB,
  columns: string,
  movementType: PeopleMovementType
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await db
      .from("movements")
      .select(columns)
      .eq("movement_type", movementType)
      .order("movement_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    const page = (data ?? []) as unknown as T[]
    rows.push(...page)
    if (page.length < PAGE_SIZE) return rows
  }
}

/** Validates and normalizes the merge input. Origin names are kept exactly as stored. */
function prepare(fromNames: string[], toName: string) {
  const target = normalizeTargetName(toName ?? "")
  if (!target) throw new Error("Escribe el nombre final")
  if (target.length > MAX_NAME_LENGTH) {
    throw new Error(`El nombre final no puede superar ${MAX_NAME_LENGTH} caracteres`)
  }
  if (!Array.isArray(fromNames) || fromNames.length === 0) {
    throw new Error("Elige al menos un nombre")
  }
  for (const name of fromNames) {
    if (typeof name !== "string" || !name.trim()) {
      throw new Error("Los nombres de origen no pueden estar vacíos")
    }
  }
  return { target, sources: new Set(fromNames) }
}

async function findAffected(
  db: DB,
  movementType: PeopleMovementType,
  sources: Set<string>,
  target: string
) {
  const rows = await fetchAllRows<IdNameRow>(db, "id, delivered_by", movementType)
  return rows.filter(
    (row): row is { id: string; delivered_by: string } =>
      row.delivered_by !== null && sources.has(row.delivered_by) && row.delivered_by !== target
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export const peopleService = {
  async list(db: DB, input: { movementType: PeopleMovementType }): Promise<PersonName[]> {
    const rows = await fetchAllRows<DeliveredByRow>(
      db,
      "delivered_by, amount, movement_date, status",
      input.movementType
    )
    return groupDeliveredByNames(rows)
  },

  async preview(
    db: DB,
    input: { movementType: PeopleMovementType; fromNames: string[]; toName: string }
  ): Promise<{ affected: number }> {
    const { target, sources } = prepare(input.fromNames, input.toName)
    const affected = await findAffected(db, input.movementType, sources, target)
    return { affected: affected.length }
  },

  async merge(
    db: DB,
    input: { movementType: PeopleMovementType; fromNames: string[]; toName: string; userId: string }
  ): Promise<{ updated: number }> {
    const { target, sources } = prepare(input.fromNames, input.toName)
    const affected = await findAffected(db, input.movementType, sources, target)
    if (affected.length === 0) return { updated: 0 }

    const previousById = new Map(affected.map((row) => [row.id, row.delivered_by]))
    const mergeId = crypto.randomUUID()
    const note = `Unión de nombres ${mergeId}`
    const failures: string[] = []
    let updated = 0
    let missingAudit = 0

    for (let i = 0; i < affected.length; i += UPDATE_CHUNK_SIZE) {
      const ids = affected.slice(i, i + UPDATE_CHUNK_SIZE).map((row) => row.id)
      const { data, error } = await db
        .from("movements")
        .update({
          delivered_by: target,
          updated_by_id: input.userId,
          updated_at: new Date().toISOString()
        })
        .in("id", ids)
        .select("id")
      if (error) {
        failures.push(`error al actualizar un lote de ${ids.length}: ${errorMessage(error)}`)
        continue
      }
      const done = (data ?? []).map((row) => row.id)
      updated += done.length
      if (done.length < ids.length) {
        failures.push(`un lote devolvió ${done.length} de ${ids.length} movimientos`)
      }
      if (done.length === 0) continue
      try {
        await auditService.logMovementsBulk(
          done.map((id) => ({
            movement_id: id,
            action: "Nombre actualizado",
            user_id: input.userId,
            previous_value: { delivered_by: previousById.get(id) ?? null },
            new_value: { delivered_by: target },
            note
          }))
        )
      } catch (auditError) {
        missingAudit += done.length
        failures.push(
          `falló la auditoría de ${done.length} movimientos: ${errorMessage(auditError)}`
        )
      }
    }

    if (updated > 0) {
      const { error } = await auditService.logSystem({
        entity: "people",
        action: "Nombres unidos",
        user_id: input.userId,
        new_value: {
          movement_type: input.movementType,
          from_names: [...sources],
          to_name: target,
          updated,
          merge_id: mergeId
        }
      })
      if (error) failures.push(`falló el registro de auditoría del sistema: ${errorMessage(error)}`)
    }

    if (failures.length > 0) {
      throw new Error(
        `La unión de nombres ${mergeId} terminó con errores. Movimientos ya actualizados: ${updated} de ${affected.length}. Entradas de auditoría faltantes: ${missingAudit}. Detalle: ${failures.join("; ")}`
      )
    }
    return { updated }
  }
}
