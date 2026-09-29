"use client";

import { ErrorPanel } from "@/components/feedback/error-panel";

export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main id="main" className="grid flex-1 place-items-center bg-grid px-gutter py-16">
      <ErrorPanel error={error} retry={retry} />
    </main>
  );
}
