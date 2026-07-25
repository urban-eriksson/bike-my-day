import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "bike my day",
    short_name: "bike my day",
    description: "Daily bike-ride forecasts, pushed to your phone.",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#f6fbf8",
    theme_color: "#f6fbf8",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
