export const getBaseUrl = () => {
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL
  if (publicUrl) {
    return publicUrl.replace(/\/+$/, '')
  }

  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`
  }

  return 'http://localhost:3000'
}
