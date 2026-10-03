"use client";

import { useEffect, useState } from "react";
import { checkServerHealth } from "@/lib/api";

/**
 * ServerStatus
 * ─────────────
 * Shows a warning banner at the top of the page when the FastAPI server
 * cannot be reached. Automatically hides itself when the server comes back online.
 *
 * Usage: add <ServerStatus /> anywhere in your layout or page.
 */
export default function ServerStatus() {
  const [status, setStatus] = useState<"checking" | "online" | "offline">("checking");

  useEffect(() => {
    let interval: NodeJS.Timeout;

    const check = async () => {
      const healthy = await checkServerHealth();
      setStatus(healthy ? "online" : "offline");
    };

    // Check immediately on mount, then every 30 seconds
    check();
    interval = setInterval(check, 30_000);

    return () => clearInterval(interval);
  }, []);

  if (status === "checking" || status === "online") return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        padding: "0.55rem 1.5rem",
        background: "rgba(239,68,68,0.9)",
        backdropFilter: "blur(8px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.5rem",
        fontSize: "0.78rem",
        fontWeight: 600,
        color: "#fff",
      }}
    >
      <span style={{ fontSize: "0.9rem" }}>⚠</span>
      The OceanPulse data server is not responding. Make sure your FastAPI server is running at{" "}
      <code style={{ background: "rgba(0,0,0,0.25)", padding: "1px 6px", borderRadius: 4, fontFamily: "monospace" }}>
        {process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}
      </code>
    </div>
  );
}
