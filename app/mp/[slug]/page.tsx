import { notFound } from 'next/navigation'
import { Metadata } from 'next'
import { db } from '@/lib/db'
import { mps } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import Image from 'next/image'
import { MPProfileTabs } from './components/MPProfileTabs'

interface PageProps {
  params: Promise<{ slug: string }>
}

// Generate metadata for SEO
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params
  const mpResults = await db
    .select()
    .from(mps)
    .where(eq(mps.slug, slug))
    .limit(1)

  if (mpResults.length === 0) {
    return {
      title: 'MP Not Found | StayInformed.ca',
    }
  }

  const mp = mpResults[0]
  const title = `${mp.fullName} - MP Profile | StayInformed.ca`
  const description = `Track ${mp.fullName}'s performance, voting records, expenses, and accountability scores. Representing ${mp.constituencyName}, ${mp.province}.`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
    },
  }
}

// Generate static params for all MPs (optional - for static generation)
// export async function generateStaticParams() {
//   const allMPs = await db.select({ slug: mps.slug }).from(mps)
//   return allMPs.map((mp) => ({ slug: mp.slug }))
// }

export default async function MPProfilePage({ params }: PageProps) {
  const { slug } = await params

  // Fetch MP data
  const mpResults = await db
    .select()
    .from(mps)
    .where(eq(mps.slug, slug))
    .limit(1)

  if (mpResults.length === 0) {
    notFound()
  }

  const mp = mpResults[0]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header Section */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-6 md:py-8">
          <div className="flex flex-col md:flex-row gap-6 items-start md:items-center">
            {/* MP Photo */}
            <div className="flex-shrink-0">
              {mp.photoUrl ? (
                <Image
                  src={mp.photoUrl}
                  alt={mp.fullName}
                  width={120}
                  height={120}
                  className="rounded-lg object-cover border-2 border-gray-200"
                  priority
                />
              ) : (
                <div className="w-[120px] h-[120px] rounded-lg bg-gray-200 flex items-center justify-center">
                  <span className="text-gray-400 text-2xl">📷</span>
                </div>
              )}
            </div>

            {/* MP Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                {mp.fullName}
              </h1>
              <div className="space-y-1 text-gray-600">
                {mp.caucusShortName && (
                  <p className="font-medium">{mp.caucusShortName}</p>
                )}
                <p>
                  {mp.constituencyName}, {mp.province}
                </p>
                {mp.email && (
                  <p className="text-sm">
                    <a
                      href={`mailto:${mp.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {mp.email}
                    </a>
                  </p>
                )}
                {mp.phone && (
                  <p className="text-sm">{mp.phone}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation and Content */}
      <div className="container mx-auto px-4 py-6">
        <MPProfileTabs mpId={mp.id} slug={slug} />
      </div>
    </div>
  )
}
