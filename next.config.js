/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    formats: ['image/webp', 'image/avif'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'www.ourcommons.ca',
      },
    ],
  },
  compress: true,
  poweredByHeader: false,
  // Note: Next.js automatically loads .env.production during production builds
  // For Vercel: DATABASE_URL must be set in Vercel dashboard environment variables
  // For local production builds: .env.production is automatically loaded
}

export default nextConfig

