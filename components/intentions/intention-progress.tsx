import { Check, X } from "lucide-react"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

export type IntentionProgressProps = {
  status: "DRAFT" | "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
  fundingMethod: "REIMBURSEMENT" | "TRANSFER"
  hasTransfer: boolean
  hasSettlement: boolean
  hasApprovedSettlement: boolean
  isClosed: boolean
}

type StepState = "complete" | "current" | "pending" | "rejected"

type Step = {
  label: string
  state: StepState
  title?: string
}

// Pure step builder, kept separate from the JSX so Etapa 5 (rendición rework) can
// extend this with new states without touching the rendering logic below.
function buildSteps({
  status,
  fundingMethod,
  hasTransfer,
  hasSettlement,
  hasApprovedSettlement,
  isClosed
}: IntentionProgressProps): Step[] {
  if (status === "DRAFT") {
    return [{ label: "Borrador", state: "current" }]
  }

  // Every non-draft status renders the same full set of stages, even when a
  // later stage can never be reached (e.g. REJECTED/CANCELLED) — the remaining
  // stages just render as "pending" instead of being cut from the list.
  const isApproved = status === "APPROVED"
  const steps: Step[] = [{ label: "Solicitada", state: "complete" }]

  if (status === "PENDING") {
    steps.push({ label: "En revisión", state: "current" })
  } else if (status === "REJECTED") {
    steps.push({ label: "Rechazada", state: "rejected" })
  } else if (status === "CANCELLED") {
    steps.push({ label: "Cancelada", state: "rejected" })
  } else {
    steps.push({ label: "Aprobada", state: "complete" })
  }

  const includesTransfer = fundingMethod === "TRANSFER"
  if (includesTransfer) {
    steps.push({
      label: "Transferencia registrada",
      state: isApproved ? (hasTransfer ? "complete" : "current") : "pending"
    })
  }

  const settlementState: StepState = !isApproved
    ? "pending"
    : hasSettlement
      ? "complete"
      : !includesTransfer || hasTransfer
        ? "current"
        : "pending"
  steps.push({ label: "Rendición enviada", state: settlementState })

  const approvedSettlementState: StepState = !isApproved
    ? "pending"
    : hasApprovedSettlement
      ? "complete"
      : settlementState === "complete"
        ? "current"
        : "pending"
  steps.push({ label: "Rendición aprobada", state: approvedSettlementState })

  steps.push({
    label: "Cerrada",
    state: !isApproved
      ? "pending"
      : isClosed
        ? "complete"
        : approvedSettlementState === "complete"
          ? "current"
          : "pending"
  })

  return steps
}

const CIRCLE_STATE_CLASS: Record<StepState, string> = {
  complete: "bg-income text-white",
  current: "bg-primary text-primary-foreground ring-4 ring-primary/15",
  pending: "bg-card border-2 border-input",
  rejected: "bg-expense text-white"
}

const STATE_LABEL_CLASS: Record<StepState, string> = {
  complete: "text-foreground",
  current: "text-primary font-extrabold",
  pending: "text-muted-foreground",
  rejected: "text-expense font-extrabold"
}

export function IntentionProgress(props: IntentionProgressProps) {
  const steps = buildSteps(props)

  return (
    <Card className="px-4 sm:px-6 py-[22px] rounded-2xl">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="flex items-start min-w-max sm:min-w-0">
          {steps.map((step, index) => {
            const isLast = index === steps.length - 1
            const lineFilled = step.state === "complete"

            return (
              <div key={step.label} className={cn("flex items-start", !isLast && "flex-1")}>
                <div
                  className="flex flex-col items-center gap-1.5 flex-none w-[68px] sm:w-[74px]"
                  title={step.title}
                >
                  <div
                    className={cn(
                      "flex size-[26px] items-center justify-center rounded-full",
                      CIRCLE_STATE_CLASS[step.state]
                    )}
                  >
                    {step.state === "complete" && <Check className="size-3.5" />}
                    {step.state === "rejected" && <X className="size-3.5" />}
                  </div>
                  <span
                    className={cn(
                      "text-[10.5px] text-center leading-tight",
                      STATE_LABEL_CLASS[step.state]
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 min-w-3 mt-3",
                      lineFilled ? "bg-income" : "bg-border"
                    )}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </Card>
  )
}
