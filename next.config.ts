import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Service worker must not be cached by the HTTP cache so browsers
        // always check for updates on every page load.
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
          {
            // Allow the SW to intercept requests for the entire origin.
            key: "Service-Worker-Allowed",
            value: "/",
          },
        ],
      },
      {
        // PWA manifest — short-lived so installs pick up icon/name changes.
        source: "/manifest.json",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=3600, stale-while-revalidate=86400",
          },
        ],
      },
      {
        // SVG icons — cache for a week; bump filenames to invalidate.
        source: "/icons/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=604800, stale-while-revalidate=86400",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
