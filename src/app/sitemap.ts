import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";
import { routes } from "@/lib/site";

/** Public pages only — the signed-in app is never indexed. */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = getSiteUrl();
  const page = (path: string, priority: number, changeFrequency: "weekly" | "monthly" | "yearly") => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency,
    priority,
  });
  return [
    page(routes.home, 1, "weekly"),
    page(routes.signup, 0.6, "monthly"),
    page(routes.login, 0.3, "yearly"),
    page(routes.contact, 0.4, "yearly"),
    page(routes.privacy, 0.3, "yearly"),
    page(routes.terms, 0.3, "yearly"),
  ];
}
