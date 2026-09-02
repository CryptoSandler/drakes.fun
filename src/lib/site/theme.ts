// The two themes, and the deliberate absence of a third.
//
// Caller: `src/components/ThemeSwitch.tsx` and the pre-paint script in
// `app/layout.tsx`.
//
// **There is no `system`.** A third state has to be explained in the control,
// persisted as distinct from "the same as system happens to be right now", and
// re-resolved whenever the OS changes underneath a reader who never asked. Two
// states, light by default, chosen by the reader and remembered.
//
// The consequence is a rule the guard enforces: **no `prefers-color-scheme`
// query anywhere in this project.** A media query that changes the palette is
// a `system` mode whether or not anything is labelled one.

export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** Light is the band the design was drawn in. Dark is the one it was measured into. */
export const DEFAULT_THEME: Theme = 'light'

export const STORAGE_KEY = 'drakes-theme'

/** Anything that is not one of the two is the default — never a third state. */
export function normalise(value: unknown): Theme {
  return value === 'dark' || value === 'light' ? value : DEFAULT_THEME
}

/**
 * The script that runs before first paint.
 *
 * It is a string because it has to execute in `<head>`, ahead of React, or the
 * page paints light and then flips — which is worse than no dark theme at all.
 * `try` because a browser with site data blocked throws on the read, and the
 * right answer to that is the default rather than a blank page.
 */
export const PRE_PAINT_SCRIPT =
  `try{var t=localStorage.getItem(${JSON.stringify(STORAGE_KEY)});` +
  `document.documentElement.dataset.theme=(t==='dark'||t==='light')?t:'${DEFAULT_THEME}'}` +
  `catch(e){document.documentElement.dataset.theme='${DEFAULT_THEME}'}`
