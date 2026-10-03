"use client";

import React, { useEffect, useState, useRef } from "react";

// ── Types — matches exactly what /api/heatmap/sst returns ─────
interface SSTPoint {
  latitude: number;
  longitude: number;
  sst: number;
  sst_anomaly: number;
}

interface HeatmapData {
  points: SSTPoint[];
  date: string;
  min_sst: number;
  max_sst: number;
  min_anomaly: number;
  max_anomaly: number;
}

// ── Colour helpers ─────────────────────────────────────────────
function anomalyToColor(anomaly: number): string {
  const t = Math.max(-3, Math.min(3, anomaly));
  const norm = (t + 3) / 6;
  if (norm < 0.5) {
    const f = norm / 0.5;
    return `rgba(${Math.round(30 + f * 225)},${Math.round(100 + f * 155)},${Math.round(220 + f * 35)},0.85)`;
  } else {
    const f = (norm - 0.5) / 0.5;
    return `rgba(255,${Math.round(255 - f * 200)},${Math.round(255 - f * 230)},0.85)`;
  }
}

function sstToColor(sst: number): string {
  const t = Math.max(15, Math.min(35, sst));
  const norm = (t - 15) / 20;
  if (norm < 0.33) {
    const f = norm / 0.33;
    return `rgba(${Math.round(30 + f * 20)},${Math.round(100 + f * 80)},${Math.round(220 - f * 20)},0.85)`;
  } else if (norm < 0.66) {
    const f = (norm - 0.33) / 0.33;
    return `rgba(${Math.round(50 + f * 180)},${Math.round(180 + f * 60)},${Math.round(200 - f * 150)},0.85)`;
  } else {
    const f = (norm - 0.66) / 0.34;
    return `rgba(${Math.round(230 + f * 25)},${Math.round(240 - f * 190)},${Math.round(50 - f * 40)},0.85)`;
  }
}

// ── Canvas map ────────────────────────────────────────────────
function OceanMap({
  points,
  mode,
  width,
  height,
}: {
  points: SSTPoint[];
  mode: "sst" | "anomaly";
  width: number;
  height: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const LAT_MIN = -50, LAT_MAX = 30, LON_MIN = 20, LON_MAX = 120;

  function project(lat: number, lon: number): [number, number] {
    const x = ((lon - LON_MIN) / (LON_MAX - LON_MIN)) * width;
    const y = ((LAT_MAX - lat) / (LAT_MAX - LAT_MIN)) * height;
    return [x, y];
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || points.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#071525";
    ctx.fillRect(0, 0, width, height);

    // Grid lines
    ctx.strokeStyle = "rgba(0,212,186,0.07)";
    ctx.lineWidth = 0.5;
    for (let lat = LAT_MIN; lat <= LAT_MAX; lat += 10) {
      const [, y] = project(lat, LON_MIN);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
    }
    for (let lon = LON_MIN; lon <= LON_MAX; lon += 10) {
      const [x] = project(0, lon);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke();
    }

    // Data points
    const dotSize = Math.max(2.5, Math.min(6, width / 160));
    for (const p of points) {
      const [x, y] = project(p.latitude, p.longitude);
      ctx.fillStyle = mode === "anomaly" ? anomalyToColor(p.sst_anomaly) : sstToColor(p.sst);
      ctx.beginPath();
      ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }

    // Axis labels
    ctx.fillStyle = "rgba(138,180,200,0.55)";
    ctx.font = "10px 'DM Mono', monospace";
    for (let lat = -40; lat <= 20; lat += 20) {
      const [, y] = project(lat, LON_MIN);
      ctx.textAlign = "left";
      ctx.fillText(`${lat}°`, 6, y + 4);
    }
    for (let lon = 30; lon <= 110; lon += 20) {
      const [x] = project(LAT_MIN, lon);
      ctx.textAlign = "center";
      ctx.fillText(`${lon}°E`, x, height - 5);
    }
  }, [points, mode, width, height]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ width: "100%", height: "auto", borderRadius: 10, display: "block" }}
    />
  );
}

