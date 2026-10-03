"use client";

import React, { useEffect, useState, useRef, useCallback } from "react";

// ── Types ──────────────────────────────────────────────────────
interface DashboardData {
  mhw: {
    is_active: boolean; category: number; category_label: string;
    mean_intensity: number; max_intensity: number;
    coverage_pct: number; date: string; confidence: number;
  };
  climate_indices: {
    enso: number; enso_phase: string; dmi: number;
    iod_phase: string; pdo: number; pdo_phase: string;
  };
  argo: {
    n_profiles: number; mean_sst: number; median_mld: number;
    mean_ohc: number; mean_confidence: number;
  };
  trends: { sst_slope: number; ohc_slope: number; mld_slope: number };
  rapid_changes: { sst_rises_30d: number; sst_drops_30d: number };
}

interface HeatwaveDay {
  date: string;
  is_mhw: boolean;
  intensity: number;
}

interface ArgoProfile {
  profile_id: string;
  latitude: number;
  longitude: number;
  sst_argo: number | null;
  mld: number | null;
  basin?: string;
}

// ── Design tokens (matching globals.css) ──────────────────────
const T = {
  teal:     "#00d4ba",
  tealMid:  "#00a896",
  tealDim:  "#005a50",
  red:      "#ff4d6d",
  orange:   "#ff8c42",
  amber:    "#ffb347",
  blue:     "#4db8ff",
  bg:       "#0b1e33",
  bgDeep:   "#081525",
  bgVoid:   "#03080f",
  textPri:  "#e8f4f8",
  textSec:  "#8ab4c8",
  textMut:  "#3d6478",
  border:   "rgba(0,212,186,0.10)",
  borderAct:"rgba(0,212,186,0.30)",
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ══════════════════════════════════════════════════════════════
// PULSE RING — animated status indicator
// ══════════════════════════════════════════════════════════════
function PulseRing({ active }: { active: boolean }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", width: 10, height: 10 }}>
      <span style={{
        position: "absolute", width: "100%", height: "100%", borderRadius: "50%",
        background: active ? T.red : T.teal,
        animation: "ping 1.4s cubic-bezier(0,0,0.2,1) infinite",
        opacity: 0.6,
      }} />
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? T.red : T.teal, flexShrink: 0 }} />
      <style>{`@keyframes ping{75%,100%{transform:scale(2);opacity:0}}`}</style>
    </span>
  );
}

// ══════════════════════════════════════════════════════════════
// STAT CARD — glassmorphism metric tile
// ══════════════════════════════════════════════════════════════
function StatCard({
  label, value, unit, sub, accent, glow, loading
}: {
  label: string; value: string | number; unit?: string; sub?: string;
  accent?: string; glow?: string; loading?: boolean;
}) {
  const col = accent || T.teal;
  return (
    <div style={{
      background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`,
      border: `1px solid ${T.border}`,
      borderTop: `2px solid ${col}`,
      borderRadius: 14,
      padding: "18px 20px",
      position: "relative",
      overflow: "hidden",
      transition: "border-color 0.25s, box-shadow 0.25s",
    }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = col;
        (e.currentTarget as HTMLDivElement).style.boxShadow = glow || `0 0 20px ${col}22`;
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.borderColor = T.border;
        (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
      }}
    >
      <div style={{
        position: "absolute", top: -20, right: -20, width: 80, height: 80, borderRadius: "50%",
        background: `radial-gradient(circle, ${col}18 0%, transparent 70%)`,
        pointerEvents: "none",
      }} />
      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 10 }}>
        {label}
      </div>
      {loading ? (
        <div style={{ height: 32, width: "55%", background: `${T.border}`, borderRadius: 6, animation: "shimmer 1.6s ease-in-out infinite" }}>
          <style>{`@keyframes shimmer{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 28, fontWeight: 500, color: col, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {value}
            </span>
            {unit && <span style={{ fontFamily: "DM Mono, monospace", fontSize: 12, color: T.textMut }}>{unit}</span>}
          </div>
          {sub && <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10.5, color: T.textSec, marginTop: 6 }}>{sub}</div>}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// CLIMATE INDEX — horizontal gauge bar
// ══════════════════════════════════════════════════════════════
function ClimateGauge({ label, abbr, value, phase, min = -4, max = 4 }: {
  label: string; abbr: string; value: number; phase: string; min?: number; max?: number;
}) {
  const pct = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const col = value > 0.5 ? T.red : value < -0.5 ? T.blue : T.teal;
  const midPct = ((0 - min) / (max - min)) * 100;

  return (
    <div style={{
      background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 12,
      padding: "14px 18px", transition: "border-color 0.2s",
    }}
      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.borderColor = T.borderAct}
      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.borderColor = T.border}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div>
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.12em" }}>{abbr}</span>
          <div style={{ fontSize: 13, color: T.textPri, fontWeight: 500, marginTop: 2 }}>{phase}</div>
        </div>
        <div style={{ fontFamily: "DM Mono, monospace", fontSize: 24, fontWeight: 500, color: col }}>
          {value > 0 ? "+" : ""}{value.toFixed(2)}
        </div>
      </div>
      <div style={{ position: "relative", height: 6, background: `${T.textMut}30`, borderRadius: 3 }}>
        <div style={{
          position: "absolute", left: `${midPct}%`, top: -2, width: 1, height: 10,
          background: `${T.textMut}60`,
        }} />
        <div style={{
          position: "absolute",
          left: value >= 0 ? `${midPct}%` : `${pct}%`,
          width: value >= 0 ? `${pct - midPct}%` : `${midPct - pct}%`,
          height: "100%",
          background: col,
          borderRadius: 3,
          transition: "width 0.8s cubic-bezier(0.34,1.56,0.64,1)",
        }} />
        <div style={{
          position: "absolute", left: `${pct}%`, top: "50%",
          transform: "translate(-50%, -50%)",
          width: 12, height: 12, borderRadius: "50%",
          background: col, border: `2px solid ${T.bgDeep}`,
          transition: "left 0.8s cubic-bezier(0.34,1.56,0.64,1)",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: `${T.textMut}80` }}>{min}</span>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut }}>{label}</span>
        <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: `${T.textMut}80` }}>+{max}</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SST ANOMALY HEATMAP — canvas-based
