import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cecilia Post Log",
    short_name: "Post Log",
    description: "Week-by-week log of Cecilia Consulting's social media posts.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f6fa",
    theme_color: "#1f5fa8",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
