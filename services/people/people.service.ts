import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { auditService } from "@/services/audit/audit.service"
import { groupDeliveredByNames, normalizeTargetName } from "@/lib/utils/people"
import type { DeliveredByRow, PeopleMovementType, PersonName } from "@/types/people"

type DB = SupabaseClient<Database>

const PAGE_SIZE = 1000
const UPDATE_CHUNK_SIZE = 200
const MAX_NAME_LENGTH = 100
const MAX_MERGE_MOVEMENTS = 5000

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

function assertWithinCap(count: number) {
  if (count > MAX_MERGE_MOVEMENTS) {
    throw new Error(
      `Demasiados movimientos en una sola unión (${count}). El máximo es ${MAX_MERGE_MOVEMENTS}.`
    )
  }
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
    assertWithinCap(affected.length)
    return { affected: affected.length }
  },

  async merge(
    db: DB,
    input: { movementType: PeopleMovementType; fromNames: string[]; toName: string; userId: string }
  ): Promise<{ updated: number }> {
    const { target, sources } = prepare(input.fromNames, input.toName)
    const affected = await findAffected(db, input.movementType, sources, target)
    if (affected.length === 0) return { updated: 0 }
    assertWithinCap(affected.length)

    const mergeId = crypto.randomUUID()
    const note = `Unión de nombres ${mergeId}`
    const fromNames = [...sources]

    // Written before any update so a crash mid-merge leaves a trace of what was intended.
    const { error: startError } = await auditService.logSystem({
      entity: "people",
      action: "Unión de nombres iniciada",
      user_id: input.userId,
      new_value: {
        movement_type: input.movementType,
        from_names: fromNames,
        to_name: target,
        expected: affected.length,
        merge_id: mergeId
      }
    })
    if (startError) {
      console.error("people.merge: no se pudo registrar el inicio de la unión", startError)
      throw new Error("No se pudo registrar la auditoría de la unión. No se modificó nada.")
    }

    // Group by the old spelling so each update can guard on it: a row renamed by someone else
    // after our read simply does not match and is skipped (and reported as short).
    const idsByOldName = new Map<string, string[]>()
    for (const row of affected) {
      idsByOldName.set(row.delivered_by, [...(idsByOldName.get(row.delivered_by) ?? []), row.id])
    }

    let updated = 0
    let missingAudit = 0
    let hadFailure = false

    for (const [oldName, allIds] of idsByOldName) {
      for (let i = 0; i < allIds.length; i += UPDATE_CHUNK_SIZE) {
        const ids = allIds.slice(i, i + UPDATE_CHUNK_SIZE)
        const { data, error } = await db
          .from("movements")
          .update({
            delivered_by: target,
            updated_by_id: input.userId,
            updated_at: new Date().toISOString()
          })
          .eq("movement_type", input.movementType)
          .eq("delivered_by", oldName)
          .in("id", ids)
          .select("id")
        if (error) {
          hadFailure = true
          console.error("people.merge: error al actualizar un lote", error)
          continue
        }
        const done = (data ?? []).map((row) => row.id)
        updated += done.length
        if (done.length < ids.length) hadFailure = true
        if (done.length === 0) continue
        try {
          await auditService.logMovementsBulk(
            done.map((id) => ({
              movement_id: id,
              action: "Nombre actualizado",
              user_id: input.userId,
              previous_value: { delivered_by: oldName },
              new_value: { delivered_by: target },
              note
            }))
          )
        } catch (auditError) {
          hadFailure = true
          missingAudit += done.length
          console.error("people.merge: error al auditar un lote", auditError)
        }
      }
    }

    if (updated > 0) {
      const { error } = await auditService.logSystem({
        entity: "people",
        action: "Nombres unidos",
        user_id: input.userId,
        new_value: {
          movement_type: input.movementType,
          from_names: fromNames,
          to_name: target,
          updated,
          merge_id: mergeId
        }
      })
      if (error) {
        hadFailure = true
        console.error("people.merge: error al registrar el resumen de la unión", error)
      }
    }

    if (hadFailure) {
      throw new Error(
        `No se pudieron unir todos los nombres: se actualizaron ${updated} de ${affected.length} movimientos y faltan ${missingAudit} entradas de auditoría (unión ${mergeId}). Puedes volver a intentarlo.`
      )
    }
    return { updated }
  }
}
