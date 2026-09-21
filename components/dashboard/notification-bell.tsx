"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Link from "next/link"
import { Bell, BellOff, CheckCheck } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  type NotificationItem,
  getNotificationTitle,
  getNotificationDescription,
  getRelativeTime,
  NOTIFICATION_META,
  itemKey,
  loadReadSet,
  saveReadSet
} from "@/lib/notifications"

export function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [readKeys, setReadKeys] = useState<Set<string>>(() => loadReadSet())
  const [open, setOpen] = useState(false)

  const fetchNotifications = useCallback(() => {
    fetch("/api/notifications")
      .then((res) => (res.ok ? (res.json() as Promise<{ items?: NotificationItem[] }>) : null))
      .then((data) => {
        if (!data) return
        setItems(data.items ?? [])
      })
      .catch(() => null)
  }, [])

  useEffect(() => {
    fetchNotifications()
    const interval = setInterval(fetchNotifications, 60_000)
    return () => clearInterval(interval)
  }, [fetchNotifications])

  const unreadCount = useMemo(
    () => items.filter((item) => !readKeys.has(itemKey(item))).length,
    [items, readKeys]
  )

  const markAllRead = useCallback(() => {
    setReadKeys((prev) => {
      const next = new Set(prev)
      items.forEach((item) => next.add(itemKey(item)))
      saveReadSet(next)
      return next
    })
  }, [items])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="outline"
            size="icon-sm"
            className="relative size-[34px] rounded-[9px] text-muted-foreground shadow-none hover:bg-muted"
            aria-label="Notificaciones"
          >
            <Bell className="size-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-[3px] -right-[3px] flex size-[15px] items-center justify-center rounded-full bg-expense text-[9px] font-bold text-white">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent
        align="end"
        className="w-[min(380px,calc(100vw-40px))] rounded-[16px] p-0 shadow-[0_20px_48px_-16px_rgba(22,17,41,0.3)]"
      >
        <div className="flex items-center justify-between px-[18px] py-4 border-b border-border">
          <div className="flex items-center gap-2">
            <p className="text-sm font-extrabold">Notificaciones</p>
            {unreadCount > 0 && (
              <span className="rounded-full bg-expense-surface px-2 py-0.5 text-[10.5px] font-extrabold text-on-expense">
                {unreadCount} nueva{unreadCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1.5 text-[11.5px] font-bold text-primary hover:underline"
            >
              <CheckCheck className="size-3.5" />
              Marcar todas
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center px-7 pt-10 pb-[34px] text-center">
            <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-muted">
              <BellOff className="size-6 text-faint" />
            </div>
            <p className="mb-1 text-sm font-bold">Todo al día</p>
            <p className="max-w-[240px] text-[12.5px] leading-[1.5] text-muted-foreground">
              No tienes notificaciones nuevas por ahora. Te avisaremos apenas haya novedades.
            </p>
          </div>
        ) : (
          <ul className="max-h-[360px] divide-y divide-border overflow-y-auto">
            {items.map((item, i) => {
              const meta = NOTIFICATION_META[item.type]
              const Icon = meta.icon
              const isUnread = !readKeys.has(itemKey(item))
              const time = getRelativeTime(item.created_at)
              return (
                <li key={i}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-[18px] py-3.5 hover:bg-muted/50 transition-colors"
                  >
                    <div
                      className={cn(
                        "flex size-8 shrink-0 items-center justify-center rounded-[10px]",
                        meta.tile
                      )}
                    >
                      <Icon className={cn("size-4", meta.icon_cls)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold">{getNotificationTitle(item)}</p>
                      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                        {getNotificationDescription(item)}
                      </p>
                      {time && (
                        <p className="text-[11px] font-semibold text-muted-foreground/70 mt-1">
                          {time}
                        </p>
                      )}
                    </div>
                    {isUnread && (
                      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
        <div className="border-t border-border px-[18px] py-3 text-center">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="text-[12.5px] font-bold text-primary hover:underline"
          >
            Ver todas las notificaciones →
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  )
}
