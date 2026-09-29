import type { Metadata } from "next";
import { Suspense } from "react";

import { AccountDeletedNotice } from "@/components/marketing/account-deleted-notice";
import { Example } from "@/components/marketing/example";
import { Faq } from "@/components/marketing/faq";
import { Features } from "@/components/marketing/features";
import { FinalCta } from "@/components/marketing/final-cta";
import { Hero } from "@/components/marketing/hero";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { products } from "@/lib/billing/config";
import { getSiteUrl } from "@/lib/env";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/** schema.org data. An Offer is included only when a price is configured. */
function structuredData() {
  const url = getSiteUrl();
  const price = products().routine.price;
  return [
    { "@context": "https://schema.org", "@type": "WebSite", name: site.name, url, description: site.description },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: site.name,
      url,
      description: site.description,
      applicationCategory: "LifestyleApplication",
      operatingSystem: "Web",
      ...(price ? { offers: { "@type": "Offer", price: (price.amount / 100).toFixed(2), priceCurrency: price.currency } } : {}),
    },
  ];
}

export default function LandingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        // Static, server-built JSON — no user input involved.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData()).replace(/</g, "\\u003c") }}
      />
      <Suspense fallback={null}>
        <AccountDeletedNotice />
      </Suspense>
      <Hero />
      <HowItWorks />
      <Example />
      <Features />
      <Faq />
      <FinalCta />
    </>
  );
}
