import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, LegalSection } from "@/components/legal/legal-page";
import { getSupportEmail } from "@/lib/env";
import { routes } from "@/lib/site";

export const metadata: Metadata = {
  title: "Privacy",
  description: "How Assume handles your account, your answers and your routines.",
  alternates: { canonical: routes.privacy },
};

export default function PrivacyPage() {
  const email = getSupportEmail() ?? "[support email]";
  return (
    <LegalPage eyebrow="Legal" title="Privacy." updated="[date]">
      <LegalSection id="summary" title="The short version">
        <p>
          What you tell Assume can be personal — relationships, money, health, your daily schedule. We use it to build and run your routine,
          and for nothing else. We don&apos;t sell it, we don&apos;t use it for advertising, and our product analytics never include what you
          write.
        </p>
      </LegalSection>

      <LegalSection id="who" title="Who we are">
        <p>Assume is operated by [company legal name], [registered address] (&ldquo;we&rdquo;). Contact: {email}.</p>
      </LegalSection>

      <LegalSection id="collect" title="What we collect">
        <ul>
          <li>
            <strong>Account:</strong> email address, display name, timezone, password (stored hashed by our authentication provider).
          </li>
          <li>
            <strong>Your answers:</strong> what you&apos;re manifesting, circumstances, affirmations, technique preferences, wake and sleep
            times, recurring activities and notes.
          </li>
          <li>
            <strong>Your routines:</strong> generated plans, your edits and version history, Done / Skip / Move check-ins, and anything you
            save to your manifested archive.
          </li>
          <li>
            <strong>Calendar (optional):</strong> your calendar export choices; if you connect Google Calendar, an encrypted access token
            and the ids of events Assume created in its own &ldquo;Assume&rdquo; calendar.
          </li>
          <li>
            <strong>Purchases:</strong> what you bought, when, amount and status. Card details are handled by our payment provider; we never
            see or store them.
          </li>
          <li>
            <strong>Product analytics (if enabled):</strong> pseudonymous events such as &ldquo;intake completed&rdquo;, tied to a one-way hash
            rather than your account. Never your answers, affirmations or routine text.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="use" title="How we use it">
        <ul>
          <li>To build, adjust and show your routine, and to add it to your calendar when you ask.</li>
          <li>To process purchases and provide support.</li>
          <li>To keep the service secure, prevent abuse and understand, in aggregate, which parts of the product help people.</li>
        </ul>
        <p>Legal bases: [contract / legitimate interests / consent — confirm per jurisdiction].</p>
      </LegalSection>

      <LegalSection id="processors" title="Who processes it for us">
        <ul>
          <li>
            <strong>Supabase</strong> — database and authentication. Access is restricted per account with row-level security.
          </li>
          <li>
            <strong>Google (Gemini API)</strong> — when you build or adjust a routine, your answers are sent to Google&apos;s Gemini API to
            generate it. [Confirm the data-use terms of the API tier in use.]
          </li>
          <li>
            <strong>Google Calendar</strong> — only if you connect it, and only the calendar Assume creates.
          </li>
          <li>
            <strong>Dodo Payments</strong> — payment processing. [Confirm merchant-of-record role and data shared.]
          </li>
          <li>
            <strong>[Hosting provider]</strong> and <strong>[analytics provider, if enabled]</strong>.
          </li>
        </ul>
      </LegalSection>

      <LegalSection id="retention" title="How long we keep it">
        <p>
          Your data is kept while your account is open. When you delete your account, your answers, routines, check-ins, calendar connections
          and archive are erased. Purchase records are kept without a link to you for [retention period] where the law requires it.
          Backups are cycled within [backup period].
        </p>
      </LegalSection>

      <LegalSection id="choices" title="Your choices and rights">
        <ul>
          <li>Edit or delete any plan at any time.</li>
          <li>Choose private calendar titles and what goes in event descriptions.</li>
          <li>Disconnect Google Calendar in Settings; this revokes Assume&apos;s access.</li>
          <li>
            Delete your account in <Link href={`${routes.settings}#account`}>Settings</Link> — immediately and permanently.
          </li>
          <li>[Access, correction, portability and complaint rights — complete per jurisdiction.]</li>
        </ul>
      </LegalSection>

      <LegalSection id="security" title="Security">
        <p>
          Data is encrypted in transit. Calendar tokens are additionally encrypted at rest. Access to your records is limited to your own
          account; service keys are kept on the server only. No system is perfectly secure — if you think something&apos;s wrong, contact{" "}
          {email}.
        </p>
      </LegalSection>

      <LegalSection id="children" title="Children">
        <p>Assume isn&apos;t intended for anyone under [minimum age].</p>
      </LegalSection>

      <LegalSection id="changes" title="Changes">
        <p>We&apos;ll update this page when things change, and tell you in the app about anything significant.</p>
      </LegalSection>
    </LegalPage>
  );
}
