// The document shell, and the meta half of the noindex triple.
//
// Caller: Next, for every route.

import type { Metadata } from 'next'
import './globals.css'
import { DEFAULT_THEME, PRE_PAINT_SCRIPT } from '../src/lib/site/theme.ts'

export const metadata: Metadata = {
  title: 'Drakes',
  // The third independent noindex. The other two are the header in
  // `next.config.ts` (and `vercel.json`) and `app/robots.ts`. None of the three
  // reports its own absence, which is why there are three.
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* Before paint, ahead of React. Without it the page renders light and
            then flips, which is a worse artefact than no dark theme at all.
            `suppressHydrationWarning` on <html> because this script rewrites
            the attribute the server rendered, on purpose. */}
        <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
