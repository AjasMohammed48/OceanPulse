"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";

// Hard-coded hex — CSS vars don't work in SVG stroke/fill
const C = {
  teal:   "#00d4ba",
  tealMid:"#00a896",
  orange: "#ff8c42",
  red:    "#ff4d6d",
  amber:  "#ffb347",
  muted:  "#3d6478",
  grid:   "rgba(0,212,186,0.08)",
  bg:     "#0b1e33",
  border: "rgba(0,212,186,0.30)",
  text:   "#e8f4f8",
};

const TICK = { fill: C.muted, fontSize: 10, fontFamily: "'DM Mono', monospace" };
const TIP  = { backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'DM Mono', monospace", fontSize: 11 };

// Single-chunk dynamic import — fixes blank chart issue
const HeatwaveCharts = dynamic(() => import("./HeatwaveCharts"), {
  ssr: false,
  loading: () => (
    <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontFamily: "var(--font-mono)", fontSize: 11 }}>
      Loading charts…
    </div>
  ),
});

// ── Types ────────────────────────────────────────────────────
interface HeatwaveEvent {
  event_id: number;
  start_date: string;
  end_date: string;
  duration_days: number;
  peak_date: string;
  peak_intensity: number;
  mean_intensity: number;
  peak_coverage: number;
  accumulated_heat: number;
  peak_category: number;
  dominant_enso: string;
  dominant_iod: string;
  mean_confidence: number;
}

interface HeatwaveData {
  events: HeatwaveEvent[];
  total: number;
  yearly_summary: Array<{ year: number; count: number; avg_duration: number }>;
}

// ── Category config ───────────────────────────────────────────
const CAT = {
  1: { label: "Moderate", color: C.amber,  bg: "rgba(255,179,71,0.14)"  },
  2: { label: "Strong",   color: C.orange, bg: "rgba(255,140,66,0.16)"  },
  3: { label: "Severe",   color: C.red,    bg: "rgba(255,77,109,0.16)"  },
  4: { label: "Extreme",  color: "#ff1744",bg: "rgba(255,23,68,0.18)"   },
};

