import { MetadataRoute } from 'next'
import { db } from '@/lib/db'
import { mps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getBaseUrl } from '@/lib/utils/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getBaseUrl()
  const now = new Date()

  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}/`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/how-scores-work`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.7,
    },
    {
      url: `${baseUrl}/compare`,
      lastModified: now,
      changeFrequency: 'weekly',
      priority: 0.6,
    },
  ]

  if (!process.env.DATABASE_URL) {
    return staticRoutes
  }

  const mpRows = await db
    .select({ slug: mps.slug, updatedAt: mps.updatedAt })
    .from(mps)
    .where(eq(mps.isActive, true))

  const mpRoutes: MetadataRoute.Sitemap = mpRows.map((mp) => ({
    url: `${baseUrl}/mp/${mp.slug}`,
    lastModified: mp.updatedAt ?? now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  return [...staticRoutes, ...mpRoutes]
}
