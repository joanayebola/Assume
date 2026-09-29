import { after, NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { generationErrorCopy } from "@/lib/ai/generator";
import { getCurrentUser } from "@/lib/auth/session";
import { presentStatus } from "@/lib/generation/present";
import { generationReadiness, runGenerationRequest } from "@/lib/generation/run";
import { getPlanStore } from "@/lib/plan";
import { logWarn } from "@/lib/log";

/**
 * GET  → the request's status (polled by the generating screen).
 * POST → nudge: start the run if nobody has picked it up (e.g. the
 *        background task after submit never started, or a worker died).
 *        Claiming is atomic, so extra nudges are harmless.
 */

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const NUDGE_AFTER_MS = 4_000;
const STALE_AFTER_MS = 4 * 60_000;

async function load(params: Promise<{ requestId: string }>) {
  const { requestId } = await params;
  if (!z.uuid().safeParse(requestId).success) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  const user = await getCurrentUser();
  if (!user) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  const store = await getPlanStore();
  const request = await store.getRequest(user.id, requestId);
  if (!request) return { error: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  return { request };
}

const noStore = { headers: { "Cache-Control": "no-store" } };

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/generation/[requestId]">) {
  const { request, error } = await load(ctx.params);
  if (error) return error;
  return NextResponse.json(presentStatus(request), noStore);
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/generation/[requestId]">) {
  const { request, error } = await load(ctx.params);
  if (error) return error;

  const readiness = generationReadiness();
  if (!readiness.ready) {
    logWarn("generation", `not configured: ${readiness.detail}`);
    return NextResponse.json(
      { ...presentStatus(request), error: { code: "not_configured", message: generationErrorCopy.not_configured, canRetry: false } },
      noStore,
    );
  }

  const age = Date.now() - Date.parse(request.createdAt);
  const stale = request.status === "processing" && request.startedAt && Date.now() - Date.parse(request.startedAt) > STALE_AFTER_MS;
  if ((request.status === "queued" && age > NUDGE_AFTER_MS) || stale) {
    after(async () => {
      await runGenerationRequest(request.id);
    });
  }
  return NextResponse.json(presentStatus(request), noStore);
}
