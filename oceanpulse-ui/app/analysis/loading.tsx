export default function Loading() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", gap: 20,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: "50%",
        border: "2px solid var(--border-subtle)",
        borderTop: "2px solid var(--teal-bright)",
        animation: "spin 0.9s linear infinite",
      }} />
      <p style={{
        fontFamily: "var(--font-mono)", fontSize: 11,
        color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase",
      }}>
        Loading analysis…
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}