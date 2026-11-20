const BLOCKER_LABELS: Record<string, string> = {
  budget_intentions: "solicitudes",
  ministry_assignments: "asignaciones de encargado",
  ministry_delegates: "delegados",
  ministry_budgets: "presupuestos"
}

// "solicitudes: 3, presupuestos: 1" — unknown keys are shown as-is.
export function formatDeleteBlockers(blockers: Record<string, number> | null | undefined): string {
  return Object.entries(blockers ?? {})
    .map(([key, n]) => `${BLOCKER_LABELS[key] ?? key}: ${n}`)
    .join(", ")
}
