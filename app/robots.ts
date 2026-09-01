// One of the three independent places the site refuses indexing. The other two
// are the `X-Robots-Tag` header in `next.config.ts` and the `<meta name=
// "robots">` in the layout. Three, because any one of them can be lost in a
// config change and none of them reports its own absence.
import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  return {
    // Nothing here is ready to be indexed. This stays until launch.
    rules: [{ userAgent: '*', disallow: '/' }],
  }
}
