"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Hard-coded chart colors (CSS vars don't work in SVG) ──────
const C = {
  teal:    "#00d4ba",
  orange:  "#ff8c42",
  red:     "#ff4d6d",
  blue:    "#4db8ff",
  amber:   "#ffb347",
  muted:   "#3d6478",
  grid:    "rgba(0,212,186,0.08)",
  bg:      "#0b1e33",
  border:  "rgba(0,212,186,0.30)",
  text:    "#e8f4f8",
};

const TICK  = { fill: C.muted, fontSize: 10, fontFamily: "'DM Mono', monospace" };
const TIP   = { backgroundColor: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, color: C.text, fontFamily: "'DM Mono', monospace", fontSize: 11 };
const GRID  = { stroke: C.grid, strokeDasharray: "3 3" };

// ── Types ─────────────────────────────────────────────────────
interface TrendVariable {
  variable: string;
  slope_per_decade: number;
  r2: number;
  trend_confidence: number;
  p_value: number;
  direction: "rising" | "falling" | "stable";
}
interface YearlyPoint {
  year: number;
  sst: number | null;
  sst_anomaly: number | null;
  ohc: number | null;
  mld: number | null;
  mhw_days: number | null;
}
interface StratificationPoint {
  year: number;
  n2_mean: number | null;
  n2_trend: number | null;
}
interface SeasonalPoint {
  month: string;
  sst_mean: number;
  sst_std: number;
  mld_mean: number;
  ohc_mean: number;
}
interface TrendsData {
  trends: TrendVariable[];
  yearly: YearlyPoint[];
  stratification: StratificationPoint[];
  seasonal: SeasonalPoint[];
}

// ── Helpers ───────────────────────────────────────────────────
function TrendBadge({ direction, slope }: { direction: string; slope: number }) {
  if (direction === "rising")
    return <span className="badge badge-red">▲ +{Math.abs(slope).toFixed(3)} per decade</span>;
  if (direction === "falling")
    return <span className="badge badge-blue">▼ −{Math.abs(slope).toFixed(3)} per decade</span>;
  return <span className="badge badge-teal">→ Stable</span>;
}

function ConfidenceBar({ value }: { value: number }) {
  const pct   = Math.round(value * 100);
  const color = pct >= 80 ? C.teal : pct >= 60 ? C.amber : C.red;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 99, background: "rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.8s ease" }} />
      </div>
      <span style={{ fontSize: "0.75rem", color, fontWeight: 600, minWidth: 36 }}>{pct}%</span>
    </div>
  );
}

function OceanTooltip({ active, payload, label, unit }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="card" style={{ padding: "0.6rem 0.9rem", minWidth: 140 }}>
      <p style={{ fontSize: "0.7rem", color: C.muted, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} style={{ color: p.color, fontSize: "0.82rem", fontWeight: 600 }}>
          {p.name}: {p.value != null ? Number(p.value).toFixed(3) : "—"} {unit || ""}
        </p>
      ))}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────
