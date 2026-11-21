import { Pencil, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatCLP } from "@/lib/utils"
import type { BudgetRow, SubItemRow } from "./budget-rows"

const remainingClass = (value: number) => (value < 0 ? "text-destructive" : "")

type Props = {
  row: BudgetRow
  onAdd: (row: BudgetRow) => void
  onEdit: (row: BudgetRow, subItem: SubItemRow) => void
}

// The expanded part of a parent row on /budgets: its sub-items, the spend no sub-item claims,
// and the "add" button. Rendered as table rows inside the parent's <tbody>.
export function BudgetRowSubItems({ row, onAdd, onEdit }: Props) {
  return (
    <>
      {row.children.map((c) => (
        <tr key={c.id} className="bg-muted/30" data-testid={`sub-item-${c.id}`}>
          <td className="py-2 pl-10 pr-5 text-muted-foreground">{c.name}</td>
          <td />
          <td className="px-5 py-2 text-right">{formatCLP(c.assigned)}</td>
          <td />
          <td className="px-5 py-2 text-right text-muted-foreground">{formatCLP(c.used)}</td>
          <td className={`px-5 py-2 text-right font-medium ${remainingClass(c.remaining)}`}>
            {formatCLP(c.remaining)}
          </td>
          <td className="px-5 py-2 text-right">
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Editar sub-ítem ${c.name}`}
              onClick={() => onEdit(row, c)}
            >
              <Pencil className="size-4" />
            </Button>
          </td>
        </tr>
      ))}
      {row.unassignedUsed > 0 && (
        <tr className="bg-muted/30">
          <td className="py-2 pl-10 pr-5 italic text-muted-foreground">Sin asignar</td>
          <td />
          <td />
          <td />
          <td className="px-5 py-2 text-right text-muted-foreground">
            {formatCLP(row.unassignedUsed)}
          </td>
          <td />
          <td />
        </tr>
      )}
      <tr className="bg-muted/30">
        <td colSpan={7} className="py-1.5 pl-10 pr-5">
          <Button size="sm" variant="ghost" onClick={() => onAdd(row)}>
            <Plus className="size-4" /> Agregar sub-ítem
          </Button>
        </td>
      </tr>
    </>
  )
}
