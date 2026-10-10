import { ROLE_ORDER, USER_ROLES, roleLabel } from "@/lib/constants/roles"
import { formatDate, initialsFor, toDateInput } from "@/lib/utils"

export type ThreadComment = {
  id: string
  user_id: string
  message: string
  created_at: string
  users: { id: string; full_name: string | null; roles: string[] } | null
}

export type ThreadEvent = {
  id: string
  kind: "APPROVED" | "REJECTED"
  actorName: string
  at: string
}

export type ThreadSide = "requester" | "reviewer"

export type ThreadItem =
  | { type: "divider"; id: string; label: string }
  | { type: "event"; id: string; kind: ThreadEvent["kind"]; text: string; time: string }
  | {
      type: "message"
      id: string
      side: ThreadSide
      name: string
      role: string
      initials: string
      text: string
      time: string
      /** First message of a run by the same author: shows name + role. */
      first: boolean
      /** Last message of a run: shows avatar + time. */
      last: boolean
      /** Starts a new run right after another run (not after a divider/event/top). */
      spaced: boolean
    }

const REQUESTER_SIDE_ROLES: string[] = [USER_ROLES.MINISTER, USER_ROLES.DELEGATE]

// Requester side = the request's author, or anyone who only holds ministry-side roles
// (a minister/delegate of the ministry). Everybody else is the review side.
export function threadSideOf(comment: ThreadComment, requesterId: string): ThreadSide {
  if (comment.user_id === requesterId) return "requester"
  const roles = comment.users?.roles ?? []
  if (roles.length > 0 && roles.every((r) => REQUESTER_SIDE_ROLES.includes(r))) return "requester"
  return "reviewer"
}

export function threadRoleLabel(comment: ThreadComment, requesterId: string): string {
  if (comment.user_id === requesterId) return "Solicitante"
  const roles = comment.users?.roles ?? []
  const main = ROLE_ORDER.find((r) => roles.includes(r))
  if (!main) return "Revisor"
  return main === USER_ROLES.BURSAR ? "Tesorería" : roleLabel(main)
}

export function formatThreadTime(value: string | Date): string {
  return new Date(value).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
}

export function buildCommentThread(
  comments: ThreadComment[],
  requesterId: string,
  events: ThreadEvent[] = []
): ThreadItem[] {
  const entries = [
    ...comments.map((c) => ({ at: c.created_at, comment: c, event: null as ThreadEvent | null })),
    ...events.map((e) => ({ at: e.at, comment: null as ThreadComment | null, event: e }))
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  const items: ThreadItem[] = []
  let lastDay = ""
  let prevAuthor: string | null = null

  for (const entry of entries) {
    const day = toDateInput(entry.at)
    if (day !== lastDay) {
      items.push({ type: "divider", id: `day-${day}`, label: formatDate(entry.at) })
      lastDay = day
      prevAuthor = null
    }

    if (entry.event) {
      const e = entry.event
      items.push({
        type: "event",
        id: `event-${e.id}`,
        kind: e.kind,
        text: `${e.actorName} ${e.kind === "APPROVED" ? "aprobó" : "rechazó"} la solicitud`,
        time: formatThreadTime(e.at)
      })
      prevAuthor = null
      continue
    }

    const c = entry.comment!
    const name = c.users?.full_name ?? "Usuario"
    const prev = items[items.length - 1]
    const first = prevAuthor !== c.user_id
    items.push({
      type: "message",
      id: c.id,
      side: threadSideOf(c, requesterId),
      name,
      role: threadRoleLabel(c, requesterId),
      initials: initialsFor(name),
      text: c.message,
      time: formatThreadTime(c.created_at),
      first,
      last: true,
      spaced: first && prev?.type === "message"
    })
    // Close the previous run's tail: it's no longer last if the same author continues.
    if (!first && prev?.type === "message") prev.last = false
    prevAuthor = c.user_id
  }

  return items
}
