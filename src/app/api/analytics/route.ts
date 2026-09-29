import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { CLIENT_EVENTS } from "@/lib/analytics/events";
import { analyticsEnabled, track } from "@/lib/analytics/server";
import { getCurrentUser } from "@/lib/auth/session";
import { allowRequest } from "@/lib/rate-limit";

/** POST ← allow-listed client events. Always 204: analytics never errors at the user. */

export const dynamic = "force-dynamic";

const body = z.object({
  event: z.enum(CLIENT_EVENTS),
  props: z.record(z.string(), z.unknown()).optional(),
  visit: z.uuid().nullable().optional(),
});

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  if (!analyticsEnabled()) return noContent();
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!allowRequest(`analytics:${ip}`, 60, 60_000)) return noContent();

  const text = await request.text();
  if (text.length > 2000) return noContent();
  let parsed: z.infer<typeof body>;
  try {
    const result = body.safeParse(JSON.parse(text));
    if (!result.success) return noContent();
    parsed = result.data;
  } catch {
    return noContent();
  }

  const user = await getCurrentUser().catch(() => null);
  if (user) track(parsed.event, user.id, parsed.props as never);
  else if (parsed.visit) track(parsed.event, parsed.visit, parsed.props as never, { anonymous: true });
  return noContent();
}
