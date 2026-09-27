import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cecilia Post Log",
    short_name: "Post Log",
    description: "Week-by-week log of Cecilia Consulting's social media posts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f7fa",
    theme_color: "#367098",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
