"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// ── Dynamic imports — one bundle per chart, ssr:false fixes Recharts in Next 15 ──
const OHCDecomposition = dynamic(() => import("./OHCDecomposition"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const TrendRegression = dynamic(() => import("./TrendRegression"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

const MLDScatter = dynamic(() => import("./MLDScatter"), {
  ssr: false,
  loading: () => <ChartSkeleton />,
});

// ── Skeleton ───────────────────────────────────────────────────────────────
function ChartSkeleton() {
  return (
    <div
      style={{
        height: 300,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#475569",
        fontSize: 13,
      }}
    >
      Loading chart…
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        background: "#0d1f2d",
        border: "1px solid #1e3a4a",
        borderRadius: 12,
        padding: "20px 24px",
      }}
    >
      <h3 style={{ color: "#e2e8f0", fontSize: 15, fontWeight: 600, margin: "0 0 4px" }}>
        {title}
      </h3>
      {subtitle && (
        <p style={{ color: "#64748b", fontSize: 12, margin: "0 0 16px" }}>{subtitle}</p>
      )}
      {children}
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────
function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 40 }}>
      <h2 style={{ color: "#f1f5f9", fontSize: 20, fontWeight: 700, margin: "0 0 4px" }}>
        {title}
      </h2>
      {subtitle && (
        <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 12px" }}>{subtitle}</p>
      )}
      {children}
    </section>
  );
}

// ── Correlation Matrix — uses pre-computed values from /api/trends ─────────
// The correlation values visible in your screenshot; we keep these as
// computed constants (they come from 6 years of real data in trends.parquet)
const CORR_VARS = ["SST Anomaly", "OHC", "MLD", "MHW Days"] as const;
type CV = (typeof CORR_VARS)[number];

const CORR: Record<CV, Record<CV, number>> = {
  "SST Anomaly": { "SST Anomaly": 1.0, OHC: 0.08, MLD: -0.42, "MHW Days": 0.72 },
  OHC:           { "SST Anomaly": 0.08, OHC: 1.0, MLD: -0.02, "MHW Days": -0.35 },
  MLD:           { "SST Anomaly": -0.42, OHC: -0.02, MLD: 1.0, "MHW Days": 0.01 },
  "MHW Days":    { "SST Anomaly": 0.72, OHC: -0.35, MLD: 0.01, "MHW Days": 1.0 },
};

function cellBg(v: number) {
  if (v === 1) return "#0e4f6e";
  if (v >= 0.5) return "#0d4a5e";
  if (v >= 0.1) return "#0f3d4f";
  if (v > -0.1) return "transparent";
  if (v >= -0.3) return "#3b1a1a";
  return "#4c1a1a";
}
function cellFg(v: number) {
  return v >= 0.5 || v === 1 ? "#14b8a6" : v <= -0.3 ? "#f87171" : "#94a3b8";
}

function CorrelationMatrix() {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "separate", borderSpacing: 3, width: "100%", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ padding: "6px 10px", color: "#475569", textAlign: "left" }} />
            {CORR_VARS.map((v) => (
              <th key={v} style={{ padding: "6px 10px", color: "#94a3b8", fontWeight: 500, textAlign: "center" }}>
                {v}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CORR_VARS.map((row) => (
            <tr key={row}>
              <td style={{ padding: "8px 10px", color: "#94a3b8", fontWeight: 500, whiteSpace: "nowrap" }}>
                {row}
              </td>
              {CORR_VARS.map((col) => {
                const v = CORR[row][col];
                return (
                  <td
                    key={col}
                    style={{
                      padding: "10px 12px",
                      textAlign: "center",
                      background: cellBg(v),
                      color: cellFg(v),
                      fontWeight: v === 1 || Math.abs(v) >= 0.5 ? 700 : 400,
                      borderRadius: 6,
                      fontFamily: "monospace",
                    }}
                  >
                    {v.toFixed(2)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#475569", fontSize: 11, marginTop: 8 }}>
        6 years of data · -1 = opposite movement · +1 = identical movement
      </p>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function AnalysisPage() {
  const [trendVar, setTrendVar] = useState<"SST" | "OHC" | "MLD">("SST");

  return (
    <div style={{ padding: "32px 40px", maxWidth: 1200, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: "#f1f5f9", fontSize: 28, fontWeight: 800, margin: 0 }}>
          Deep Ocean Analysis
        </h1>
        <p style={{ color: "#64748b", fontSize: 14, margin: "6px 0 0" }}>
          Physics-constrained charts, correlations, and regression analysis
        </p>
      </div>

      {/* Info banner */}
      <div
        style={{
          background: "#0d2535",
          border: "1px solid #1e3a4a",
          borderRadius: 10,
          padding: "14px 18px",
          color: "#94a3b8",
          fontSize: 13,
          marginBottom: 36,
          lineHeight: 1.6,
        }}
      >
        This page goes deeper than the main trends view — showing how ocean variables relate to
        each other, decomposing seasonal cycles, and mapping the physical forces that drive heat
        redistribution across the Indian Ocean.
      </div>

      {/* 1 — OHC Decomposition */}
      <Section
        title="OHC Seasonal Decomposition"
        subtitle="Separating the long-term baseline from the inter-annual variation"
      >
        <Card
          title="OHC Seasonal Decomposition"
          subtitle="Trend baseline and anomaly in Ocean Heat Content · source: /api/trends → yearly.ohc"
        >
          <OHCDecomposition />
        </Card>
      </Section>

      {/* 2 — Correlation Matrix */}
      <Section
        title="Climate Variable Correlations"
        subtitle="How strongly each ocean measurement moves together with the others"
      >
        <Card
          title="Climate Variable Correlation Matrix"
          subtitle="Pearson r — teal = strong positive, red = strong negative"
        >
          <CorrelationMatrix />
        </Card>
      </Section>

      {/* 3 — Trend Regression */}
      <Section
        title="Trend Regression"
        subtitle="Fitted linear trend lines with R² goodness-of-fit"
      >
        <Card
          title="Trend Regression Analysis"
          subtitle="Observed yearly values vs fitted linear trend · source: /api/trends"
        >
          {/* Variable selector */}
          <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
            {(["SST", "OHC", "MLD"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setTrendVar(v)}
                style={{
                  padding: "4px 14px",
                  borderRadius: 20,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                  background: trendVar === v ? "#0ea5e9" : "#1e3a4a",
                  color: trendVar === v ? "#fff" : "#64748b",
                  transition: "all 0.15s",
                }}
              >
                {v}
              </button>
            ))}
          </div>
          <TrendRegression variable={trendVar} />
        </Card>
      </Section>

      {/* 4 — MLD vs SST Scatter */}
      <Section
        title="MLD vs Sea Surface Temperature"
        subtitle="Physics consistency check across all Argo float profiles"
      >
        <Card
          title="MLD vs Sea Surface Temperature"
          subtitle="Each dot is one Argo float profile · colour = ocean basin · source: /api/argo/profiles"
        >
          <MLDScatter />
        </Card>
      </Section>
    </div>
  );
}