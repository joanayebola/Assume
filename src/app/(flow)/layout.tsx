import type { Metadata } from "next";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/** Focused, full-screen flows (plan intake, generation) — no app navigation. */
export default function FlowLayout({ children }: LayoutProps<"/">) {
  return <div className="flex min-h-dvh flex-1 flex-col">{children}</div>;
}
