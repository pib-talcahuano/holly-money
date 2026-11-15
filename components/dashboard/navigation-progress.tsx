"use client"

import { Suspense, useEffect, useRef, useState } from "react"
import { usePathname, useSearchParams } from "next/navigation"

const START_EVENT = "app:navigation-start"
// Safety net for a navigation that never commits (cancelled, same URL, error).
const MAX_VISIBLE_MS = 10_000

// For navigations that don't go through an <a> (router.push from a form/filter).
export function startNavigationProgress() {
  window.dispatchEvent(new Event(START_EVENT))
}

function isPlainLeftClick(event: MouseEvent) {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

// Pages without a loading.tsx keep the previous page on screen until the server
// responds, so the click needs some other sign that it registered. This bar starts
// on any internal link click and ends when the URL actually changes.
function NavigationProgressBar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const locationKey = `${pathname}?${searchParams.toString()}`

  // The location the pending navigation started from: the bar is active only while
  // the current location is still that one, so it clears itself on commit.
  const [startedFrom, setStartedFrom] = useState<string | null>(null)
  const locationKeyRef = useRef(locationKey)
  useEffect(() => {
    locationKeyRef.current = locationKey
  })

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const start = () => {
      setStartedFrom(locationKeyRef.current)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => setStartedFrom(null), MAX_VISIBLE_MS)
    }

    const onClick = (event: MouseEvent) => {
      if (!isPlainLeftClick(event)) return
      const anchor = (event.target as Element | null)?.closest?.("a[href]")
      if (!(anchor instanceof HTMLAnchorElement)) return
      if (anchor.target && anchor.target !== "_self") return
      if (anchor.hasAttribute("download")) return

      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      // Attachment downloads and other API links aren't page navigations.
      if (url.pathname.startsWith("/api/")) return
      const isSamePage =
        url.pathname === window.location.pathname && url.search === window.location.search
      if (isSamePage) return

      start()
    }

    document.addEventListener("click", onClick)
    window.addEventListener(START_EVENT, start)
    return () => {
      document.removeEventListener("click", onClick)
      window.removeEventListener(START_EVENT, start)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (startedFrom !== locationKey) return null

  return (
    <div
      role="progressbar"
      aria-label="Cargando página"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-[2.5px] overflow-hidden"
    >
      <div className="navigation-progress-bar h-full w-full origin-left bg-primary" />
    </div>
  )
}

export function NavigationProgress() {
  // useSearchParams() needs a Suspense boundary above it.
  return (
    <Suspense fallback={null}>
      <NavigationProgressBar />
    </Suspense>
  )
}
