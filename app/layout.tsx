// The document shell, and the meta half of the noindex triple.
//
// Caller: Next, for every route.

import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Drakes',
  // The third independent noindex. The other two are the header in
  // `next.config.ts` (and `vercel.json`) and `app/robots.ts`. None of the three
  // reports its own absence, which is why there are three.
  robots: { index: false, follow: false, noarchive: true, noimageindex: true },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
