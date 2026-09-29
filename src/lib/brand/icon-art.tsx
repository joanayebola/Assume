/**
 * Raster app-icon artwork for next/og ImageResponse (PWA + Apple icons).
 * Uses literal colours because CSS variables aren't available in Satori.
 */
const INK = "#121110";
const ACCENT = "#ff5a1f";
const PAPER = "#f5f1e8";

export function IconArt({ size, maskable = false }: { size: number; maskable?: boolean }) {
  // Maskable icons must keep content inside the central 80% safe zone.
  const inset = maskable ? size * 0.2 : size * 0.1;
  const tile = size - inset * 2;
  const shadow = tile * 0.09;
  const border = tile * 0.075;

  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        background: maskable ? ACCENT : PAPER,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: inset + shadow,
          top: inset + shadow,
          width: tile - shadow,
          height: tile - shadow,
          background: INK,
          borderRadius: tile * 0.08,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: inset,
          top: inset,
          width: tile - shadow,
          height: tile - shadow,
          background: ACCENT,
          border: `${border}px solid ${INK}`,
          borderRadius: tile * 0.08,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width={tile * 0.62} height={tile * 0.62} viewBox="0 0 36 36">
          <path
            d="M7 32 L18 4 L29 32 M11.4 22.5 H24.6"
            fill="none"
            stroke={INK}
            strokeWidth="5.4"
            strokeLinejoin="miter"
            strokeLinecap="square"
          />
        </svg>
      </div>
    </div>
  );
}
