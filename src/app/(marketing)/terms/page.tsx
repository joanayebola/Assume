import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { getSupportEmail } from "@/lib/env";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Terms",
  description: "The terms for using Assume.",
  alternates: { canonical: routes.terms },
};

export default function TermsPage() {
  const email = getSupportEmail();
  return (
    <LegalPage eyebrow="Legal" title="Terms." updated="[date]">
      <LegalSection id="about" title="What Assume is">
        <p>
          Assume is a planning tool that helps you build a manifestation routine around your life. It is provided by [company legal name]
          (&ldquo;we&rdquo;). By creating an account you agree to these terms.
        </p>
      </LegalSection>

      <LegalSection id="no-guarantees" title="No guarantees">
        <p>
          Assume doesn&apos;t promise that anything you&apos;re manifesting will happen, by any date or at all. We don&apos;t make scientific
          claims about manifestation. Routines are suggestions for your own practice.
        </p>
      </LegalSection>

      <LegalSection id="not-advice" title="Not professional advice">
        <p>
          Assume isn&apos;t medical, psychological, legal or financial advice, and isn&apos;t a substitute for it. If you&apos;re dealing with
          a health, legal, safety or money matter, please seek appropriate help. In an emergency, contact your local emergency services.
        </p>
      </LegalSection>

      <LegalSection id="account" title="Your account">
        <ul>
          <li>You need to be at least [minimum age] to use Assume.</li>
          <li>Keep your login details safe; you&apos;re responsible for activity on your account.</li>
          <li>You can delete your account at any time in Settings.</li>
        </ul>
      </LegalSection>

      <LegalSection id="purchases" title="Purchases and refunds">
        <ul>
          <li>Creating an account and completing the questions is free.</li>
          <li>A personalised routine is a one-time purchase. The price is shown before you pay.</li>
          <li>Payments are processed by Dodo Payments. [Confirm merchant-of-record wording, taxes and invoicing.]</li>
          <li>Refunds: [refund policy and window]. Contact {email}.</li>
          <li>If routine generation fails and can&apos;t be completed, your routine credit is returned automatically.</li>
        </ul>
      </LegalSection>

      <LegalSection id="content" title="Your content">
        <p>
          What you write stays yours. You give us permission to store and process it only to provide the service — including sending it to our
          AI provider to generate your routine — as described in our <Link href={routes.privacy}>Privacy</Link> page.
        </p>
      </LegalSection>

      <LegalSection id="use" title="Acceptable use">
        <ul>
          <li>Don&apos;t use Assume to plan anything that harms, harasses or tracks another person.</li>
          <li>Don&apos;t attempt to access other people&apos;s data, disrupt the service or abuse the AI features.</li>
        </ul>
      </LegalSection>

      <LegalSection id="liability" title="Liability">
        <p>[Limitation of liability, disclaimers and governing law — to be drafted for [jurisdiction].]</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes and contact">
        <p>
          We may update these terms and will tell you about significant changes in the app. Questions: {email} or the{" "}
          <Link href={routes.contact}>contact page</Link>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
