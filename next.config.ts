import type { NextConfig } from 'next'

const config: NextConfig = {
  // `next dev` appends a block to CLAUDE.md announcing itself as authority over
  // how code here gets written, and re-adds it when removed. CLAUDE.md is the
  // owner's document; a framework does not get to write in it. The docs it
  // points at are still at node_modules/next/dist/docs/ for anyone who wants
  // them.
  agentRules: false,
  // The header half of the noindex triple. It lives here rather than only in
  // `vercel.json` so that `next dev` and any other host carry it too -- a
  // protection that exists on exactly one platform is a protection that a
  // change of platform silently removes.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, noimageindex' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
    ]
  },
}

export default config
