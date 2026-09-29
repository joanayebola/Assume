import { ImageResponse } from "next/og";

import { IconArt } from "@/lib/brand/icon-art";

const variants = {
  "192": { size: 192, maskable: false },
  "512": { size: 512, maskable: false },
  maskable: { size: 512, maskable: true },
} as const;

type Variant = keyof typeof variants;

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(variants).map((variant) => ({ variant }));
}

export async function GET(_request: Request, ctx: RouteContext<"/icons/[variant]">) {
  const { variant } = await ctx.params;
  if (!(variant in variants)) return new Response("Not found", { status: 404 });

  const { size, maskable } = variants[variant as Variant];
  return new ImageResponse(<IconArt size={size} maskable={maskable} />, {
    width: size,
    height: size,
  });
}
