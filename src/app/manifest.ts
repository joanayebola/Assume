import type { MetadataRoute } from "next";

import { routes, site } from "@/lib/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: `${site.name} — manifestation routine planner`,
    short_name: site.name,
    description: site.description,
    start_url: routes.appHome,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: site.themeColor,
    theme_color: site.themeColor,
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icons/192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "New plan", url: routes.newPlan },
      { name: "My plans", url: routes.plans },
    ],
  };
}
