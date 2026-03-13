/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    typedRoutes: true,
  },
  async rewrites() {
    // In production, API calls go through this rewrite so the web container
    // can call the API container on the internal Docker network.
    return [
      {
        source: "/api/v1/:path*",
        destination: `${process.env["NEXT_PUBLIC_API_URL"] ?? "http://api:3001"}/v1/:path*`,
      },
    ]
  },
}

export default nextConfig
