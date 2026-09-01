'use client'

// The countdown. The only moving thing on the page.
//
// Caller: `app/page.tsx`.
//
// **The server renders the first value, not a spinner.** The reference round's
// sharpest finding was Quantums' fold arriving as em-dashes and the word
// "Loading" (docs/references-web.md), so the initial text comes from the server
// and this component only takes over the ticking. A reader on a slow phone sees
// a real number in the HTML.

import { useEffect, useState } from 'react'

const pad = (n: number) => String(n).padStart(2, '0')

/** `h:mm:ss` past an hour, `mm:ss` under it — never a leading `00:`. */
export function format(remainingSeconds: number): string {
  const s = Math.max(0, remainingSeconds)
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const seconds = s % 60
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}

export function Countdown({
  nextAtUnix,
  periodSeconds,
  initial,
  className,
}: {
  nextAtUnix: number
  periodSeconds: number
  /** Server-computed, so the first paint is a number rather than a placeholder. */
  initial: number
  className?: string
}) {
  const [remaining, setRemaining] = useState(initial)

  useEffect(() => {
    const tick = () => {
      const now = Math.floor(Date.now() / 1000)
      let next = nextAtUnix
      // The boundary passes while the tab is open. Roll forward on the schedule
      // rather than sticking at 00:00 or going negative -- the schedule is
      // anchored on chain and does not wait for a page refresh.
      if (now >= next) next += Math.ceil((now - next + 1) / periodSeconds) * periodSeconds
      setRemaining(next - now)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [nextAtUnix, periodSeconds])

  return (
    <time className={className} dateTime={new Date(nextAtUnix * 1000).toISOString()} suppressHydrationWarning>
      {format(remaining)}
    </time>
  )
}