function CategoryBadge({ cat }: { cat: number }) {
  const c = CAT[cat as keyof typeof CAT] ?? CAT[1];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px",
      borderRadius: 5, background: c.bg, color: c.color,
      border: `1px solid ${c.color}44`, whiteSpace: "nowrap",
    }}>
      {"●".repeat(cat)} {c.label}
    </span>
  );
}

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? C.teal : pct >= 60 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: "#0f2a44", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3 }} />
      </div>
      <span className="font-mono" style={{ fontSize: 10, color, minWidth: 32, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function EventRow({ event, expanded, onToggle }: { event: HeatwaveEvent; expanded: boolean; onToggle: () => void }) {
  return (
    <div style={{
      background: expanded ? "#0b1e33" : "#081525",
      border: `1px solid ${expanded ? C.border : "rgba(0,212,186,0.1)"}`,
      borderRadius: 10, overflow: "hidden", transition: "all 0.2s",
    }}>
      <div onClick={onToggle} style={{
        display: "grid",
        gridTemplateColumns: "1fr 100px 80px 110px 120px 90px 28px",
        alignItems: "center", padding: "12px 16px", cursor: "pointer", gap: 8,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Event #{event.event_id}</div>
          <div className="font-mono" style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
            {event.start_date} → {event.end_date}
          </div>
        </div>
        <CategoryBadge cat={event.peak_category} />
        <div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: C.orange }}>{event.duration_days}</div>
          <div style={{ fontSize: 10, color: C.muted }}>days</div>
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: C.red }}>+{event.peak_intensity.toFixed(2)}°C</div>
          <div style={{ fontSize: 10, color: C.muted }}>peak intensity</div>
        </div>
        <div>
          <div className="font-mono" style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{event.peak_coverage.toFixed(1)}%</div>
          <div style={{ fontSize: 10, color: C.muted }}>ocean covered</div>
        </div>
        <ConfidenceBar value={event.mean_confidence} />
        <span style={{ fontSize: 14, color: C.muted, transform: expanded ? "rotate(90deg)" : "none", transition: "transform 0.2s", textAlign: "center" }}>›</span>
      </div>

      {expanded && (
        <div style={{ padding: "0 16px 16px", borderTop: "1px solid rgba(0,212,186,0.1)", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12, marginTop: 12 }}>
          {[
            ["Peak date", event.peak_date],
            ["Mean intensity", `+${event.mean_intensity.toFixed(2)}°C above normal`],
            ["Total heat accumulated", event.accumulated_heat.toFixed(4)],
            ["Climate pattern (ENSO)", event.dominant_enso],
            ["Indian Ocean Dipole", event.dominant_iod],
            ["Data confidence", `${Math.round(event.mean_confidence * 100)}%`],
          ].map(([label, value]) => (
            <div key={label} style={{ background: "#081525", border: "1px solid rgba(0,212,186,0.1)", borderRadius: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>{label}</div>
              <div className="font-mono" style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function HeatwavesPage() {
  const [data, setData] = useState<HeatwaveData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"date" | "intensity" | "duration">("date");
  const [filterCat, setFilterCat] = useState<number | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/heatwaves/events`)
      .then((r) => { if (!r.ok) throw new Error("Could not load heatwave event data."); return r.json(); })
      .then((json) => setData(json))
      .catch((e) => setError(e instanceof Error ? e.message : "Unexpected error."))
      .finally(() => setLoading(false));
  }, []);

  const events = data?.events ?? [];
  const yearly = data?.yearly_summary ?? [];

  const filtered = events
    .filter((e) => filterCat === null || e.peak_category === filterCat)
    .sort((a, b) => {
      if (sortBy === "intensity") return b.peak_intensity - a.peak_intensity;
      if (sortBy === "duration") return b.duration_days - a.duration_days;
      return new Date(b.start_date).getTime() - new Date(a.start_date).getTime();
    });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Marine Heatwave Events</h1>
          <p className="page-subtitle">Every period when the Indian Ocean was unusually warm for five or more days in a row</p>
        </div>
      </div>

      <div className="page-body">
        {error && (
          <div className="alert-banner">
            <span className="alert-banner-icon">⚠️</span>
            <span className="alert-banner-text">{error}</span>
          </div>
        )}

        {/* Category explanation */}
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="card-header">
            <span className="card-title">What do the heatwave categories mean?</span>
          </div>
          <div className="card-body">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
              {[
                { cat: 1, desc: "Sea temperature is 1–2 times warmer than the worst 10% of historical records for that location and time of year." },
                { cat: 2, desc: "2–3 times above the extreme threshold. Fish may begin moving away from affected areas." },
                { cat: 3, desc: "3–4 times above the threshold. Coral bleaching is likely. Significant disruption to marine life." },
                { cat: 4, desc: "More than 4 times above the threshold. Mass coral bleaching and severe ecosystem damage are expected." },
              ].map(({ cat, desc }) => {
                const c = CAT[cat as keyof typeof CAT];
                return (
                  <div key={cat} style={{ background: c.bg, border: `1px solid ${c.color}44`, borderRadius: 10, padding: "14px 16px" }}>
                    <CategoryBadge cat={cat} />
                    <p style={{ fontSize: 12, color: "#8ab4c8", marginTop: 8, lineHeight: 1.5 }}>{desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Charts */}
        {yearly.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
            <div className="card">
              <div className="card-header"><span className="card-title">Heatwave events per year</span></div>
              <div className="card-body">
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>Are marine heatwaves becoming more frequent?</p>
                {/* Explicit pixel height fixes blank chart */}
                <div style={{ width: "100%", height: 200 }}>
                  <HeatwaveCharts data={yearly} chartType="bar" />
                </div>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><span className="card-title">Average heatwave duration per year</span></div>
              <div className="card-body">
                <p style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.5 }}>Are heatwaves lasting longer over time?</p>
                <div style={{ width: "100%", height: 200 }}>
                  <HeatwaveCharts data={yearly} chartType="line" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Event list */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">All detected events ({filtered.length})</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div style={{ display: "flex", gap: 4 }}>
                {[null, 1, 2, 3, 4].map((c) => (
                  <button key={c ?? "all"} onClick={() => setFilterCat(c)} style={{
                    background: filterCat === c ? (c ? CAT[c as keyof typeof CAT].bg : "#0f2a44") : "transparent",
                    border: `1px solid ${filterCat === c ? (c ? CAT[c as keyof typeof CAT].color + "88" : C.border) : "rgba(0,212,186,0.1)"}`,
                    borderRadius: 6,
                    color: filterCat === c ? (c ? CAT[c as keyof typeof CAT].color : C.teal) : C.muted,
                    fontFamily: "var(--font-mono)", fontSize: 9.5, padding: "4px 10px", cursor: "pointer",
                  }}>
                    {c === null ? "All" : `Cat ${c}`}
                  </button>
                ))}
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} style={{
                background: "#0b1e33", border: "1px solid rgba(0,212,186,0.1)", borderRadius: 6,
                color: "#8ab4c8", fontFamily: "var(--font-mono)", fontSize: 10, padding: "4px 10px", cursor: "pointer", outline: "none",
              }}>
                <option value="date">Sort by date</option>
                <option value="intensity">Sort by intensity</option>
                <option value="duration">Sort by duration</option>
              </select>
            </div>
          </div>

          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {loading ? (
              <div style={{ color: C.muted, fontSize: 13, padding: "20px 0" }}>Loading heatwave events…</div>
            ) : filtered.length === 0 ? (
              <div style={{ color: C.muted, fontSize: 13, padding: "20px 0" }}>No events match the current filter.</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 80px 110px 120px 90px 28px", padding: "4px 16px", gap: 8 }}>
                  {["Event", "Category", "Duration", "Peak intensity", "Area covered", "Confidence", ""].map((h) => (
                    <span key={h} className="font-mono" style={{ fontSize: 9, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em" }}>{h}</span>
                  ))}
                </div>
                {filtered.map((event) => (
                  <EventRow key={event.event_id} event={event} expanded={expandedId === event.event_id}
                    onToggle={() => setExpandedId(expandedId === event.event_id ? null : event.event_id)} />
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}