import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/env";

export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/home", "/plans", "/manifested", "/settings", "/checkout", "/auth/", "/api/", "/reset-password"],
    },
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
