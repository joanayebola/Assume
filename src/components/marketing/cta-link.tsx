"use client";

import { ButtonLink, type ButtonLinkProps } from "@/components/ui/button";
import { trackClient } from "@/lib/analytics/client";
import type { EventProps } from "@/lib/analytics/events";

/** A marketing call-to-action that records which CTA was used (no personal data). */
export function CtaLink({ location, onClick, ...props }: ButtonLinkProps & { location: EventProps<"landing_cta_clicked">["location"] }) {
  return (
    <ButtonLink
      {...props}
      onClick={(e) => {
        trackClient("landing_cta_clicked", { location });
        onClick?.(e);
      }}
    />
  );
}
