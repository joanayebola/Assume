import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { buildIcs } from "@/lib/calendar/ics";
import { buildEvents, exportOptionsSchema } from "@/lib/calendar/model";
import { getSiteUrl } from "@/lib/env";
import { getPlanStore } from "@/lib/plan";

/**
 * GET → the routine as an .ics file, built from the current plan with the
 * export options in `?o=` (base64url JSON, from prepareIcsExport).
 * Opening this URL on an iPhone goes straight to "Add to Calendar".
 */

export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest, ctx: RouteContext<"/api/calendar/plans/[planId]/ics">) {
  const { planId } = await ctx.params;
  if (!z.uuid().safeParse(planId).success) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: noStore });

  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(request.nextUrl.searchParams.get("o") ?? "", "base64url").toString("utf8"));
  } catch {
    return NextResponse.json({ error: "invalid_options" }, { status: 400, headers: noStore });
  }
  const options = exportOptionsSchema.safeParse(raw);
  if (!options.success) return NextResponse.json({ error: "invalid_options" }, { status: 400, headers: noStore });

  const plan = await (await getPlanStore()).getPlan(user.id, planId);
  if (!plan) return NextResponse.json({ error: "not_found" }, { status: 404, headers: noStore });

  const events = buildEvents(plan.doc, { planId, options: options.data, siteUrl: getSiteUrl() });
  if (!events.length) return NextResponse.json({ error: "no_events" }, { status: 422, headers: noStore });

  const sequence = Math.max(0, Math.min(10_000, Number.parseInt(request.nextUrl.searchParams.get("seq") ?? "0", 10) || 0));
  const body = buildIcs(events, { now: Date.now(), sequence });
  // A neutral filename: downloads folders and share sheets are visible to others.
  const filename = events.length === 1 ? "assume-session.ics" : "assume-routine.ics";

  return new NextResponse(body, {
    headers: {
      ...noStore,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
