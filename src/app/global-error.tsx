"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on globals.css or fonts — styles are inline.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          background: "#f5f1e8",
          color: "#121110",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: 16,
        }}
      >
        <main
          role="alert"
          style={{
            maxWidth: 440,
            background: "#fff",
            border: "2px solid #121110",
            borderRadius: 14,
            boxShadow: "8px 8px 0 0 #121110",
            padding: 28,
          }}
        >
          <h1 style={{ fontSize: 28, lineHeight: 1.1, margin: 0, letterSpacing: "-0.02em" }}>
            Assume couldn&apos;t load.
          </h1>
          <p style={{ color: "#57534b", lineHeight: 1.6, marginTop: 12 }}>
            Something went wrong on our side. Try again — it&apos;s usually temporary.
          </p>
          <button
            type="button"
            onClick={retry}
            style={{
              marginTop: 20,
              height: 44,
              padding: "0 20px",
              background: "#ff5a1f",
              color: "#121110",
              border: "2px solid #121110",
              borderRadius: 6,
              boxShadow: "3px 3px 0 0 #121110",
              fontWeight: 600,
              fontSize: 15,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
