"use client";

import React from "react";
import PageShell from "../components/PageShell";

const SECTIONS = [
  {
    icon: "🌊",
    title: "What is OceanPulse?",
    body: `OceanPulse is an ocean monitoring and intelligence platform focused on the Indian Ocean. It collects data from satellites, robotic floats in the sea, and global weather models — then uses that data to track how the ocean is changing over time.

The platform is designed for researchers, students, and anyone curious about the ocean. You do not need a science background to use it. Everything is written in plain language, and the AI assistant is always ready to explain what the numbers mean.`,
  },
  {
    icon: "🔥",
    title: "What is a Marine Heatwave?",
    body: `A marine heatwave happens when the sea surface temperature stays unusually warm for five or more days in a row. "Unusually warm" means the temperature is in the hottest 10% ever recorded for that time of year in that location.

Marine heatwaves can bleach coral reefs, displace fish populations, increase the intensity of tropical cyclones, and disrupt coastal fishing communities. OceanPulse tracks these events in near real-time across the Indian Ocean.`,
  },
  {
    icon: "🤖",
    title: "What are Argo Floats?",
    body: `Argo floats are small, robotic devices that drift freely through the ocean. They sink to a depth of about 2,000 metres, then slowly rise back to the surface — measuring temperature and salt levels as they go.

When they surface, they transmit their data to satellites. There are nearly 4,000 active Argo floats in the world's oceans at any given time. OceanPulse uses their data to understand what is happening below the ocean surface, not just at the top.`,
  },
  {
    icon: "🌐",
    title: "Climate Patterns Explained",
    body: `Three major climate patterns influence the Indian Ocean:

• El Niño / La Niña (ENSO): This is a see-saw of warm and cool water in the Pacific Ocean. When El Niño is active (warm), it tends to warm parts of the Indian Ocean too. La Niña (cool) often has the opposite effect.

• Indian Ocean Dipole (IOD): This is the Indian Ocean's own version of a similar see-saw. A positive IOD means the western Indian Ocean (near Africa) is warmer than the eastern side (near Indonesia). This affects rainfall patterns across East Africa, India, and Australia.

• Pacific Decadal Oscillation (PDO): A longer, slower pattern that cycles over 20–30 years. It shapes whether the Pacific — and by extension, the Indian Ocean — is in a warmer or cooler phase for decades at a time.`,
  },
  {
    icon: "📊",
    title: "How is the data collected?",
    body: `OceanPulse uses several publicly available, scientific-grade data sources:

• NOAA OISST: Satellite-based sea surface temperature, updated daily, covering the entire globe.

• CMEMS (Copernicus Marine Service): Argo float profiles and sea level anomaly data from the European Union's marine data service.

• ERA5 (ECMWF): Global wind and atmospheric data from the European Centre for Medium-Range Weather Forecasts.

• NOAA / BOM Climate Indices: The standard ENSO, IOD, and PDO index values used by oceanographers worldwide.

All data is processed through a physics-based analysis pipeline that checks data quality, estimates measurement uncertainty, and flags unusual observations before they appear in the platform.`,
  },
  {
    icon: "💬",
    title: "How does the Ocean Chat AI work?",
    body: `The Ocean Chat assistant is powered by a large language model running locally on the same server as the data. Before answering your question, it receives a summary of the latest ocean conditions — temperature, heatwave status, climate indices, and more.

This means the assistant is not guessing or relying on outdated training data. It reasons from current, real data to give you accurate, context-aware answers. If a question is better answered with a chart, the assistant will generate one automatically.

You can also upload your own data files (such as CSV files) and ask the assistant to help you interpret them.`,
  },
];

const AUTHORS = [
  { name: "Ajas Mohammed",      initials: "AM" },
  { name: "Muhammed Ashhar A",  initials: "MA" },
  { name: "Muhammad Zain T",    initials: "MZ" },
  { name: "Muhammed Salashir A M", initials: "MS" },
  { name: "Abhijith K P",       initials: "AK" },
];

// Cycle through teal shades so each card looks slightly distinct
const ACCENT_COLORS = [
  "var(--teal-bright)",
  "#00a896",
  "#4db8ff",
  "#00c9b0",
  "#00bfa8",
];

