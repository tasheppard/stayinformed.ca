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
}

export default nextConfig

