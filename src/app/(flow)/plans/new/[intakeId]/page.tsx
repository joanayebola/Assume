import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";
import { z } from "zod";

import { IntakeWizard } from "@/components/intake/intake-wizard";
import { getViewer } from "@/lib/auth/session";
import { getIntakeRepository } from "@/lib/intake";
import { routes } from "@/lib/site";

import IntakeLoading from "./loading";

export const metadata: Metadata = { title: "New plan" };

export default async function IntakePage({ params }: PageProps<"/plans/new/[intakeId]">) {
  const { intakeId } = await params;
  if (!z.uuid().safeParse(intakeId).success) notFound();

  const viewer = await getViewer();
  const repo = await getIntakeRepository();
  const draft = await repo.get(viewer.user.id, intakeId);

  if (!draft || draft.status === "archived") notFound();
  if (draft.status === "submitted" && draft.requestId) {
    redirect(`${routes.plans}/generating/${draft.requestId}`);
  }

  return (
    // useSearchParams (step routing) needs a Suspense boundary.
    <Suspense fallback={<IntakeLoading />}>
      <IntakeWizard draft={draft} timezone={viewer.profile.timezone} isDemo={viewer.isDemo} />
    </Suspense>
  );
}