export default function AboutPage() {
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">About OceanPulse</h1>
          <p className="page-subtitle">
            What this platform is, how it works, and what the science means in plain language
          </p>
        </div>
      </div>

      <div className="page-body">
        {/* ── Hero banner ────────────────────────────────────────── */}
        <div
          style={{
            background:
              "linear-gradient(135deg, rgba(18, 74, 114, 0.35) 0%, rgba(8, 21, 37, 0.6) 100%)",
            border: "1px solid var(--border-active)",
            borderRadius: 16,
            padding: "32px 36px",
            marginBottom: 32,
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              height: 2,
              background:
                "linear-gradient(90deg, transparent, var(--teal-bright), transparent)",
            }}
          />
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌊</div>
          <h2
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "var(--text-primary)",
              letterSpacing: "-0.03em",
              marginBottom: 10,
            }}
          >
            Physics-Constrained Ocean Intelligence
          </h2>
          <p
            style={{
              fontSize: 15,
              color: "var(--text-secondary)",
              lineHeight: 1.7,
              maxWidth: 640,
            }}
          >
            OceanPulse combines satellite data, robotic ocean sensors, and
            artificial intelligence to give you a clear, honest picture of
            what is happening in the Indian Ocean — in language anyone can
            understand.
          </p>
          <div
            style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}
          >
            {[
              "Indian Ocean",
              "Marine Heatwaves",
              "Argo Float Data",
              "Climate Monitoring",
              "AI-Powered Analysis",
            ].map((tag) => (
              <span key={tag} className="badge badge-teal" style={{ fontSize: 11 }}>
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* ── Content sections ──────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(480px, 1fr))",
            gap: 20,
          }}
        >
          {SECTIONS.map((section) => (
            <div key={section.title} className="card">
              <div className="card-header">
                <span style={{ fontSize: 18, marginRight: 8 }}>
                  {section.icon}
                </span>
                <span
                  style={{
                    fontSize: 14.5,
                    fontWeight: 600,
                    color: "var(--text-primary)",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {section.title}
                </span>
              </div>
              <div className="card-body">
                {section.body.split("\n\n").map((para, i) => (
                  <p
                    key={i}
                    style={{
                      fontSize: 13.5,
                      color: "var(--text-secondary)",
                      lineHeight: 1.7,
                      marginBottom: i < section.body.split("\n\n").length - 1 ? 12 : 0,
                      whiteSpace: "pre-line",
                    }}
                  >
                    {para}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* ── Disclaimer footer ─────────────────────────────────── */}
        <div
          className="card"
          style={{ marginTop: 24, padding: "18px 24px" }}
        >
          <p
            style={{
              fontSize: 12.5,
              color: "var(--text-muted)",
              lineHeight: 1.6,
              fontFamily: "var(--font-mono)",
            }}
          >
            OceanPulse is a research and monitoring platform. Data is sourced
            from publicly available, peer-reviewed scientific datasets. The AI
            assistant is intended to help interpret data — it should not be
            used as the sole basis for operational or safety-critical decisions.
          </p>
        </div>

        {/* ── Authors section ───────────────────────────────────── */}
        <div
          style={{
            marginTop: 32,
            background:
              "linear-gradient(135deg, rgba(11, 30, 51, 0.9) 0%, rgba(8, 21, 37, 0.95) 100%)",
            border: "1px solid var(--border-active)",
            borderRadius: 16,
            padding: "28px 32px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Top accent line */}
          <div
            style={{
              position: "absolute",
              top: 0, left: 0, right: 0,
              height: 2,
              background:
                "linear-gradient(90deg, transparent, var(--teal-bright), transparent)",
            }}
          />

          {/* Section heading */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: "50%",
                background: "rgba(0,212,186,0.12)",
                border: "1px solid rgba(0,212,186,0.30)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15,
              }}
            >
              👥
            </div>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9.5,
                  color: "var(--text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.14em",
                  marginBottom: 2,
                }}
              >
                Built by
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  letterSpacing: "-0.02em",
                }}
              >
                The OceanPulse Team
              </div>
            </div>
          </div>

          {/* Author cards */}
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 14,
            }}
          >
            {AUTHORS.map((author, idx) => {
              const accent = ACCENT_COLORS[idx % ACCENT_COLORS.length];
              return (
                <div
                  key={author.name}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: "rgba(3,8,15,0.5)",
                    border: `1px solid rgba(0,212,186,0.12)`,
                    borderLeft: `3px solid ${accent}`,
                    borderRadius: 10,
                    padding: "12px 18px",
                    minWidth: 200,
                    flex: "1 1 200px",
                    transition: "border-color 0.2s, box-shadow 0.2s",
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = accent;
                    (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 16px ${accent}22`;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(0,212,186,0.12)";
                    (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
                  }}
                >
                  {/* Avatar circle */}
                  <div
                    style={{
                      width: 38, height: 38, borderRadius: "50%",
                      background: `${accent}18`,
                      border: `1px solid ${accent}40`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 12,
                      fontWeight: 700,
                      color: accent,
                      flexShrink: 0,
                      letterSpacing: "0.04em",
                    }}
                  >
                    {author.initials}
                  </div>

                  {/* Name + role */}
                  <div>
                    <div
                      style={{
                        fontSize: 13.5,
                        fontWeight: 600,
                        color: "var(--text-primary)",
                        letterSpacing: "-0.01em",
                        marginBottom: 2,
                      }}
                    >
                      {author.name}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 9.5,
                        color: accent,
                        opacity: 0.85,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Author {idx + 1}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}