// ── Color legend ──────────────────────────────────────────────
function ColorLegend({ mode }: { mode: "sst" | "anomaly" }) {
  const steps = 20;
  const colors = Array.from({ length: steps }, (_, i) => {
    const norm = i / (steps - 1);
    return mode === "anomaly" ? anomalyToColor(norm * 6 - 3) : sstToColor(norm * 20 + 15);
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span className="font-mono" style={{ fontSize: 10, color: "#3d6478", whiteSpace: "nowrap" }}>
        {mode === "anomaly" ? "−3°C" : "15°C"}
      </span>
      <div style={{
        flex: 1, height: 12, borderRadius: 6,
        background: `linear-gradient(to right, ${colors.join(", ")})`,
        border: "1px solid rgba(0,212,186,0.1)",
      }} />
      <span className="font-mono" style={{ fontSize: 10, color: "#3d6478", whiteSpace: "nowrap" }}>
        {mode === "anomaly" ? "+3°C" : "35°C"}
      </span>
    </div>
  );
}

// ── Hover info panel ──────────────────────────────────────────
function HoverInfo({ point }: { point: SSTPoint | null }) {
  if (!point) return null;
  return (
    <div style={{
      background: "#0b1e33",
      border: "1px solid rgba(0,212,186,0.30)",
      borderRadius: 10,
      padding: "12px 16px",
      minWidth: 200,
    }}>
      <div className="font-mono" style={{ fontSize: 9.5, color: "#3d6478", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>
        Selected Location
      </div>
      {[
        ["Latitude",         `${point.latitude.toFixed(2)}°`],
        ["Longitude",        `${point.longitude.toFixed(2)}°E`],
        ["Sea Surface Temp", `${point.sst.toFixed(2)}°C`],
        ["Anomaly",          `${point.sst_anomaly > 0 ? "+" : ""}${point.sst_anomaly.toFixed(2)}°C`],
      ].map(([label, value]) => (
        <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
          <span style={{ fontSize: 12, color: "#3d6478" }}>{label}</span>
          <span style={{
            fontSize: 12, fontFamily: "var(--font-mono)", fontWeight: 600,
            color: label === "Anomaly"
              ? parseFloat(value) > 0 ? "#ff8c42" : "#4db8ff"
              : "#e8f4f8",
          }}>{value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────
export default function HeatmapPage() {
  const [data,         setData]         = useState<HeatmapData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [mode,         setMode]         = useState<"sst" | "anomaly">("anomaly");
  const [hoveredPoint, setHoveredPoint] = useState<SSTPoint | null>(null);
  const [mapSize,      setMapSize]      = useState({ width: 800, height: 450 });

  // ── NEW: date picker state ────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState("");          // "" = latest
  const [minDate,      setMinDate]      = useState("1982-01-01");
  const [maxDate,      setMaxDate]      = useState("");

  const containerRef = useRef<HTMLDivElement>(null);
  const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  // Responsive canvas sizing
  useEffect(() => {
    function resize() {
      if (containerRef.current) {
        const w = containerRef.current.offsetWidth;
        setMapSize({ width: w, height: Math.round(w * 0.54) });
      }
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // ── NEW: fetch valid date bounds once on mount ────────────────
  useEffect(() => {
    fetch(`${BASE}/api/heatmap/date-range`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) { setMinDate(d.min_date); setMaxDate(d.max_date); }
      })
      .catch(() => {});
  }, []);

  // ── CHANGED: re-fetch when selectedDate changes ───────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const url = selectedDate
      ? `${BASE}/api/heatmap/sst?date=${selectedDate}`
      : `${BASE}/api/heatmap/sst`;

    fetch(url)
      .then(r => { if (!r.ok) throw new Error(`Server error ${r.status}`); return r.json(); })
      .then((json: HeatmapData) => setData(json))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDate]); // ← KEY change: was [], now [selectedDate]

  // Shift date by N days using ← → buttons
  function shiftDate(days: number) {
    const base = selectedDate || data?.date || "";
    if (!base) return;
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    const iso = d.toISOString().slice(0, 10);
    if (iso >= minDate && (!maxDate || iso <= maxDate)) setSelectedDate(iso);
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!data || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xR = (e.clientX - rect.left) / rect.width;
    const yR = (e.clientY - rect.top) / rect.height;
    const lon = 20 + xR * 100;
    const lat = 30 - yR * 80;
    let nearest: SSTPoint | null = null;
    let minD = 2;
    for (const p of data.points) {
      const d = Math.sqrt((p.latitude - lat) ** 2 + (p.longitude - lon) ** 2);
      if (d < minD) { minD = d; nearest = p; }
    }
    setHoveredPoint(nearest);
  }

  const meanSst  = data ? data.points.reduce((s, p) => s + p.sst,         0) / (data.points.length || 1) : 0;
  const meanAnom = data ? data.points.reduce((s, p) => s + p.sst_anomaly, 0) / (data.points.length || 1) : 0;

  return (
    <>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Sea Surface Temperature Map</h1>
          <p className="page-subtitle">
            How warm or cold is the Indian Ocean right now — and how does it compare to normal?
          </p>
        </div>

        {/* ── NEW: date controls in header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, alignSelf: "center", flexWrap: "wrap" }}>
          {/* Prev day */}
          <button
            onClick={() => shiftDate(-1)}
            style={{
              background: "transparent",
              border: "1px solid rgba(0,212,186,0.15)",
              borderRadius: 6, color: "#8ab4c8",
              fontFamily: "var(--font-mono)", fontSize: 14,
              padding: "5px 11px", cursor: "pointer",
            }}
          >←</button>

          {/* Date input */}
          <input
            type="date"
            value={selectedDate}
            min={minDate}
            max={maxDate || undefined}
            onChange={e => setSelectedDate(e.target.value)}
            style={{
              background: "#081525",
              border: "1px solid rgba(0,212,186,0.30)",
              borderRadius: 7, color: "#00d4ba",
              fontFamily: "var(--font-mono)", fontSize: 11,
              padding: "5px 10px", cursor: "pointer",
              colorScheme: "dark",
            }}
          />

          {/* Next day */}
          <button
            onClick={() => shiftDate(1)}
            style={{
              background: "transparent",
              border: "1px solid rgba(0,212,186,0.15)",
              borderRadius: 6, color: "#8ab4c8",
              fontFamily: "var(--font-mono)", fontSize: 14,
              padding: "5px 11px", cursor: "pointer",
            }}
          >→</button>

          {/* Reset to latest / current date badge */}
          {selectedDate ? (
            <button
              onClick={() => setSelectedDate("")}
              style={{
                background: "rgba(0,212,186,0.10)",
                border: "1px solid rgba(0,212,186,0.25)",
                borderRadius: 6, color: "#00d4ba",
                fontFamily: "var(--font-mono)", fontSize: 10,
                padding: "5px 11px", cursor: "pointer",
              }}
            >Latest</button>
          ) : data && (
            <span className="font-mono" style={{
              fontSize: 10.5, color: "#3d6478",
              background: "#0b1e33", border: "1px solid rgba(0,212,186,0.1)",
              borderRadius: 7, padding: "6px 12px",
            }}>
              Data from: {data.date}
            </span>
          )}
        </div>
      </div>

      <div className="page-body">
        {error && (
          <div className="alert-banner">
            <span className="alert-banner-icon">⚠️</span>
            <span className="alert-banner-text">{error}</span>
          </div>
        )}

        {/* Metric tiles — recalculate live for selected date */}
        {data && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Average Temperature", value: `${meanSst.toFixed(2)}°C`,  sub: "across the Indian Ocean" },
              { label: "Average Anomaly",      value: `${meanAnom > 0 ? "+" : ""}${meanAnom.toFixed(2)}°C`, sub: "above or below normal", alert: meanAnom > 0.5, cold: meanAnom < -0.5 },
              { label: "Hottest Reading",      value: `${data.max_sst.toFixed(2)}°C`, sub: "maximum observed" },
              { label: "Coolest Reading",      value: `${data.min_sst.toFixed(2)}°C`, sub: "minimum observed" },
              { label: "Data Points",          value: data.points.length.toLocaleString(), sub: "ocean grid cells" },
            ].map((m) => (
              <div key={m.label} className={`metric-tile${m.alert ? " alert" : ""}`}>
                <div className="metric-label">{m.label}</div>
                <div className="metric-value" style={{
                  fontSize: 22,
                  color: m.alert ? "#ff8c42" : (m as any).cold ? "#4db8ff" : "#e8f4f8",
                }}>
                  {m.value}
                </div>
                <div className="metric-delta" style={{ color: "#3d6478" }}>{m.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Map card */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">
              Indian Ocean — {mode === "anomaly" ? "Temperature Difference from Normal" : "Actual Sea Surface Temperature"}
            </span>
            <div style={{ display: "flex", gap: 4, background: "#081525", border: "1px solid rgba(0,212,186,0.1)", borderRadius: 8, padding: 3 }}>
              {(["anomaly", "sst"] as const).map((m) => (
                <button key={m} onClick={() => setMode(m)} style={{
                  background: mode === m ? "#0f2a44" : "transparent",
                  border: mode === m ? "1px solid rgba(0,212,186,0.30)" : "1px solid transparent",
                  borderRadius: 6,
                  color: mode === m ? "#00d4ba" : "#3d6478",
                  fontFamily: "var(--font-mono)",
                  fontSize: 10, padding: "5px 12px", cursor: "pointer", transition: "all 0.18s",
                }}>
                  {m === "anomaly" ? "Anomaly (difference from normal)" : "Actual temperature"}
                </button>
              ))}
            </div>
          </div>

          <div className="card-body">
            {loading ? (
              <div style={{
                height: 420, background: "#081525", borderRadius: 10,
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "#3d6478", fontFamily: "var(--font-mono)", fontSize: 12,
              }}>
                {selectedDate ? `Loading data for ${selectedDate}…` : "Loading ocean temperature data… (this may take up to 60 seconds on first load)"}
              </div>
            ) : data && data.points.length === 0 ? (
              <div style={{ height: 200, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <span style={{ color: "#3d6478", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  No data available for {selectedDate || "this date"}.
                </span>
                {selectedDate && (
                  <button
                    onClick={() => setSelectedDate("")}
                    style={{ background: "transparent", border: "1px solid rgba(0,212,186,0.2)", borderRadius: 6, color: "#00d4ba", fontFamily: "var(--font-mono)", fontSize: 10, padding: "5px 12px", cursor: "pointer" }}
                  >Back to latest</button>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", gap: 16 }}>
                {/* Canvas */}
                <div
                  ref={containerRef}
                  style={{ flex: 1, cursor: "crosshair", position: "relative" }}
                  onMouseMove={handleMouseMove}
                  onMouseLeave={() => setHoveredPoint(null)}
                >
                  <OceanMap
                    points={data?.points ?? []}
                    mode={mode}
                    width={mapSize.width}
                    height={mapSize.height}
                  />
                  {/* Region labels */}
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none" }}>
                    {[
                      { label: "Arabian Sea",           top: "22%", left: "25%" },
                      { label: "Bay of Bengal",         top: "22%", left: "58%" },
                      { label: "Southern Indian Ocean", top: "72%", left: "42%" },
                    ].map((r) => (
                      <span key={r.label} style={{
                        position: "absolute", top: r.top, left: r.left,
                        fontFamily: "var(--font-mono)", fontSize: 9,
                        color: "rgba(138,180,200,0.55)", letterSpacing: "0.10em",
                        textTransform: "uppercase", transform: "translateX(-50%)",
                      }}>{r.label}</span>
                    ))}
                  </div>
                </div>

                {/* Right panel */}
                <div style={{ width: 220, display: "flex", flexDirection: "column", gap: 16, flexShrink: 0 }}>
                  <div>
                    <div className="font-mono" style={{ fontSize: 9.5, color: "#3d6478", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 8 }}>
                      Colour scale
                    </div>
                    <ColorLegend mode={mode} />
                    <p style={{ fontSize: 11, color: "#3d6478", marginTop: 8, lineHeight: 1.5 }}>
                      {mode === "anomaly"
                        ? "Blue means cooler than usual. Red means warmer than usual. White means normal."
                        : "Blue is cool water. Yellow and red are warm water."}
                    </p>
                  </div>
                  <HoverInfo point={hoveredPoint} />
                  <div style={{ marginTop: "auto", background: "#081525", border: "1px solid rgba(0,212,186,0.1)", borderRadius: 8, padding: "10px 12px" }}>
                    <p className="font-mono" style={{ fontSize: 9.5, color: "#3d6478", lineHeight: 1.5 }}>
                      Move your mouse over the map to see exact temperature values for any location.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {!loading && data && (
              <div style={{ marginTop: 16 }}>
                <ColorLegend mode={mode} />
              </div>
            )}
          </div>
        </div>

        {/* Sub-region table — unchanged */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Sub-region Breakdown</span>
            <span className="badge badge-teal" style={{ fontSize: 9 }}>Indian Ocean regions</span>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 13, color: "#3d6478", marginBottom: 16, lineHeight: 1.6 }}>
              The Indian Ocean is divided into several sub-regions, each with its own temperature patterns and climate behaviour.
            </p>
            <table className="ocean-table">
              <thead>
                <tr>
                  <th>Region</th>
                  <th>Typical temperature range</th>
                  <th>Key influence</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Arabian Sea",             "24°C – 30°C", "Southwest monsoon winds"],
                  ["Bay of Bengal",           "25°C – 31°C", "Freshwater from rivers, cyclone formation"],
                  ["Equatorial Indian Ocean", "27°C – 30°C", "Indian Ocean Dipole (IOD)"],
                  ["Southern Indian Ocean",   "10°C – 25°C", "Antarctic Circumpolar Current"],
                ].map(([region, range, influence]) => (
                  <tr key={region}>
                    <td style={{ color: "#e8f4f8", fontWeight: 500 }}>{region}</td>
                    <td>{range}</td>
                    <td>{influence}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}