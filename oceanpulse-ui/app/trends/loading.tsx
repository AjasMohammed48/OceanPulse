// Copy to: app/loading.tsx, app/chat/loading.tsx, app/heatmap/loading.tsx,
// app/heatwaves/loading.tsx, app/trends/loading.tsx, app/argo/loading.tsx
// ─────────────────────────────────────────────────────────────
// Next.js automatically shows this while any page is loading.
// Put a copy of this file in EACH page folder:
//   app/loading.tsx          ← for dashboard
//   app/chat/loading.tsx     ← for chat
//   app/heatmap/loading.tsx  ← for heatmap
//   app/heatwaves/loading.tsx
//   app/trends/loading.tsx
//   app/argo/loading.tsx
// ─────────────────────────────────────────────────────────────

export default function Loading() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 20,
      }}
    >
      {/* Animated ocean pulse */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          border: "2px solid var(--border-subtle)",
          borderTop: "2px solid var(--teal-bright)",
          animation: "spin 0.9s linear infinite",
        }}
      />
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--text-muted)",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
        }}
      >
        Loading ocean data…
      </p>
      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}