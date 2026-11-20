export type FundOption = { id: string; name: string }

// The current fund may belong to another period (so it is not among the selectable options).
// Add it so the select reflects the stored value instead of showing a misleading one.
export function withCurrentFundOption(
  options: FundOption[],
  currentId: string | null,
  currentName: string | null
): FundOption[] {
  if (!currentId || options.some((o) => o.id === currentId)) return options
  return [...options, { id: currentId, name: `${currentName ?? "Fondo asignado"} (otro período)` }]
}
