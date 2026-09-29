import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { Logo } from "@/components/brand/logo";
import { GenerationProgress } from "@/components/generation/generation-progress";
import { presentStatus } from "@/lib/generation/present";
import { getViewer } from "@/lib/auth/session";
import { getPlanStore } from "@/lib/plan";
import { routes } from "@/lib/site";

export const metadata: Metadata = { title: "Building your routine" };
export const maxDuration = 300;

export default async function GeneratingPage({ params }: PageProps<"/plans/generating/[requestId]">) {
  const { requestId } = await params;
  if (!z.uuid().safeParse(requestId).success) notFound();

  const viewer = await getViewer();
  const store = await getPlanStore();
  const request = await store.getRequest(viewer.user.id, requestId);
  if (!request) notFound();

  // Returning after it finished: go straight to the plan.
  if (request.status === "completed" && request.planId) redirect(`${routes.plans}/${request.planId}`);

  const initial = presentStatus(request);

  return (
    <>
      <header className="pt-safe border-b-2 border-ink">
        <div className="mx-auto flex h-14 max-w-5xl items-center px-gutter sm:px-6">
          <Logo href={routes.appHome} />
        </div>
      </header>
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 items-center px-gutter py-12 sm:px-6 md:py-20">
        <GenerationProgress
          initial={initial}
          backHref={request.kind === "initial" || !request.planId ? routes.appHome : `${routes.plans}/${request.planId}`}
        />
      </main>
    </>
  );
}
