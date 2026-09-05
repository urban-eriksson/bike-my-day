import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Deployed to a shared t3.micro, so the artifact has to be small and the box
  // must never run `next build` (it wants ~1 GB and would OOM the neighbours).
  // Standalone traces only what is actually imported: 49 MB instead of the
  // 831 MB node_modules. Vercel ignores this setting, so it is safe either way.
  output: "standalone",
  experimental: {
    // Every page here is dynamic, and since Next 15 the client cache for
    // dynamic segments defaults to 0s — so going back re-ran auth and the
    // queries over the network every time (~700ms). Mutations all call
    // revalidatePath, which clears this cache, so a short window is safe and
    // makes back-navigation instant.
    staleTimes: { dynamic: 60, static: 300 },
  },
  async headers() {
    return [
      {
        // Never let the service worker be served stale (evicting a cached SW
        // on iOS is painful); lock it down with a strict CSP.
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
