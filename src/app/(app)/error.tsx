"use client";

import { PageBody } from "@/components/app-shell/page-header";
import { ErrorPanel } from "@/components/feedback/error-panel";
import { routes } from "@/lib/site";

/** Keeps the app shell (nav) visible when a page inside it fails. */
export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <PageBody>
      <ErrorPanel error={error} retry={retry} homeHref={routes.appHome} homeLabel="Back to home" />
    </PageBody>
  );
}
