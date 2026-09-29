"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";
import { routes } from "@/lib/site";

export default function FlowError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main id="main" className="grid flex-1 place-items-center px-gutter py-16">
      <ErrorPanel error={error} retry={retry} homeHref={routes.appHome} homeLabel="Back to home" />
    </main>
  );
}
