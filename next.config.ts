import type { NextConfig } from 'next'

const config: NextConfig = {
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
