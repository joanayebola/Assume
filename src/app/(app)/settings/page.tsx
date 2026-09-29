import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { PageBody, PageHeader } from "@/components/app-shell/page-header";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { BillingSummary } from "@/components/settings/billing-summary";
import { CalendarPrivacyForm, GoogleConnection } from "@/components/settings/calendar-settings";
import { DeleteAccount } from "@/components/settings/danger-zone";
import { IntakeDefaultsForm } from "@/components/settings/intake-defaults-form";
import { ProfileForm } from "@/components/settings/profile-form";
import { ButtonLink } from "@/components/ui/button";
import { getViewer } from "@/lib/auth/session";
import { getBillingStore } from "@/lib/billing";
import { billingMode } from "@/lib/billing/config";
import type { Grant, Purchase } from "@/lib/billing/store";
import { getCalendarStore, isGoogleCalendarAvailable } from "@/lib/calendar";
import { DEFAULT_CALENDAR_PREFERENCES } from "@/lib/calendar/model";
import { getIntakeDefaults } from "@/lib/data/intake-defaults";
import { logError } from "@/lib/log";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Settings" };

const SECTIONS = [
  { id: "profile", label: "Profile" },
  { id: "preferences", label: "Manifestation" },
  { id: "calendar", label: "Calendar" },
  { id: "billing", label: "Billing" },
  { id: "account", label: "Account" },
] as const;

function timezoneList(current: string) {
  const zones = new Set<string>(["UTC", ...Intl.supportedValuesOf("timeZone")]);
  zones.add(current);
  return [...zones];
}

function SettingsSection({
  id,
  title,
  description,
  children,
  tone = "default",
}: {
  id?: string;
  title: string;
  description: string;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="grid scroll-mt-24 gap-5 border-t-2 border-ink py-8 md:grid-cols-[0.8fr_1.2fr] md:gap-10">
      <div>
        <h2 id={id ? `${id}-title` : undefined} className="text-xl font-bold tracking-tight">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className={tone === "danger" ? "rounded-lg border-2 border-destructive bg-destructive-soft/40 p-5 sm:p-6" : "rounded-lg border-2 border-ink bg-surface p-5 shadow-hard-sm sm:p-6"}>
        {children}
      </div>
    </section>
  );
}

async function loadSettings(userId: string) {
  const calendar = (async () => {
    try {
      const store = await getCalendarStore();
      const [preferences, connection] = await Promise.all([store.getPreferences(userId), store.getConnection(userId, "google")]);
      return { preferences, connection };
    } catch (error) {
      logError("settings:calendar", error);
      return { preferences: DEFAULT_CALENDAR_PREFERENCES, connection: null };
    }
  })();
  const billing = (async (): Promise<{ purchases: Purchase[]; grants: Grant[]; error: boolean }> => {
    try {
      const store = await getBillingStore();
      const [purchases, grants] = await Promise.all([store.listPurchases(userId), store.listGrants(userId)]);
      return { purchases, grants, error: false };
    } catch (error) {
      logError("settings:billing", error);
      return { purchases: [], grants: [], error: true };
    }
  })();
  const [cal, bill, defaults] = await Promise.all([calendar, billing, getIntakeDefaults(userId)]);
  return { ...cal, ...bill, defaults, now: Date.now() };
}

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const { profile, user, isDemo } = await getViewer();
  const [settings, q] = await Promise.all([loadSettings(user.id), searchParams]);
  const flag = typeof q.calendar === "string" ? q.calendar : null;

  return (
    <PageBody>
      <PageHeader title="Settings." />

      <nav aria-label="Settings sections" className="-mx-gutter mt-6 overflow-x-auto px-gutter sm:mx-0 sm:px-0">
        <ul className="flex gap-2">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border-2 border-ink bg-surface px-3 text-sm font-semibold shadow-hard-xs hover:bg-accent-soft"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-8">
        <SettingsSection id="profile" title="Profile" description="Your name, and the timezone Today and new routines run in.">
          <ProfileForm defaultValues={{ displayName: profile.display_name ?? "", timezone: profile.timezone }} timezones={timezoneList(profile.timezone)} />
        </SettingsSection>

        <SettingsSection
          id="preferences"
          title="Manifestation preferences"
          description="What new plans start with — your usual day and the techniques you like. You can change anything in each plan."
        >
          <IntakeDefaultsForm initial={settings.defaults} />
        </SettingsSection>

        <SettingsSection
          id="calendar"
          title="Calendar privacy"
          description="How routines look when you add them to a calendar. These are the defaults; every export lets you change them."
        >
          <CalendarPrivacyForm initial={settings.preferences} />
          <p className="mt-6 border-t-2 border-dashed border-ink/20 pt-4 text-sm text-muted-foreground">
            Times follow each routine&apos;s timezone; your calendar shows them in yours. Your own timezone is set under Profile.
          </p>
        </SettingsSection>

        <SettingsSection title="Connected calendars" description="Optional. Google Calendar keeps your routine's events up to date when you change it.">
          <GoogleConnection
            available={isGoogleCalendarAvailable()}
            connection={settings.connection && { status: settings.connection.status, calendarName: settings.connection.calendarName, connectedAt: settings.connection.connectedAt }}
            flag={flag}
          />
        </SettingsSection>

        <SettingsSection id="billing" title="Billing" description="Your purchases and routines available to build.">
          {settings.error ? (
            <p className="text-sm text-muted-foreground">Billing details aren&apos;t available right now. Please try again later.</p>
          ) : (
            <BillingSummary purchases={settings.purchases} grants={settings.grants} freeMode={billingMode() === "free"} now={settings.now} />
          )}
        </SettingsSection>

        <SettingsSection id="account" title="Sign-in" description="The email and password you use to log in.">
          <dl className="space-y-1">
            <dt className="text-sm font-semibold">Email</dt>
            <dd className="break-all text-muted-foreground">{user.email}</dd>
          </dl>
          <div className="mt-5 flex flex-col gap-3 border-t-2 border-dashed border-ink/30 pt-5 sm:flex-row">
            {!isDemo && (
              <ButtonLink href={routes.resetPassword} variant="secondary" size="sm" iconLeft={<KeyRound aria-hidden />}>
                Change password
              </ButtonLink>
            )}
            <div className="sm:w-40">
              <SignOutButton />
            </div>
          </div>
        </SettingsSection>

        <SettingsSection title="Delete account" description="Erase your account and everything in it." tone="danger">
          <DeleteAccount googleConnected={Boolean(settings.connection)} />
        </SettingsSection>
      </div>
    </PageBody>
  );
}
