import { CheckCheck, CircleCheck, CircleX } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { RichText } from "@/components/ui/rich-text"
import {
  buildCommentThread,
  type ThreadComment,
  type ThreadEvent,
  type ThreadItem,
  type ThreadSide
} from "@/lib/comment-thread"
import { cn } from "@/lib/utils"

// Corner radii (TL TR BR BL) tighten inside a run of messages by the same author:
// 16px on the outer corners of the first/last bubble, 6px between bubbles, 4px on the
// "tail" corner of the last one. Literal classes so Tailwind can see them.
const RADIUS: Record<`${ThreadSide}-${"first" | "mid"}-${"last" | "mid"}`, string> = {
  "requester-first-last": "rounded-[16px_16px_16px_4px]",
  "requester-first-mid": "rounded-[16px_16px_16px_6px]",
  "requester-mid-last": "rounded-[6px_16px_16px_4px]",
  "requester-mid-mid": "rounded-[6px_16px_16px_6px]",
  "reviewer-first-last": "rounded-[16px_16px_4px_16px]",
  "reviewer-first-mid": "rounded-[16px_16px_6px_16px]",
  "reviewer-mid-last": "rounded-[16px_6px_4px_16px]",
  "reviewer-mid-mid": "rounded-[16px_6px_6px_16px]"
}

type MessageItem = Extract<ThreadItem, { type: "message" }>

function Message({ item }: { item: MessageItem }) {
  const reviewer = item.side === "reviewer"
  const radius =
    RADIUS[`${item.side}-${item.first ? "first" : "mid"}-${item.last ? "last" : "mid"}`]

  return (
    <li
      className={cn(
        "flex max-w-[min(78%,560px)] items-end gap-2.5",
        reviewer && "flex-row-reverse self-end",
        item.spaced && "mt-3"
      )}
    >
      <div className="w-8 shrink-0" aria-hidden>
        {item.last && (
          <Avatar className="ring-2 ring-card">
            <AvatarFallback
              className={cn(
                "text-[11.5px] font-extrabold text-white",
                reviewer ? "bg-primary" : "bg-[#f2a516]"
              )}
            >
              {item.initials}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className={cn("flex min-w-0 flex-col gap-1", reviewer ? "items-end" : "items-start")}>
        {item.first && (
          <div className={cn("flex items-center gap-1.5 px-1", reviewer && "flex-row-reverse")}>
            <span className="text-[12.5px] font-bold">{item.name}</span>
            <span
              className={cn(
                "rounded-full px-[7px] py-px text-[10.5px] font-bold",
                reviewer ? "bg-primary-soft text-primary" : "bg-warn-surface text-on-warn"
              )}
            >
              {item.role}
            </span>
          </div>
        )}
        <Bubble
          variant={reviewer ? "default" : "muted"}
          align={reviewer ? "end" : "start"}
          className={cn(
            "max-w-full",
            reviewer
              ? // The dark-mode primary under white text is ~3.3:1; primary-dark darkened 8% clears AA (4.5:1).
                "dark:*:data-[slot=bubble-content]:bg-[color-mix(in_oklch,var(--primary-dark),black_8%)]"
              : "*:data-[slot=bubble-content]:border-border"
          )}
        >
          <BubbleContent className={cn("px-3.5 py-[9px] text-[13.5px] leading-normal", radius)}>
            <RichText
              className={cn(
                "text-[13.5px]",
                reviewer && "[&_a]:text-primary-foreground [&_a]:decoration-current"
              )}
            >
              {item.text}
            </RichText>
          </BubbleContent>
        </Bubble>
        {item.last && (
          <span
            className={cn(
              "flex items-center gap-1 px-1 text-[11px] text-faint",
              reviewer && "flex-row-reverse"
            )}
          >
            {item.time}
            {reviewer && <CheckCheck className="size-3 text-primary" aria-hidden />}
          </span>
        )}
      </div>
    </li>
  )
}

export function CommentThread({
  comments,
  requesterId,
  events
}: {
  comments: ThreadComment[]
  requesterId: string
  events?: ThreadEvent[]
}) {
  const items = buildCommentThread(comments, requesterId, events)

  return (
    <ol className="flex flex-col gap-1" aria-label="Conversación">
      {items.map((item) => {
        if (item.type === "divider") {
          return (
            <li key={item.id} className="mb-2 flex items-center gap-2.5 first:mt-0">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] font-bold tracking-[.04em] text-faint">
                {item.label}
              </span>
              <div className="h-px flex-1 bg-border" />
            </li>
          )
        }
        if (item.type === "event") {
          const approved = item.kind === "APPROVED"
          const Icon = approved ? CircleCheck : CircleX
          return (
            <li key={item.id} className="mt-3 flex justify-center">
              <div
                className={cn(
                  "inline-flex items-center gap-[7px] rounded-full px-3 py-[5px] text-xs font-semibold",
                  approved
                    ? "bg-income-surface text-on-income"
                    : "bg-expense-surface text-on-expense"
                )}
              >
                <Icon className="size-[13px]" aria-hidden />
                <span>{item.text}</span>
                <span className="font-medium text-muted-foreground">· {item.time}</span>
              </div>
            </li>
          )
        }
        return <Message key={item.id} item={item} />
      })}
    </ol>
  )
}
