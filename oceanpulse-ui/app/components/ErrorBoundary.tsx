"use client";

import React from "react";

// ─── Types ────────────────────────────────────────────────────
interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Custom fallback UI. Receives the error so you can show a message. */
  fallback?: (error: Error) => React.ReactNode;
  /** Page or section name shown in the default error message */
  section?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ─── Default fallback UI ───────────────────────────────────────
function DefaultFallback({ error, section }: { error: Error | null; section?: string }) {
  return (
    <div
      style={{
        padding: "2rem",
        borderRadius: 12,
        background: "rgba(239,68,68,0.06)",
        border: "1px solid rgba(239,68,68,0.2)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <p style={{ fontSize: "0.9rem", fontWeight: 700, color: "var(--accent-danger)" }}>
        Something went wrong{section ? ` in ${section}` : ""}
      </p>
      <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", lineHeight: 1.6 }}>
        An unexpected error occurred while loading this section. This is usually a temporary problem.
        Try refreshing the page. If the problem continues, check that the FastAPI server is running and reachable.
      </p>
      {error && (
        <details style={{ marginTop: "0.25rem" }}>
          <summary style={{ fontSize: "0.72rem", color: "var(--text-muted)", cursor: "pointer" }}>
            Technical details (for developers)
          </summary>
          <pre style={{
            marginTop: "0.5rem",
            padding: "0.75rem",
            background: "rgba(0,0,0,0.3)",
            borderRadius: 8,
            fontSize: "0.7rem",
            color: "var(--text-muted)",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            wordBreak: "break-all",
          }}>
            {error.name}: {error.message}
            {error.stack ? `\n\n${error.stack}` : ""}
          </pre>
        </details>
      )}
      <button
        onClick={() => window.location.reload()}
        style={{
          alignSelf: "flex-start",
          padding: "0.4rem 1rem",
          borderRadius: 8,
          background: "rgba(239,68,68,0.15)",
          border: "1px solid rgba(239,68,68,0.3)",
          color: "var(--accent-danger)",
          fontSize: "0.78rem",
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Reload page
      </button>
    </div>
  );
}

// ─── Error Boundary class component ────────────────────────────
// React error boundaries must be class components — hooks cannot catch render errors.
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // In a real deployment you would log to a monitoring service here
    console.error("[OceanPulse ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error!);
      }
      return <DefaultFallback error={this.state.error} section={this.props.section} />;
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
