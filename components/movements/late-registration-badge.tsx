import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface LateRegistrationBadgeProps {
  days: number
  className?: string
}

export function LateRegistrationBadge({ days, className }: LateRegistrationBadgeProps) {
  return (
    <Badge
      variant="warn"
      title={`Registrado ${days} días después de la fecha del movimiento`}
      className={cn("whitespace-nowrap", className)}
    >
      Registrado tarde · {days} d
    </Badge>
  )
}
