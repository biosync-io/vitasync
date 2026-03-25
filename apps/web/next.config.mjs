import path from "path"
import { fileURLToPath } from "url"
import withPWAInit from "@ducanh2912/next-pwa"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  customWorkerSrc: "service-worker",
  fallbacks: {
    document: "/offline",
  },
  workboxOptions: {
    runtimeCaching: [
      {
        // Static assets — cache first, long TTL
        urlPattern: /^\/icons\/.*\.png$/,
        handler: "CacheFirst",
        options: {
          cacheName: "icon-cache",
          expiration: {
            maxEntries: 20,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          },
        },
      },
      {
        // Google Fonts stylesheets
        urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "google-fonts-stylesheets",
        },
      },
      {
        // Google Fonts webfont files
        urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "google-fonts-webfonts",
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
          },
        },
      },
      {
        // API data — stale while revalidate for read endpoints
        urlPattern: /^\/api\/v1\/.*$/,
        method: "GET",
        handler: "NetworkFirst",
        options: {
          cacheName: "api-cache",
          expiration: {
            maxEntries: 200,
            maxAgeSeconds: 5 * 60, // 5 minutes
          },
          networkTimeoutSeconds: 10,
        },
      },
      {
        // Next.js static chunks
        urlPattern: /^\/_next\/static\/.*/i,
        handler: "CacheFirst",
        options: {
          cacheName: "next-static",
          expiration: {
            maxEntries: 100,
            maxAgeSeconds: 365 * 24 * 60 * 60,
          },
        },
      },
      {
        // Next.js data fetches
        urlPattern: /^\/_next\/data\/.*/i,
        handler: "StaleWhileRevalidate",
        options: {
          cacheName: "next-data",
          expiration: {
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60,
          },
        },
      },
      {
        // Images
        urlPattern: /\.(?:jpg|jpeg|gif|png|svg|ico|webp|avif)$/i,
        handler: "CacheFirst",
        options: {
          cacheName: "image-cache",
          expiration: {
            maxEntries: 60,
            maxAgeSeconds: 30 * 24 * 60 * 60,
          },
        },
      },
    ],
  },
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../../"),
  typedRoutes: true,
  reactCompiler: true,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  compress: true,
  poweredByHeader: false,
}

export default withPWA(nextConfig)