export default function TrendsPage() {
  const [data,        setData]        = useState<TrendsData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [activeChart, setActiveChart] = useState<"sst" | "ohc" | "mld" | "mhw">("sst");

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/trends`)
      .then((r) => { if (!r.ok) throw new Error(`Server error: ${r.status}`); return r.json(); })
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) {
    return (
      <>
        <div className="page-header">
          <div>
            <h1 className="page-title">Long-term Ocean Trends</h1>
            <p className="page-subtitle">Decade-scale changes in the Indian Ocean</p>
          </div>
        </div>
        <div className="page-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px,1fr))", gap: 14, marginBottom: 24 }}>
            {[1,2,3,4].map((i) => (
              <div key={i} className="card" style={{ height: 90, animation: "shimmerPulse 1.6s ease-in-out infinite" }} />
            ))}
          </div>
          <div className="card" style={{ height: 320, marginBottom: 16, animation: "shimmerPulse 1.6s ease-in-out infinite" }} />
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <div className="page-header">
          <h1 className="page-title">Long-term Ocean Trends</h1>
        </div>
        <div className="page-body">
          <div className="alert-banner">
            <span className="alert-banner-icon">⚠️</span>
            <span className="alert-banner-text">Could not load trend data. ({error})</span>
          </div>
        </div>
      </>
    );
  }

  const { trends, yearly, stratification, seasonal } = data;

  // ── getTrend: find a variable in the trends array ─────────
  // Backend sends: "sst", "ohc_700m", "mld", "stratification"
  const getTrend = (name: string) => trends.find((t) => t.variable === name);

  const chartConfig = {
    sst:  { key: "sst_anomaly" as keyof YearlyPoint, label: "Sea Surface Temperature Anomaly (°C above normal)",             unit: "°C",   color: C.red    },
    ohc:  { key: "ohc"         as keyof YearlyPoint, label: "Ocean Heat Content (J/m² in top 700 m)",                        unit: "J/m²", color: C.orange  },
    mld:  { key: "mld"         as keyof YearlyPoint, label: "Mixed Layer Depth (metres)",                                     unit: "m",    color: C.blue    },
    mhw:  { key: "mhw_days"   as keyof YearlyPoint, label: "Marine Heatwave Days per Year (how many days had extreme heat)", unit: "days", color: C.teal    },
  };

  const cfg       = chartConfig[activeChart];
  const chartData = yearly.filter((y) => y[cfg.key] != null);

  const trendSummaries = [
    {
      label:       "Sea Surface Temperature",
      description: "How much hotter ocean surface water is getting each decade",
      trend:       getTrend("sst"),                  // ← backend key: "sst"
    },
    {
      label:       "Ocean Heat Content",
      description: "How much extra heat energy the ocean is storing each decade",
      trend:       getTrend("ohc_700m"),             // ← backend key: "ohc_700m"
    },
    {
      label:       "Mixed Layer Depth",
      description: "How the depth of the actively stirred upper ocean is changing",
      trend:       getTrend("mld"),                  // ← backend key: "mld"
    },
    {
      label:       "Ocean Stratification",
      description: "How strongly separated ocean layers are becoming (makes heatwaves worse)",
      trend:       getTrend("stratification"),       // ← FIXED: was "n2_mean", backend sends "stratification"
    },
  ];

  const tabLabels = {
    sst: "Temperature Anomaly",
    ohc: "Heat Content",
    mld: "Mixed Layer Depth",
    mhw: "Heatwave Days",
  };

  return (
    <>
      {/* ── Page header ─────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Long-term Ocean Trends</h1>
          <p className="page-subtitle">Decade-scale changes in the Indian Ocean</p>
        </div>
      </div>

      <div className="page-body">

        {/* Explainer card */}
        <div className="card" style={{
          background: "linear-gradient(135deg, rgba(0,212,186,0.08), rgba(0,168,150,0.05))",
          border: "1px solid rgba(0,212,186,0.2)",
          marginBottom: 24, padding: "1rem 1.25rem",
        }}>
          <p style={{ fontSize: 13.5, color: "#8ab4c8", lineHeight: 1.7 }}>
            This page shows how the Indian Ocean has been changing over the long term — not just day to day, but year by year and decade by decade.
            Rising temperatures, more stored heat energy, and stronger separation between ocean layers all point to the same thing: the Indian Ocean is warming,
            and that warming is making marine heatwaves more frequent and more severe.
          </p>
        </div>

        {/* ── Trend summary cards ──────────────────────────── */}
        <div style={{ marginBottom: "0.75rem" }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Key Trends at a Glance</h2>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>How each major ocean measurement has been changing over the decades</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px,1fr))", gap: 14, marginBottom: 28 }}>
          {trendSummaries.map((item) => (
            <div key={item.label} className="card" style={{ padding: "1.1rem 1.25rem" }}>
              <p style={{ fontSize: 10, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>
                {item.label}
              </p>
              <p style={{ fontSize: 12, color: "#8ab4c8", marginBottom: 12, lineHeight: 1.5 }}>
                {item.description}
              </p>
              {item.trend ? (
                <>
                  <TrendBadge direction={item.trend.direction} slope={item.trend.slope_per_decade} />
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Data reliability score</p>
                    <ConfidenceBar value={item.trend.trend_confidence} />
                  </div>
                  <p style={{ fontSize: 10, color: C.muted, marginTop: 8 }}>
                    Statistical significance (R²): {item.trend.r2.toFixed(3)} ·{" "}
                    {item.trend.p_value < 0.05 ? "Strong" : "Moderate"} statistical evidence
                  </p>
                </>
              ) : (
                <p style={{ fontSize: 12, color: C.muted }}>No trend data available</p>
              )}
            </div>
          ))}
        </div>

        {/* ── Year-by-year chart ───────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Year-by-Year Change</h2>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>Select a measurement below to see how it has changed over time</p>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {(["sst", "ohc", "mld", "mhw"] as const).map((key) => (
            <button key={key} onClick={() => setActiveChart(key)} style={{
              padding: "6px 16px", borderRadius: 99, fontSize: 13, fontWeight: 600,
              border: `1px solid ${activeChart === key ? chartConfig[key].color : "rgba(255,255,255,0.1)"}`,
              background: activeChart === key ? `${chartConfig[key].color}22` : "transparent",
              color: activeChart === key ? chartConfig[key].color : C.muted,
              cursor: "pointer", transition: "all 0.2s",
            }}>
              {tabLabels[key]}
            </button>
          ))}
        </div>

        <div className="card" style={{ marginBottom: 28 }}>
          <div style={{ padding: "16px 20px 0" }}>
            <p style={{ fontSize: 13, color: "#8ab4c8", lineHeight: 1.6 }}>{cfg.label}</p>
          </div>
          <div style={{ width: "100%", height: 300, padding: "12px 8px 8px" }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor={cfg.color} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={cfg.color} stopOpacity={0}   />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="year" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} />
                <YAxis tick={TICK} axisLine={false} tickLine={false} width={55} />
                <Tooltip content={<OceanTooltip unit={cfg.unit} />} />
                {activeChart === "sst" && (
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                )}
                <Area
                  type="monotone"
                  dataKey={cfg.key as string}
                  name={tabLabels[activeChart]}
                  stroke={cfg.color}
                  strokeWidth={2.5}
                  fill="url(#areaGrad)"
                  dot={false}
                  activeDot={{ r: 5, fill: cfg.color, stroke: "#03080f", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Seasonal patterns ────────────────────────────── */}
        <div style={{ marginBottom: 12 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Seasonal Patterns</h2>
          <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
            How ocean conditions normally change through the year — January to December
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 28 }}>
          <div className="card">
            <div style={{ padding: "16px 20px 0" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Sea Surface Temperature by Month</p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>Average ocean surface temperature for each month of the year</p>
            </div>
            <div style={{ width: "100%", height: 220, padding: "8px 8px 8px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={seasonal} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={TIP} />
                  <Line
                    type="monotone"
                    dataKey="sst_mean"
                    name="Avg Temperature"
                    stroke="#ff4d6d"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 4, fill: "#ff4d6d" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="card">
            <div style={{ padding: "16px 20px 0" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Mixed Layer Depth by Month</p>
              <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>How deep the upper stirred layer of the ocean reaches in each month</p>
            </div>
            <div style={{ width: "100%", height: 220, padding: "8px 8px 8px" }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={seasonal} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid {...GRID} />
                  <XAxis dataKey="month" tick={TICK} axisLine={false} tickLine={false} />
                  <YAxis tick={TICK} axisLine={false} tickLine={false} width={40} />
                  <Tooltip contentStyle={TIP} />
                  <Bar dataKey="mld_mean" name="Mixed Layer Depth" fill="#4db8ff" fillOpacity={0.8} radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* ── Stratification chart ─────────────────────────── */}
        {stratification && stratification.length > 0 && (
          <>
            <div style={{ marginBottom: 12 }}>
              <h2 style={{ fontSize: 17, fontWeight: 700, color: C.text }}>Ocean Layer Separation (Stratification)</h2>
              <p style={{ fontSize: 13, color: C.muted, marginTop: 4 }}>
                A rising value means ocean layers are becoming more separated — warm water stays at the top and does not mix with cooler water below, making heatwaves worse
              </p>
            </div>
            <div className="card" style={{ marginBottom: 28 }}>
              <div style={{ width: "100%", height: 260, padding: "16px 8px 8px" }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stratification} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                    <CartesianGrid {...GRID} />
                    <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
                    <YAxis tick={TICK} axisLine={false} tickLine={false} width={55} />
                    <Tooltip contentStyle={TIP} />
                    <Line
                      type="monotone"
                      dataKey="n2_mean"
                      name="Stratification (N²)"
                      stroke="#00d4ba"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="n2_trend"
                      name="Long-term Trend Line"
                      stroke="rgba(255,255,255,0.3)"
                      strokeWidth={1.5}
                      strokeDasharray="5 5"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* ── Plain-language summary ───────────────────────── */}
        <div className="card" style={{
          background: "rgba(255,77,109,0.06)",
          border: "1px solid rgba(255,77,109,0.18)",
          padding: "1.1rem 1.25rem",
        }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>
            What these trends mean in plain terms
          </p>
          <p style={{ fontSize: 13, color: "#8ab4c8", lineHeight: 1.75 }}>
            The Indian Ocean is warming faster than almost any other ocean on Earth. Warmer water at the surface, more heat stored deeper down,
            and stronger separation between ocean layers all combine to create the conditions where marine heatwaves form more easily, last longer, and reach higher intensities.
            These changes are not random fluctuations — they follow a consistent long-term trend that lines up with what climate science predicts from global warming.
          </p>
        </div>

      </div>
    </>
  );
}