import { ImageResponse } from "next/og";

import { IconArt } from "@/lib/brand/icon-art";
import { site } from "@/lib/site";

/** Social card: paper, ink, one hard-shadowed accent block — the brand in one frame. */

export const alt = `${site.name} — ${site.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#121110";
const ACCENT = "#ff5a1f";
const PAPER = "#f5f1e8";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, padding: 72, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <IconArt size={84} />
          <span style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1.5 }}>{site.name}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 88, fontWeight: 800, lineHeight: 0.98, letterSpacing: -4, maxWidth: 980 }}>Manifestation that fits</span>
          <div style={{ display: "flex", marginTop: 18 }}>
            <span
              style={{
                fontSize: 88,
                fontWeight: 800,
                lineHeight: 1,
                letterSpacing: -4,
                background: ACCENT,
                border: `6px solid ${INK}`,
                boxShadow: `12px 12px 0 0 ${INK}`,
                padding: "6px 22px 14px",
              }}
            >
              your actual life.
            </span>
          </div>
        </div>
        <span style={{ fontSize: 28, color: "#57534b" }}>A personalised routine, built around your real week.</span>
      </div>
    ),
    size,
  );
}