// ══════════════════════════════════════════════════════════════
function SSTHeatmapCard() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(false);
  const [date,         setDate]         = useState("");
  const [selectedDate, setSelectedDate] = useState("");   // "" = latest
  const [minDate,      setMinDate]      = useState("1982-01-01");
  const [maxDate,      setMaxDate]      = useState("");
  const [stats,        setStats]        = useState<{ min: number; max: number } | null>(null);

  // Fetch available date range once on mount
  useEffect(() => {
    fetch(`${API}/api/heatmap/date-range`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          setMinDate(d.min_date);
          setMaxDate(d.max_date);
        }
      })
      .catch(() => {});
  }, []);

  // Fetch and paint canvas — re-runs when selectedDate changes
  useEffect(() => {
    setLoading(true);
    setError(false);

    const url = selectedDate
      ? `${API}/api/heatmap/grid?date=${selectedDate}&stride=3`
      : `${API}/api/heatmap/latest?stride=3`;

    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setDate(data.date ?? "");
        const canvas = canvasRef.current;
        if (!canvas) return;

        const grid: (number | null)[][] = data.grid;
        const latValues: number[] = data.lat_values ?? [];
        if (!grid?.length) { setError(true); setLoading(false); return; }

        const rows = grid.length, cols = grid[0].length;
        const flat = grid.flat().filter((v): v is number => v != null && isFinite(v));
        if (!flat.length) { setError(true); setLoading(false); return; }

        const mn = data.min_anomaly ?? Math.min(...flat);
        const mx = data.max_anomaly ?? Math.max(...flat);
        const rng = (mx - mn) || 1;
        setStats({ min: parseFloat(mn.toFixed(2)), max: parseFloat(mx.toFixed(2)) });

        canvas.width = cols; canvas.height = rows;
        const ctx = canvas.getContext("2d")!;
        const img = ctx.createImageData(cols, rows);
        const asc = !latValues.length || latValues[0] < latValues[latValues.length - 1];

        for (let ri = 0; ri < rows; ri++) {
          const gr = asc ? rows - 1 - ri : ri;
          for (let ci = 0; ci < cols; ci++) {
            const v = grid[gr]?.[ci];
            const idx = (ri * cols + ci) * 4;
            if (v == null || !isFinite(v)) {
              img.data[idx] = 4; img.data[idx+1] = 14; img.data[idx+2] = 30; img.data[idx+3] = 255;
              continue;
            }
            const t = (v - mn) / rng;
            let r: number, g: number, b: number;
            if (t < 0.2) {
              const s = t / 0.2;
              r = 0; g = Math.round(50 + s * 80); b = Math.round(180 + s * 40);
            } else if (t < 0.45) {
              const s = (t - 0.2) / 0.25;
              r = 0; g = Math.round(130 + s * 82); b = Math.round(220 - s * 34);
            } else if (t < 0.65) {
              const s = (t - 0.45) / 0.2;
              r = Math.round(s * 200); g = Math.round(212 - s * 72); b = Math.round(186 - s * 120);
            } else if (t < 0.85) {
              const s = (t - 0.65) / 0.2;
              r = Math.round(200 + s * 55); g = Math.round(140 - s * 100); b = Math.round(66 - s * 50);
            } else {
              const s = (t - 0.85) / 0.15;
              r = 255; g = Math.round(40 - s * 30); b = Math.round(16 - s * 14);
            }
            img.data[idx] = r; img.data[idx+1] = g; img.data[idx+2] = b; img.data[idx+3] = 240;
          }
        }
        ctx.putImageData(img, 0, 0);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, [selectedDate]); // ← KEY: re-runs on date change

  // Prev / Next day helpers
  function shiftDate(days: number) {
    const base = selectedDate || date;   // use displayed date if no selection yet
    if (!base) return;
    const d = new Date(base);
    d.setDate(d.getDate() + days);
    const iso = d.toISOString().slice(0, 10);
    if (iso >= minDate && iso <= (maxDate || iso)) setSelectedDate(iso);
  }

  return (
    <div style={{ background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`, border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden" }}>

      {/* ── Header with date controls ── */}
      <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>SST Anomaly Field</div>
          <div style={{ fontSize: 13, color: T.textSec }}>
            {selectedDate ? `Showing: ${date}` : `Latest: ${date || "loading…"}`} — deviation from 1982–2011 baseline
          </div>
        </div>

        {/* Date picker controls */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {/* Prev day */}
          <button
            onClick={() => shiftDate(-1)}
            style={{
              background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6,
              color: T.textSec, fontFamily: "DM Mono, monospace", fontSize: 13,
              padding: "5px 10px", cursor: "pointer",
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
              background: T.bgDeep, border: `1px solid ${T.borderAct}`,
              borderRadius: 7, color: T.teal,
              fontFamily: "DM Mono, monospace", fontSize: 11,
              padding: "5px 10px", cursor: "pointer",
              colorScheme: "dark",
            }}
          />

          {/* Next day */}
          <button
            onClick={() => shiftDate(1)}
            style={{
              background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6,
              color: T.textSec, fontFamily: "DM Mono, monospace", fontSize: 13,
              padding: "5px 10px", cursor: "pointer",
            }}
          >→</button>

          {/* Reset to latest */}
          {selectedDate && (
            <button
              onClick={() => setSelectedDate("")}
              style={{
                background: `${T.teal}15`, border: `1px solid ${T.tealDim}`,
                borderRadius: 6, color: T.teal,
                fontFamily: "DM Mono, monospace", fontSize: 10,
                padding: "5px 10px", cursor: "pointer",
              }}
            >Latest</button>
          )}
        </div>

        {/* Colour scale — unchanged from original */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
          <div style={{ width: 140, height: 10, borderRadius: 5, background: "linear-gradient(90deg, #0032b4, #00d4ba 35%, #ffb347 55%, #ff4d6d 80%, #ff0020)", border: `1px solid ${T.border}` }} />
          <div style={{ display: "flex", justifyContent: "space-between", width: 140 }}>
            {stats ? (
              <>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.blue }}>{stats.min}°C</span>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut }}>0</span>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.red }}>{stats.max}°C</span>
              </>
            ) : (
              <>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.blue }}>Cold</span>
                <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.red }}>Hot</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Canvas area — identical to original ── */}
      <div style={{ position: "relative", background: "#03080f" }}>
        {loading && (
          <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, zIndex: 2 }}>
            <div style={{ width: 36, height: 36, border: `2px solid ${T.border}`, borderTop: `2px solid ${T.teal}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textMut }}>
              {selectedDate ? `Loading ${selectedDate}…` : "Loading SST field…"}
            </span>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          </div>
        )}
        {error && !loading && (
          <div style={{ height: 240, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: `${T.red}18`, border: `1px solid ${T.red}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, color: T.red }}>!</div>
            <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textMut }}>
              No data for {selectedDate || "this date"}
            </span>
            {selectedDate && (
              <button
                onClick={() => setSelectedDate("")}
                style={{ marginTop: 4, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 6, color: T.teal, fontFamily: "DM Mono, monospace", fontSize: 10, padding: "4px 10px", cursor: "pointer" }}
              >Back to latest</button>
            )}
          </div>
        )}
        <canvas ref={canvasRef} style={{ width: "100%", height: 260, display: loading || error ? "none" : "block", imageRendering: "pixelated" }} />
        {!loading && !error && (
          <div style={{ position: "absolute", left: 10, inset: 0, display: "flex", flexDirection: "column", justifyContent: "space-around", pointerEvents: "none", padding: "8px 0" }}>
            {[30, 20, 10, 0, -10, -20, -30, -40].map(lat => (
              <div key={lat} style={{ fontFamily: "DM Mono, monospace", fontSize: 8, color: `${T.textMut}90` }}>{lat > 0 ? "+" : ""}{lat}°</div>
            ))}
          </div>
        )}
      </div>

      {/* ── Basin labels — unchanged ── */}
      {!loading && !error && (
        <div style={{ display: "flex", justifyContent: "space-around", padding: "8px 20px", borderTop: `1px solid ${T.border}` }}>
          {["Arabian Sea", "Bay of Bengal", "Central IO", "Southern IO"].map(name => (
            <span key={name} style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut }}>{name}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MHW CALENDAR — compact GitHub-style contribution graph
// ══════════════════════════════════════════════════════════════
function MHWCalendar() {
  const [days,    setDays]    = useState<HeatwaveDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [hovered, setHovered] = useState<HeatwaveDay | null>(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    fetch(`${API}/api/heatwaves/timeseries?days=730`)
      .then(r => r.ok ? r.json() : [])
      .then(d => setDays(Array.isArray(d) ? d : d.timeseries ?? []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  const CELL = 11, GAP = 2;
  const today = new Date();
  const start = new Date(today);
  start.setFullYear(today.getFullYear() - 2);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));

  const dayMap = new Map(days.map(d => [d.date, d]));
  const weeks: (HeatwaveDay | null)[][] = [];
  const cur = new Date(start);
  for (let w = 0; w < 105; w++) {
    const week: (HeatwaveDay | null)[] = [];
    for (let d = 0; d < 7; d++) {
      const key = cur.toISOString().slice(0, 10);
      week.push(cur <= today ? (dayMap.get(key) ?? { date: key, is_mhw: false, intensity: 0 }) : null);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
  }

  const monthLabels: { label: string; col: number }[] = [];
  weeks.forEach((week, wi) => {
    const first = week.find(d => d !== null);
    if (first) {
      const d = new Date(first.date);
      if (d.getDate() <= 7) monthLabels.push({ label: d.toLocaleString("default", { month: "short" }), col: wi });
    }
  });

  const cellColor = (cell: HeatwaveDay | null) => {
    if (!cell) return "transparent";
    if (!cell.is_mhw) return `${T.tealDim}40`;
    const i = Math.min(cell.intensity ?? 0, 5);
    if (i < 1) return "#7a4a00";
    if (i < 2) return "#c26000";
    if (i < 3.5) return T.orange;
    return T.red;
  };

  const totalMhwDays = days.filter(d => d.is_mhw).length;
  const activeDays   = days.filter(d => d.is_mhw && d.intensity > 3).length;

  return (
    <div style={{ background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>Heatwave Activity — 2 Year Record</div>
          <div style={{ display: "flex", gap: 20, marginTop: 6 }}>
            <div>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 20, fontWeight: 500, color: T.orange }}>{totalMhwDays}</span>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: T.textMut, marginLeft: 5 }}>MHW days</span>
            </div>
            <div>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 20, fontWeight: 500, color: T.red }}>{activeDays}</span>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: T.textMut, marginLeft: 5 }}>severe days</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {[
            { color: `${T.tealDim}40`, label: "Normal" },
            { color: "#7a4a00",  label: "Mild" },
            { color: T.orange,   label: "Moderate" },
            { color: T.red,      label: "Severe" },
          ].map(item => (
            <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, background: item.color, border: `1px solid rgba(255,255,255,0.05)` }} />
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut }}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
      {loading ? (
        <div style={{ height: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textMut }}>Loading calendar…</span>
        </div>
      ) : (
        <div style={{ overflowX: "auto", position: "relative" }}>
          <svg width={weeks.length * (CELL + GAP)} height={7 * (CELL + GAP) + 18} style={{ display: "block" }}>
            {monthLabels.map(m => (
              <text key={`${m.label}-${m.col}`} x={m.col * (CELL + GAP)} y={10} fontSize={8} fill={T.textMut} fontFamily="DM Mono">{m.label}</text>
            ))}
            {weeks.map((week, wi) =>
              week.map((cell, di) => cell ? (
                <rect key={`${wi}-${di}`}
                  x={wi * (CELL + GAP)} y={14 + di * (CELL + GAP)}
                  width={CELL} height={CELL} rx={2}
                  fill={cellColor(cell)}
                  stroke={cell.is_mhw ? "rgba(255,255,255,0.07)" : "transparent"} strokeWidth={0.5}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={e => {
                    setHovered(cell);
                    const rect = (e.target as SVGRectElement).getBoundingClientRect();
                    setTooltipPos({ x: rect.left, y: rect.top });
                  }}
                  onMouseLeave={() => setHovered(null)}
                />
              ) : null)
            )}
          </svg>
          {hovered && (
            <div style={{
              position: "fixed", left: tooltipPos.x + 14, top: tooltipPos.y - 8,
              background: T.bg, border: `1px solid ${T.borderAct}`, borderRadius: 8,
              padding: "8px 12px", fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textPri,
              zIndex: 100, pointerEvents: "none", whiteSpace: "nowrap",
              boxShadow: `0 4px 20px ${T.bgVoid}`,
            }}>
              <div style={{ color: T.textSec, marginBottom: 2 }}>{hovered.date}</div>
              {hovered.is_mhw
                ? <div style={{ color: T.orange }}>MHW · {hovered.intensity?.toFixed(2)}°C above threshold</div>
                : <div style={{ color: T.teal }}>Normal ocean conditions</div>
              }
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// ARGO FLOAT MAP — drop-in replacement for the ArgoMap function
// inside app/page.tsx. Only this function changed.
// ══════════════════════════════════════════════════════════════
function ArgoMap() {
  const mapRef         = useRef<HTMLDivElement>(null);
  const leafletRef     = useRef<any>(null);
  const markersRef     = useRef<any[]>([]);
  const initializingRef = useRef(false);   // ← blocks concurrent StrictMode calls

  const [profiles, setProfiles] = useState<ArgoProfile[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [colorBy,  setColorBy]  = useState<"sst" | "mld">("sst");

  // ── Fetch profiles once ──────────────────────────────────────
  useEffect(() => {
    fetch(`${API}/api/argo/profiles?per_page=200`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setProfiles(Array.isArray(d) ? d : d.profiles ?? []))
      .catch(() => setProfiles([]))
      .finally(() => setLoading(false));
  }, []);

  // ── Initialise Leaflet map ONCE ─────────────────────────────
  useEffect(() => {
    // initializingRef is set SYNCHRONOUSLY — blocks the second
    // StrictMode call even before the async import resolves.
    if (!mapRef.current || leafletRef.current || initializingRef.current) return;
    initializingRef.current = true;

    import("leaflet").then(L => {
      // Bail out if the component unmounted during the async import
      if (!mapRef.current || leafletRef.current) {
        initializingRef.current = false;
        return;
      }

      // Clear any stale Leaflet state left on the DOM node
      if ((mapRef.current as any)._leaflet_id) {
        delete (mapRef.current as any)._leaflet_id;
      }

      // Fix default icon paths broken by webpack
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl:       "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl:     "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      const map = L.map(mapRef.current!, {
        center:          [0, 72],
        zoom:            3,
        minZoom:         2,
        maxZoom:         8,
        zoomControl:     true,
        attributionControl: false,
        zoomAnimation:   false,
        fadeAnimation:   false,
        markerZoomAnimation: false,
      });

      // Dark ocean tile layer
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19 }
      ).addTo(map);

      // Subtle country outlines only
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png",
        { subdomains: "abcd", maxZoom: 19, opacity: 0.4 }
      ).addTo(map);

      leafletRef.current = { map, L };
    });

    return () => {
      initializingRef.current = false;   // ← reset so future remounts can re-init
      if (leafletRef.current) {
        leafletRef.current.map.remove();
        leafletRef.current = null;
      }
    };
  }, []);

  // ── Redraw markers whenever profiles or colorBy changes ─────
  useEffect(() => {
    if (!leafletRef.current || !profiles.length) return;
    const { map, L } = leafletRef.current;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const vals = profiles
      .map(p => colorBy === "sst" ? p.sst_argo : p.mld)
      .filter((v): v is number => v != null);
    const minV = vals.length ? Math.min(...vals) : 0;
    const maxV = vals.length ? Math.max(...vals) : 1;

    const dotColor = (p: ArgoProfile): string => {
      const v = colorBy === "sst" ? (p.sst_argo ?? 0) : (p.mld ?? 0);
      const t = maxV > minV ? (v - minV) / (maxV - minV) : 0.5;
      if (colorBy === "sst") {
        if (t > 0.75) return T.red;
        if (t > 0.55) return T.orange;
        if (t > 0.35) return T.amber;
        return T.blue;
      } else {
        if (t > 0.7) return T.blue;
        if (t > 0.4) return T.teal;
        return T.orange;
      }
    };

    profiles.forEach(p => {
      if (p.latitude == null || p.longitude == null) return;

      const col = dotColor(p);
      const marker = L.circleMarker([p.latitude, p.longitude], {
        radius:      5,
        fillColor:   col,
        color:       "#03080f",
        weight:      1,
        opacity:     1,
        fillOpacity: 0.88,
      });

      const lines: string[] = [
        `<div style="font-family:DM Mono,monospace;font-size:11px;color:#e8f4f8;min-width:160px">`,
        `<div style="font-size:10px;color:#3d6478;margin-bottom:6px">Float ${p.profile_id}</div>`,
        `<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px 10px">`,
        `<span style="color:#8ab4c8">Lat</span><span>${p.latitude.toFixed(2)}°</span>`,
        `<span style="color:#8ab4c8">Lon</span><span>${p.longitude.toFixed(2)}°E</span>`,
        p.sst_argo != null ? `<span style="color:#8ab4c8">SST</span><span style="color:${T.orange}">${p.sst_argo.toFixed(2)}°C</span>` : "",
        p.mld      != null ? `<span style="color:#8ab4c8">MLD</span><span style="color:${T.blue}">${p.mld.toFixed(0)} m</span>` : "",
        p.basin             ? `<span style="color:#8ab4c8">Basin</span><span style="color:${T.teal}">${p.basin}</span>` : "",
        `</div></div>`,
      ].join("");

      marker.bindPopup(lines, {
        className:   "argo-popup",
        maxWidth:    220,
        closeButton: false,
      });

      marker.addTo(map);
      markersRef.current.push(marker);
    });
  }, [profiles, colorBy]);

  return (
    <>
      {/* Leaflet CSS — loaded once globally */}
      <style>{`
        @import url("https://unpkg.com/leaflet@1.9.4/dist/leaflet.css");

        .leaflet-container {
          background: #03080f !important;
          font-family: DM Mono, monospace;
        }
        .leaflet-tile-pane { filter: brightness(0.92) saturate(0.7); }
        .leaflet-control-zoom {
          border: 1px solid rgba(0,212,186,0.20) !important;
          background: #081525 !important;
          border-radius: 8px !important;
          overflow: hidden;
        }
        .leaflet-control-zoom a {
          background: #081525 !important;
          color: #00d4ba !important;
          border-bottom: 1px solid rgba(0,212,186,0.15) !important;
          width: 28px !important; height: 28px !important;
          line-height: 28px !important;
          font-size: 16px !important;
        }
        .leaflet-control-zoom a:hover { background: rgba(0,212,186,0.12) !important; }
        .leaflet-popup-content-wrapper {
          background: #0b1e33 !important;
          border: 1px solid rgba(0,212,186,0.30) !important;
          border-radius: 10px !important;
          box-shadow: 0 4px 24px #03080f !important;
          padding: 0 !important;
        }
        .leaflet-popup-content { margin: 10px 14px !important; }
        .leaflet-popup-tip { background: #0b1e33 !important; }
        .argo-popup .leaflet-popup-close-button { display: none; }
      `}</style>

      <div style={{
        background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`,
        border: `1px solid ${T.border}`, borderRadius: 16, overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px 12px", display: "flex", justifyContent: "space-between",
          alignItems: "center", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 10,
        }}>
          <div>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 4 }}>
              Argo Float Network
            </div>
            <div style={{ fontSize: 13, color: T.textSec }}>
              {loading
                ? <span style={{ color: T.textMut, fontFamily: "DM Mono, monospace" }}>Loading…</span>
                : <><span style={{ color: T.teal, fontFamily: "DM Mono, monospace", fontSize: 15, fontWeight: 500 }}>{profiles.length}</span>{" "}autonomous floats · click a dot for profile data</>
              }
            </div>
          </div>
          {/* Color-by toggle */}
          <div style={{ display: "flex", gap: 6 }}>
            {(["sst", "mld"] as const).map(k => (
              <button key={k} onClick={() => setColorBy(k)} style={{
                padding: "5px 14px", borderRadius: 99, fontSize: 11, cursor: "pointer",
                border: `1px solid ${colorBy === k ? T.teal : T.border}`,
                background: colorBy === k ? `${T.teal}18` : "transparent",
                color: colorBy === k ? T.teal : T.textMut,
                fontFamily: "DM Mono, monospace", transition: "all 0.2s",
              }}>
                {k === "sst" ? "Color · SST" : "Color · MLD"}
              </button>
            ))}
          </div>
        </div>

        {/* Map container */}
        <div style={{ position: "relative" }}>
          {loading && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 10,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: 12, background: T.bgVoid,
            }}>
              <div style={{ width: 36, height: 36, border: `2px solid ${T.border}`, borderTop: `2px solid ${T.teal}`, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 11, color: T.textMut }}>Loading float positions…</span>
            </div>
          )}
          <div
            ref={mapRef}
            style={{ width: "100%", height: 360 }}
          />
        </div>

        {/* Legend */}
        <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          {(colorBy === "sst"
            ? [{ c: T.blue, l: "Cold SST" }, { c: T.amber, l: "Warm SST" }, { c: T.orange, l: "Very Warm" }, { c: T.red, l: "Hot SST" }]
            : [{ c: T.orange, l: "Shallow MLD" }, { c: T.teal, l: "Medium MLD" }, { c: T.blue, l: "Deep MLD" }]
          ).map(item => (
            <div key={item.l} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: item.c, border: `1px solid rgba(255,255,255,0.15)` }} />
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textSec }}>{item.l}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════
// INTENSITY TIMELINE — sparkline-style MHW intensity strip
// ══════════════════════════════════════════════════════════════
function IntensityTimeline() {
  const [days,    setDays]    = useState<HeatwaveDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/api/heatwaves/timeseries?days=365`)
      .then(r => r.ok ? r.json() : {})
      .then(d => setDays(Array.isArray(d) ? d : d.timeseries ?? []))
      .catch(() => setDays([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (!days.length) return null;

  const W = 700, H = 80;
  const mhwDays = days.filter(d => d.is_mhw);
  const maxInt  = Math.max(...mhwDays.map(d => d.intensity ?? 0), 1);
  const barW    = Math.max(1, W / days.length);

  return (
    <div style={{ background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`, border: `1px solid ${T.border}`, borderRadius: 16, padding: "16px 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em" }}>MHW Intensity — Last 12 Months</div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 16, fontWeight: 500, color: T.orange }}>{mhwDays.length}</div>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut }}>MHW days</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 16, fontWeight: 500, color: T.red }}>{maxInt.toFixed(1)}°C</div>
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9, color: T.textMut }}>peak intensity</div>
          </div>
        </div>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
        {days.map((d, i) => {
          if (!d.is_mhw) return <rect key={i} x={i * barW} y={0} width={Math.max(barW - 0.5, 0.5)} height={H} fill={`${T.teal}08`} />;
          const int  = d.intensity ?? 0;
          const barH = Math.max(4, (int / maxInt) * H);
          const col  = int > 3 ? T.red : int > 2 ? T.orange : int > 1 ? T.amber : "#7a4a00";
          return <rect key={i} x={i * barW} y={H - barH} width={Math.max(barW - 0.5, 0.5)} height={barH} fill={col} fillOpacity={0.85} rx={1} />;
        })}
        {[0, 3, 6, 9].map(month => {
          const x = Math.round((month / 12) * W);
          const d = new Date();
          d.setMonth(d.getMonth() - (12 - month));
          return (
            <g key={month}>
              <line x1={x} y1={0} x2={x} y2={H} stroke={`${T.textMut}30`} strokeWidth={0.5} strokeDasharray="3 3" />
              <text x={x + 3} y={10} fontSize={8} fill={`${T.textMut}80`} fontFamily="DM Mono">
                {d.toLocaleString("default", { month: "short" })}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// RECENT EVENTS TABLE
// ══════════════════════════════════════════════════════════════
function RecentEventsPanel({ rises, drops, profiles, confidence }: {
  rises: number; drops: number; profiles: number; confidence: number;
}) {
  const rows = [
    { icon: "↑", label: "Rapid temperature rises (30d)", value: rises,                             unit: "events", color: T.red,    alert: rises > 0 },
    { icon: "↓", label: "Rapid temperature drops (30d)", value: drops,                             unit: "events", color: T.blue,   alert: false },
    { icon: "◈", label: "Argo profiles collected",       value: profiles.toLocaleString(),         unit: "total",  color: T.teal,   alert: false },
    { icon: "◉", label: "Data reliability score",        value: `${Math.round(confidence * 100)}`, unit: "%",      color: confidence >= 0.8 ? T.teal : T.amber, alert: confidence < 0.5 },
  ];

  return (
    <div style={{ background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px", height: "100%" }}>
      <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 16 }}>Recent Events · 30 Days</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map(row => (
          <div key={row.label} style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            background: row.alert ? `${row.color}10` : `${T.bgVoid}80`,
            border: `1px solid ${row.alert ? `${row.color}30` : T.border}`,
            borderRadius: 10, padding: "10px 14px", transition: "background 0.2s",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "DM Mono, monospace", fontSize: 14, color: row.color, width: 16, textAlign: "center" }}>{row.icon}</span>
              <span style={{ fontSize: 12, color: T.textSec }}>{row.label}</span>
            </div>
            <div style={{ fontFamily: "DM Mono, monospace", textAlign: "right" }}>
              <span style={{ fontSize: 16, fontWeight: 500, color: row.color }}>{row.value}</span>
              <span style={{ fontSize: 10, color: T.textMut, marginLeft: 4 }}>{row.unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN DASHBOARD PAGE
// ══════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [data,    setData]    = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const t0   = Date.now();
    const tick = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    fetch(`${API}/api/dashboard/summary`)
      .then(r => { if (!r.ok) throw new Error("Could not load dashboard."); return r.json(); })
      .then(json => setData(json))
      .catch(err => setError(err.message))
      .finally(() => { setLoading(false); clearInterval(tick); });
    return () => clearInterval(tick);
  }, []);

  const mhw  = data?.mhw;
  const ci   = data?.climate_indices;
  const argo = data?.argo;
  const tr   = data?.trends;
  const rc   = data?.rapid_changes;

  const slopeDir = (v: number) => v > 0 ? `↑ +${v.toFixed(4)}` : `↓ ${v.toFixed(4)}`;

  return (
    <>
      {/* ── Page header ── */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>Indian Ocean Overview</h1>
          <p className="page-subtitle">Summary of ocean health, temperature anomalies, and climate conditions</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
         
          {mhw?.date && (
            <div style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: T.textMut, background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 99, padding: "6px 14px" }}>
              Updated {mhw.date}
            </div>
          )}
        </div>
      </div>

      <div className="page-body">
        {/* Error banner */}
        {error && (
          <div style={{ background: `${T.red}12`, border: `1px solid ${T.red}40`, borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ color: T.red, fontSize: 16 }}>!</span>
            <span style={{ fontSize: 13, color: T.textSec }}>{error}</span>
          </div>
        )}

        {/* MHW alert banner */}
        {!loading && mhw?.is_active && (
          <div style={{
            background: `${T.red}10`, border: `1px solid ${T.red}35`, borderLeft: `3px solid ${T.red}`,
            borderRadius: 12, padding: "14px 18px", marginBottom: 24, display: "flex", alignItems: "center", gap: 12,
          }}>
            <PulseRing active={true} />
            <div>
              <span style={{ fontWeight: 600, color: T.red, fontSize: 13 }}>Marine Heatwave Active — Category {mhw.category_label}</span>
              <span style={{ color: T.textSec, fontSize: 12, marginLeft: 10 }}>
                {mhw.coverage_pct.toFixed(1)}% of the Indian Ocean · {mhw.mean_intensity.toFixed(2)}°C above threshold
              </span>
            </div>
          </div>
        )}

        {/* Metric tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          <StatCard loading={loading} label="Heatwave Status" value={mhw?.is_active ? "Active" : "Normal"} sub={mhw?.date} accent={mhw?.is_active ? T.red : T.teal} glow={mhw?.is_active ? `0 0 24px ${T.red}30` : `0 0 24px ${T.teal}22`} />
          <StatCard loading={loading} label="Ocean Temperature Rise" value={mhw?.mean_intensity?.toFixed(2) ?? "—"} unit="°C above normal" sub={`Peak: +${mhw?.max_intensity?.toFixed(2) ?? "—"}°C`} accent={T.orange} />
          <StatCard loading={loading} label="Area Affected" value={mhw?.coverage_pct?.toFixed(1) ?? "—"} unit="%" sub="of Indian Ocean surface" accent={mhw?.is_active ? T.orange : T.teal} />
          <StatCard loading={loading} label="Mean Sea Surface Temp" value={argo?.mean_sst?.toFixed(2) ?? "—"} unit="°C" sub={tr ? slopeDir(tr.sst_slope) + " /yr trend" : undefined} accent={T.amber} />
          <StatCard loading={loading} label="Mixed Layer Depth" value={argo?.median_mld?.toFixed(0) ?? "—"} unit="dbar" sub="warm/cold water boundary" accent={T.blue} />
          <StatCard loading={loading} label="Ocean Heat Content" value={argo?.mean_ohc ? argo.mean_ohc.toExponential(2) : "—"} unit="J/m²" sub={tr ? `Trend: ${slopeDir(tr.ohc_slope).slice(0,12)}/yr` : undefined} accent={T.red} />
        </div>

        {/* Climate drivers + Recent events */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
          <div style={{ background: `linear-gradient(135deg, ${T.bg} 0%, ${T.bgDeep} 100%)`, border: `1px solid ${T.border}`, borderRadius: 16, padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.textMut, textTransform: "uppercase", letterSpacing: "0.14em" }}>Climate Drivers</div>
              <div style={{ fontFamily: "DM Mono, monospace", fontSize: 9.5, color: T.teal, background: `${T.teal}12`, border: `1px solid ${T.teal}30`, borderRadius: 99, padding: "3px 10px" }}>
                What shapes the ocean?
              </div>
            </div>
            {loading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[1,2,3].map(i => <div key={i} style={{ height: 68, borderRadius: 12, background: T.border, animation: "shimmer 1.6s ease-in-out infinite" }} />)}
              </div>
            ) : ci ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <ClimateGauge label="El Niño / La Niña (ENSO)" abbr="ENSO"      value={ci.enso} phase={ci.enso_phase} />
                <ClimateGauge label="Indian Ocean Dipole"       abbr="IOD · DMI" value={ci.dmi}  phase={ci.iod_phase} min={-1.5} max={1.5} />
                <ClimateGauge label="Pacific Decadal Oscillation" abbr="PDO"    value={ci.pdo}  phase={ci.pdo_phase} min={-5} max={5} />
                <p style={{ fontSize: 11, color: T.textMut, lineHeight: 1.6, marginTop: 4 }}>
                  These large-scale ocean–atmosphere patterns govern whether the Indian Ocean runs warmer or cooler than average.
                </p>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 16, padding: 18 }}>
              {[1,2,3,4].map(i => <div key={i} style={{ height: 44, borderRadius: 10, background: T.border, marginBottom: 8, animation: "shimmer 1.6s ease-in-out infinite" }} />)}
            </div>
          ) : (
            <RecentEventsPanel rises={rc?.sst_rises_30d ?? 0} drops={rc?.sst_drops_30d ?? 0} profiles={argo?.n_profiles ?? 0} confidence={argo?.mean_confidence ?? 0} />
          )}
        </div>

        {/* Intensity timeline */}
        <div style={{ marginBottom: 24 }}><IntensityTimeline /></div>

        {/* SST Heatmap */}
        <div style={{ marginBottom: "0.6rem" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: T.textPri }}>Temperature Snapshot</h2>
          <p style={{ fontSize: 13, color: T.textSec, marginTop: 3 }}>Latest SST anomaly field across the Indian Ocean basin</p>
        </div>
        <div style={{ marginBottom: 24 }}><SSTHeatmapCard /></div>

        {/* MHW Calendar */}
        <div style={{ marginBottom: "0.6rem" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: T.textPri }}>Heatwave History</h2>
          <p style={{ fontSize: 13, color: T.textSec, marginTop: 3 }}>Day-by-day record over the past 2 years</p>
        </div>
        <div style={{ marginBottom: 24 }}><MHWCalendar /></div>

        {/* Argo Float Map — now Leaflet */}
        <div style={{ marginBottom: "0.6rem" }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, color: T.textPri }}>Argo Float Network</h2>
          <p style={{ fontSize: 13, color: T.textSec, marginTop: 3 }}>Positions of autonomous floats — click a dot for profile data</p>
        </div>
        <div style={{ marginBottom: 24 }}><ArgoMap /></div>

        {/* Footer */}
        <div style={{ background: T.bgDeep, border: `1px solid ${T.border}`, borderRadius: 12, padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <p style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: T.textMut }}>
            Sources: NOAA OISST · CMEMS Argo · ERA5 Wind · CMEMS SLA · ENSO/IOD/PDO indices
          </p>
          <p style={{ fontFamily: "DM Mono, monospace", fontSize: 10, color: `${T.teal}60` }}>
            OceanPulse v1.1
          </p>
        </div>
      </div>
    </>
  );
}