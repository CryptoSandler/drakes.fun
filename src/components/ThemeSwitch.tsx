'use client'

// The theme switch: a track and a disc, in the masthead.
//
// Caller: `app/page.tsx`, `app/verify/page.tsx`, `app/gallery/page.tsx`.
//
// **A switch rather than a button with a word in it.** The masthead is three
// fixed slots at 390 px — wordmark, cluster chip, `Verify` — and a fourth
// labelled control would compete with all three. `role="switch"` is what gives
// a screen reader the state the drawn disc gives everyone else, so nothing is
// carried by the picture alone.
//
// It renders on the server as the default so the markup is never a spinner,
// then adopts the stored value on mount. The attribute itself is already
// correct before paint — `PRE_PAINT_SCRIPT` in the layout sets it ahead of
// React — so this component is catching up with the document, not deciding.

import { useEffect, useState } from 'react'
import { DEFAULT_THEME, normalise, STORAGE_KEY, type Theme } from '../lib/site/theme.ts'

export function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>(DEFAULT_THEME)

  useEffect(() => {
    setTheme(normalise(document.documentElement.dataset.theme))
  }, [])

  const toggle = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // A browser with site data blocked still gets the theme for this page.
      // Losing the preference is a smaller failure than refusing to change it.
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label="Dark theme"
      className="themeswitch"
      onClick={toggle}
    >
      <span className="themeswitch__disc" />
    </button>
  )
}
