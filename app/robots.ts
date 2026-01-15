import { MetadataRoute } from 'next'
import { getBaseUrl } from '@/lib/utils/site-url'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl()

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/account', '/login', '/signup', '/subscribe'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
