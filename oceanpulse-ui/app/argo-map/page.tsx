"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";

// ── Types ──────────────────────────────────────────────────────
interface ArgoProfile {
  profile_id: string;
  float_id: string;
  time: string;
  latitude: number;
  longitude: number;
  basin: string;
  sst_argo: number | null;
  mld: number | null;
  ohc_700m: number | null;
  confidence: number;
  sparse_flag: boolean;
  sst_seasonal_anom: number | null;
}

type ColorMode = "basin" | "sst" | "mld" | "ohc" | "confidence";

// ── Theme ──────────────────────────────────────────────────────
const T = {
  bg: "#03080f",
  bgCard: "#070f1a",
  bgPanel: "#0b1825",
  border: "#112233",
  borderGlow: "rgba(0,212,186,0.18)",
  teal: "#00d4ba",
  tealDim: "#00857a",
  red: "#ff4d6d",
  orange: "#ff8c42",
  amber: "#ffb347",
  blue: "#4db8ff",
  purple: "#a78bfa",
  green: "#4ade80",
  textPri: "#e8f4f8",
  textSec: "#8ab4c8",
  textMut: "#3d6478",
};

const BASINS: Record<string, string> = {
  "Arabian Sea": T.orange,
  "Bay of Bengal": T.blue,
  "Southern Indian Ocean": T.purple,
  "Equatorial Indian Ocean": T.green,
  "Indian Ocean": T.textSec,
};

// ── Colour helpers ─────────────────────────────────────────────
function sstColor(v: number): string {
  const t = Math.max(0, Math.min(1, (v - 20) / 16));
  if (t < 0.25) { const s = t / 0.25; return `rgb(${Math.round(30 + s * 20)},${Math.round(80 + s * 100)},${Math.round(220 - s * 20)})`; }
  if (t < 0.5)  { const s = (t - 0.25) / 0.25; return `rgb(${Math.round(50 + s * 150)},${Math.round(180 + s * 60)},${Math.round(200 - s * 140)})`; }
  if (t < 0.75) { const s = (t - 0.5) / 0.25; return `rgb(${Math.round(200 + s * 55)},${Math.round(240 - s * 150)},${Math.round(60 - s * 50)})`; }
  const s = (t - 0.75) / 0.25; return `rgb(255,${Math.round(90 - s * 80)},${Math.round(10 - s * 8)})`;
}
function mldColor(v: number): string {
  const t = Math.max(0, Math.min(1, v / 150));
  if (t < 0.4) { const s = t / 0.4; return `rgb(${Math.round(255 - s * 200)},${Math.round(180 - s * 30)},${Math.round(50 + s * 50)})`; }
  const s = (t - 0.4) / 0.6;
  return `rgb(${Math.round(55 - s * 25)},${Math.round(150 + s * 60)},${Math.round(100 + s * 155)})`;
}
function confColor(v: number): string {
  if (v >= 0.8) return T.teal;
  if (v >= 0.5) return T.amber;
  return T.red;
}
function getColor(p: ArgoProfile, mode: ColorMode): string {
  switch (mode) {
    case "basin":      return BASINS[p.basin] ?? T.textSec;
    case "sst":        return p.sst_argo  != null ? sstColor(p.sst_argo)                    : T.textMut;
    case "mld":        return p.mld       != null ? mldColor(p.mld)                          : T.textMut;
    case "ohc":        return p.ohc_700m  != null ? sstColor((p.ohc_700m / 1e9) * 0.5 + 25) : T.textMut;
    case "confidence": return confColor(p.confidence);
    default:           return T.teal;
  }
}

// ── Date helpers ───────────────────────────────────────────────
function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const DEFAULT_TO   = toDateStr(new Date());
const DEFAULT_FROM = toDateStr(new Date(Date.now() - 90 * 864e5));

// ── Dynamic Leaflet map (client-only) ──────────────────────────
const LeafletArgoMap = dynamic(() => import("./LeafletArgoMap"), {
  ssr: false,
  loading: () => (
    <div style={{
      height: 520,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "#03080f", borderRadius: 12,
      color: "#3d6478", fontFamily: "monospace", fontSize: 13,
    }}>
      Loading map…
    </div>
  ),
});

// ── Stat tile ──────────────────────────────────────────────────
function StatTile({ label, value, sub, color }: { label: string; value: string; sub: string; color?: string }) {
  return (
    <div style={{
      background: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "14px 18px",
    }}>
      <div style={{ fontSize: 11, color: T.textMut, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? T.textPri, fontFamily: "monospace" }}>{value}</div>
      <div style={{ fontSize: 11, color: T.textMut, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ── Profile detail panel ───────────────────────────────────────
function ProfilePanel({ p, onClose }: { p: ArgoProfile; onClose: () => void }) {
  const rows: [string, string][] = [
    ["Float ID",       p.float_id],
    ["Profile ID",     p.profile_id],
    ["Time",           new Date(p.time).toLocaleString()],
    ["Latitude",       `${p.latitude.toFixed(3)}°`],
    ["Longitude",      `${p.longitude.toFixed(3)}°E`],
    ["Basin",          p.basin],
    ["SST (Argo)",     p.sst_argo   != null ? `${p.sst_argo.toFixed(2)}°C`   : "—"],
    ["MLD",            p.mld        != null ? `${p.mld.toFixed(0)} m`         : "—"],
    ["OHC 700m",       p.ohc_700m   != null ? `${(p.ohc_700m / 1e9).toFixed(2)} GJ/m²` : "—"],
    ["Confidence",     `${(p.confidence * 100).toFixed(0)}%`],
    ["Sparse flag",    p.sparse_flag ? "Yes" : "No"],
    ["SST Seas. Anom", p.sst_seasonal_anom != null ? `${p.sst_seasonal_anom > 0 ? "+" : ""}${p.sst_seasonal_anom.toFixed(2)}°C` : "—"],
  ];
  return (
    <div style={{
      background: T.bgPanel, border: `1px solid ${T.borderGlow}`,
      borderRadius: 12, padding: "18px 20px", minWidth: 260,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: T.teal, fontFamily: "monospace", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Float Profile
        </span>
        <button onClick={onClose} style={{
          background: "none", border: "none", color: T.textMut,
          cursor: "pointer", fontSize: 16, lineHeight: 1,
        }}>✕</button>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 5 }}>
          <span style={{ fontSize: 11.5, color: T.textMut }}>{k}</span>
          <span style={{ fontSize: 11.5, color: T.textPri, fontFamily: "monospace", fontWeight: 600, textAlign: "right" }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────
function Tooltip({ p, x, y }: { p: ArgoProfile; x: number; y: number }) {
  return (
    <div style={{
      position: "fixed", left: x + 14, top: y - 10, zIndex: 9999,
      background: T.bgPanel, border: `1px solid ${T.borderGlow}`,
      borderRadius: 8, padding: "8px 12px", pointerEvents: "none",
      fontSize: 11.5, color: T.textPri, fontFamily: "monospace",
      boxShadow: "0 4px 20px rgba(0,0,0,0.6)",
    }}>
      <div style={{ color: T.teal, fontWeight: 700, marginBottom: 4 }}>{p.float_id}</div>
      <div style={{ color: T.textMut }}>{p.basin}</div>
      {p.sst_argo   != null && <div>SST: {p.sst_argo.toFixed(2)}°C</div>}
      {p.mld        != null && <div>MLD: {p.mld.toFixed(0)} m</div>}
      {p.confidence != null && <div>Conf: {(p.confidence * 100).toFixed(0)}%</div>}
    </div>
  );
}

// ── Legend ─────────────────────────────────────────────────────
function Legend({ mode }: { mode: ColorMode }) {
  if (mode === "basin") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
        {Object.entries(BASINS).map(([name, col]) => (
          <div key={name} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: col }} />
            <span style={{ fontSize: 11, color: T.textSec }}>{name}</span>
          </div>
        ))}
      </div>
    );
  }
  const labels: Record<ColorMode, [string, string, string]> = {
    sst:        ["20°C", "Sea Surface Temp",  "36°C"],
    mld:        ["0 m",  "Mixed Layer Depth", "150 m"],
    ohc:        ["Low",  "Ocean Heat Content", "High"],
    confidence: ["Low",  "Confidence",         "High"],
    basin:      ["", "", ""],
  };
  const [lo, , hi] = labels[mode];
  const stops =
    mode === "sst"        ? "rgb(30,100,220),rgb(50,200,160),rgb(255,200,20),rgb(255,10,2)" :
    mode === "mld"        ? "rgb(255,180,50),rgb(200,150,80),rgb(55,200,200)"               :
    mode === "confidence" ? "#ff4d6d,#ffb347,#00d4ba"                                       :
                            "rgb(30,100,220),rgb(50,200,160),rgb(255,200,20),rgb(255,10,2)";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span style={{ fontSize: 10, color: T.textMut, whiteSpace: "nowrap" }}>{lo}</span>
      <div style={{
        flex: 1, height: 10, borderRadius: 5,
        background: `linear-gradient(to right, ${stops})`,
        border: `1px solid ${T.border}`,
      }} />
      <span style={{ fontSize: 10, color: T.textMut, whiteSpace: "nowrap" }}>{hi}</span>
    </div>
  );
}

function ctrlBtn(active: boolean, color = T.teal) {
  return {
    padding: "5px 13px", borderRadius: 8, cursor: "pointer" as const,
    fontSize: 11, fontFamily: "monospace", transition: "all 0.15s",
    border: `1px solid ${active ? color : T.border}`,
    background: active ? `${color}18` : T.bgCard,
    color: active ? color : T.textMut,
  };
}

// ══════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════
export default function ArgoMapPage() {
  const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

  const [allProfiles,  setAllProfiles]  = useState<ArgoProfile[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [fetching,     setFetching]     = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const [colorMode,    setColorMode]    = useState<ColorMode>("basin");
  const [perPage,      setPerPage]      = useState(200);
  const [selected,     setSelected]     = useState<ArgoProfile | null>(null);
  const [tooltip,      setTooltip]      = useState<{ p: ArgoProfile; x: number; y: number } | null>(null);

  const [dateFrom,     setDateFrom]     = useState(DEFAULT_FROM);
  const [dateTo,       setDateTo]       = useState(DEFAULT_TO);
  const [selectedFloat, setSelectedFloat] = useState<string>("");
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [frameIdx,     setFrameIdx]     = useState(0);
  const [speed,        setSpeed]        = useState(500);
  const animRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchProfiles = useCallback(async (from: string, to: string, pp: number) => {
    setFetching(true);
    setError(null);
    setIsPlaying(false);
    setFrameIdx(0);
    setSelectedFloat("");
    try {
      const url = `${API}/api/argo/profiles?per_page=${pp}&date_from=${from}&date_to=${to}&sort=time_asc`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Server error ${r.status}`);
      const json = await r.json();
      const list: ArgoProfile[] = Array.isArray(json) ? json : json.profiles ?? json.data ?? [];
      list.sort((a, b) => a.time.localeCompare(b.time));
      setAllProfiles(list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setFetching(false);
      setLoading(false);
    }
  }, [API]);

  useEffect(() => { fetchProfiles(DEFAULT_FROM, DEFAULT_TO, perPage); }, []);

  const prevPerPage = useRef(perPage);
  useEffect(() => {
    if (prevPerPage.current !== perPage) {
      prevPerPage.current = perPage;
      fetchProfiles(dateFrom, dateTo, perPage);
    }
  }, [perPage]);

  // ── All unique days in the dataset ──────────────────────────
  const dayBuckets = useMemo(() => {
    return [...new Set(allProfiles.map(p => p.time.slice(0, 10)))].sort();
  }, [allProfiles]);

  const uniqueFloatIds = useMemo(() => {
    return [...new Set(allProfiles.map(p => p.float_id))].sort();
  }, [allProfiles]);

  // ── Current animation date ──────────────────────────────────
  const currentDate = dayBuckets[frameIdx] ?? (dayBuckets[dayBuckets.length - 1] ?? dateTo);

  // ── currentDayProfiles: ONE profile per float for the current day ──
  // This is what gets drawn as dots on the map.
  // Each float shows exactly where it IS on that day — so dots JUMP.
  const currentDayProfiles = useMemo(() => {
    if (dayBuckets.length === 0) return allProfiles;

    // Get all profiles up to and including the current day
    const upToCurrent = allProfiles.filter(p => p.time.slice(0, 10) <= currentDate);

    // For each float, keep only its MOST RECENT profile up to currentDate
    // This ensures one dot per float that moves forward in time
    const latestPerFloat = new Map<string, ArgoProfile>();
    for (const p of upToCurrent) {
      const existing = latestPerFloat.get(p.float_id);
      if (!existing || p.time > existing.time) {
        latestPerFloat.set(p.float_id, p);
      }
    }

    return Array.from(latestPerFloat.values());
  }, [allProfiles, currentDate, dayBuckets]);

  // ── allTrails: full path of each float up to current frame ──
  // Used to draw the trail line for the selected float.
  const allTrails = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number; time: string }[]>();

    // Build trail for selected float (or all if none selected)
    const floatsToTrack = selectedFloat
      ? allProfiles.filter(p => p.float_id === selectedFloat)
      : allProfiles;

    for (const p of floatsToTrack) {
      // Only include positions up to current frame date
      if (p.time.slice(0, 10) > currentDate) continue;
      if (!map.has(p.float_id)) map.set(p.float_id, []);
      map.get(p.float_id)!.push({ lat: p.latitude, lng: p.longitude, time: p.time });
    }

    // Sort each float's trail by time
    map.forEach(pts => pts.sort((a, b) => a.time.localeCompare(b.time)));

    return map;
  }, [allProfiles, currentDate, selectedFloat]);

  // ── prevDayProfiles: latest position per float on the PREVIOUS frame ──
  // Used to draw "moved from → to" arrows showing direction of travel.
  const prevDayProfiles = useMemo(() => {
    if (dayBuckets.length === 0 || frameIdx === 0) return undefined;
    const prevDate = dayBuckets[frameIdx - 1];
    if (!prevDate) return undefined;
    const upToPrev = allProfiles.filter(p => p.time.slice(0, 10) <= prevDate);
    const latestPerFloat = new Map<string, ArgoProfile>();
    for (const p of upToPrev) {
      const existing = latestPerFloat.get(p.float_id);
      if (!existing || p.time > existing.time) latestPerFloat.set(p.float_id, p);
    }
    return Array.from(latestPerFloat.values());
  }, [allProfiles, frameIdx, dayBuckets]);

  // ── profiles prop for the map ────────────────────────────────
  // Used to pre-build float color assignments (stable across frames)
  const stableProfiles = useMemo(() => allProfiles, [allProfiles]);

  // ── Animation loop ─────────────────────────────────────────
  useEffect(() => {
    if (isPlaying && dayBuckets.length > 1) {
      animRef.current = setInterval(() => {
        setFrameIdx(prev => {
          if (prev >= dayBuckets.length - 1) { setIsPlaying(false); return prev; }
          return prev + 1;
        });
      }, speed);
    } else {
      if (animRef.current) clearInterval(animRef.current);
    }
    return () => { if (animRef.current) clearInterval(animRef.current); };
  }, [isPlaying, speed, dayBuckets.length]);

  const animProgress = dayBuckets.length > 1 ? frameIdx / (dayBuckets.length - 1) : 0;

  // Stats based on what's currently visible
  const validSst = currentDayProfiles.filter(p => p.sst_argo != null);
  const validMld = currentDayProfiles.filter(p => p.mld      != null);
  const meanSst  = validSst.length ? validSst.reduce((s, p) => s + p.sst_argo!, 0) / validSst.length : 0;
  const meanMld  = validMld.length ? validMld.reduce((s, p) => s + p.mld!,      0) / validMld.length : 0;
  const meanConf = currentDayProfiles.length ? currentDayProfiles.reduce((s, p) => s + p.confidence, 0) / currentDayProfiles.length : 0;

  const COLOR_MODES: ColorMode[] = ["basin", "sst", "mld", "ohc", "confidence"];
  const handleHover    = useCallback((p: ArgoProfile | null, x: number, y: number) => { setTooltip(p ? { p, x, y } : null); }, []);
  const handleMapClick = useCallback(() => { setSelected(null); }, []);
  const showAnimation  = dayBuckets.length > 1;

  return (
    <>
      {/* ── Page header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Argo Float Map</h1>
          <p className="page-subtitle">Live positions and travel paths of autonomous underwater floats in the Indian Ocean</p>
        </div>
        <div style={{ display: "flex", gap: 8, alignSelf: "center" }}>
          {[100, 200, 500].map(n => (
            <button key={n} onClick={() => setPerPage(n)} style={{
              padding: "6px 14px", borderRadius: 8, cursor: "pointer",
              fontSize: 12, fontWeight: 600, fontFamily: "monospace",
              border: `1px solid ${perPage === n ? T.teal : T.border}`,
              background: perPage === n ? "rgba(0,212,186,0.1)" : T.bgCard,
              color: perPage === n ? T.teal : T.textMut,
              transition: "all 0.15s",
            }}>
              {n} floats
            </button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {error && (
          <div className="alert-banner" style={{ marginBottom: 20 }}>
            <span className="alert-banner-icon">⚠️</span>
            <span className="alert-banner-text">{error}</span>
          </div>
        )}

        {/* ── Stats row ── */}
        {!loading && currentDayProfiles.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatTile label="Floats visible"  value={currentDayProfiles.length.toLocaleString()} sub={`as of ${currentDate}`} />
            <StatTile label="Mean SST"        value={`${meanSst.toFixed(2)}°C`}                  sub="surface temp" />
            <StatTile label="Mean MLD"        value={`${meanMld.toFixed(0)} m`}                   sub="mixed layer depth" />
            <StatTile label="Mean confidence" value={`${(meanConf * 100).toFixed(0)}%`}           sub="data quality"
              color={meanConf >= 0.8 ? T.teal : meanConf >= 0.5 ? T.amber : T.red} />
            <StatTile label="Basins"          value={String(new Set(currentDayProfiles.map(p => p.basin)).size)} sub="ocean regions" />
          </div>
        )}

        {/* ── Map card ── */}
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <span className="card-title">Float Positions — Indian Ocean</span>
            <div style={{ display: "flex", gap: 4, background: "#081525", border: `1px solid ${T.border}`, borderRadius: 8, padding: 3 }}>
              {COLOR_MODES.map(m => (
                <button key={m} onClick={() => setColorMode(m)} style={{
                  background: colorMode === m ? "#0f2a44" : "transparent",
                  border: `1px solid ${colorMode === m ? T.borderGlow : "transparent"}`,
                  borderRadius: 6,
                  color: colorMode === m ? T.teal : T.textMut,
                  fontFamily: "monospace", fontSize: 10,
                  padding: "5px 10px", cursor: "pointer", transition: "all 0.15s",
                  textTransform: "capitalize",
                }}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="card-body">
            {/* ── Controls bar ── */}
            <div style={{
              display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12,
              padding: "10px 0 14px", borderBottom: `1px solid ${T.border}`, marginBottom: 14,
            }}>
              {/* Date pickers */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 10, color: T.textMut, fontFamily: "monospace" }}>FROM</span>
                <input type="date" value={dateFrom} max={dateTo}
                  onChange={e => setDateFrom(e.target.value)}
                  style={{
                    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7,
                    color: T.textPri, fontFamily: "monospace", fontSize: 11,
                    padding: "4px 8px", cursor: "pointer", outline: "none",
                  }}
                />
                <span style={{ fontSize: 10, color: T.textMut, fontFamily: "monospace" }}>TO</span>
                <input type="date" value={dateTo} min={dateFrom} max={toDateStr(new Date())}
                  onChange={e => setDateTo(e.target.value)}
                  style={{
                    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7,
                    color: T.textPri, fontFamily: "monospace", fontSize: 11,
                    padding: "4px 8px", cursor: "pointer", outline: "none",
                  }}
                />
                <button
                  onClick={() => fetchProfiles(dateFrom, dateTo, perPage)}
                  disabled={fetching}
                  style={{
                    ...ctrlBtn(false, T.teal),
                    border: `1px solid ${T.teal}`,
                    color: T.teal,
                    opacity: fetching ? 0.5 : 1,
                    cursor: fetching ? "not-allowed" : "pointer",
                  }}
                >
                  {fetching ? "Loading…" : "Apply"}
                </button>
              </div>

              {/* Quick presets */}
              <div style={{ display: "flex", gap: 5 }}>
                {[{ label: "7d", days: 7 }, { label: "30d", days: 30 }, { label: "90d", days: 90 }, { label: "1yr", days: 365 }].map(({ label, days }) => {
                  const f = toDateStr(new Date(Date.now() - days * 864e5));
                  const t = toDateStr(new Date());
                  const active = dateFrom === f && dateTo === t;
                  return (
                    <button key={label}
                      onClick={() => { setDateFrom(f); setDateTo(t); fetchProfiles(f, t, perPage); }}
                      style={ctrlBtn(active, T.tealDim)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Float selector */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 4 }}>
                <span style={{ fontSize: 10, color: T.textMut, fontFamily: "monospace" }}>FLOAT</span>
                <select
                  value={selectedFloat}
                  onChange={e => {
                    setSelectedFloat(e.target.value);
                    setIsPlaying(false);
                    setFrameIdx(0);
                  }}
                  style={{
                    background: T.bgCard, border: `1px solid ${selectedFloat ? T.borderGlow : T.border}`, borderRadius: 7,
                    color: selectedFloat ? T.teal : T.textPri, fontFamily: "monospace", fontSize: 11,
                    padding: "4px 10px", cursor: "pointer", outline: "none", minWidth: 150,
                  }}
                >
                  <option value="">All floats</option>
                  {uniqueFloatIds.map(fid => (
                    <option key={fid} value={fid}>Float {fid}</option>
                  ))}
                </select>
                {selectedFloat && (
                  <button onClick={() => { setSelectedFloat(""); setIsPlaying(false); setFrameIdx(0); }}
                    style={{ ...ctrlBtn(false), padding: "4px 10px", fontSize: 10 }}>
                    ✕ Clear
                  </button>
                )}
              </div>
            </div>

            {/* ── Animation controls ── */}
            {showAnimation && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
                padding: "10px 14px",
                background: isPlaying ? "rgba(0,212,186,0.04)" : T.bgCard,
                border: `1px solid ${isPlaying ? T.borderGlow : T.border}`,
                borderRadius: 10, marginBottom: 14,
                transition: "all 0.3s",
              }}>
                {/* Status badge */}
                <div style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "3px 10px", borderRadius: 6,
                  background: isPlaying ? "rgba(0,212,186,0.12)" : "rgba(61,100,120,0.2)",
                  border: `1px solid ${isPlaying ? T.teal : T.border}`,
                }}>
                  <div style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: isPlaying ? T.teal : T.textMut,
                    boxShadow: isPlaying ? `0 0 6px ${T.teal}` : "none",
                    animation: isPlaying ? "pulse-dot 1s ease-in-out infinite" : "none",
                  }} />
                  <style>{`@keyframes pulse-dot{0%,100%{opacity:1}50%{opacity:0.3}}`}</style>
                  <span style={{ fontSize: 10, fontFamily: "monospace", color: isPlaying ? T.teal : T.textMut }}>
                    {isPlaying ? "PLAYING" : "PAUSED"}
                  </span>
                </div>

                {/* Play/Pause */}
                <button
                  onClick={() => {
                    if (isPlaying) { setIsPlaying(false); }
                    else { if (frameIdx >= dayBuckets.length - 1) setFrameIdx(0); setIsPlaying(true); }
                  }}
                  style={{
                    width: 34, height: 34, borderRadius: "50%", cursor: "pointer",
                    border: `1px solid ${isPlaying ? T.amber : T.teal}`,
                    background: isPlaying ? `${T.amber}1a` : `${T.teal}1a`,
                    color: isPlaying ? T.amber : T.teal, fontSize: 14,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.15s",
                    boxShadow: isPlaying ? `0 0 12px ${T.amber}40` : `0 0 12px ${T.teal}30`,
                  }}
                >
                  {isPlaying ? "⏸" : "▶"}
                </button>

                {/* Reset */}
                <button
                  onClick={() => { setIsPlaying(false); setFrameIdx(0); }}
                  style={{
                    width: 30, height: 30, borderRadius: "50%", cursor: "pointer",
                    border: `1px solid ${T.border}`, background: T.bgCard,
                    color: T.textMut, fontSize: 13,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >⏮</button>

                {/* Speed */}
                <select
                  value={speed}
                  onChange={e => setSpeed(Number(e.target.value))}
                  style={{
                    background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: 7,
                    color: T.textSec, fontFamily: "monospace", fontSize: 10,
                    padding: "3px 6px", cursor: "pointer", outline: "none",
                  }}
                >
                  <option value={900}>Slow</option>
                  <option value={450}>Normal</option>
                  <option value={150}>Fast</option>
                  <option value={60}>Ultra</option>
                </select>

                {/* Scrubber + progress bar */}
                <div style={{ flex: 1, minWidth: 120, display: "flex", flexDirection: "column", gap: 3 }}>
                  <input
                    type="range" min={0} max={Math.max(dayBuckets.length - 1, 0)} value={frameIdx}
                    onChange={e => { setIsPlaying(false); setFrameIdx(Number(e.target.value)); }}
                    style={{ width: "100%", accentColor: T.teal, cursor: "pointer" }}
                  />
                  <div style={{ height: 2, background: T.border, borderRadius: 1 }}>
                    <div style={{
                      height: "100%", borderRadius: 1,
                      width: `${animProgress * 100}%`,
                      background: `linear-gradient(to right, ${T.tealDim}, ${T.teal})`,
                      transition: isPlaying ? "width 0.1s linear" : "none",
                    }} />
                  </div>
                </div>

                {/* Date display */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", minWidth: 90 }}>
                  <span style={{
                    fontFamily: "monospace", fontSize: 13, fontWeight: 700,
                    color: isPlaying ? T.teal : T.textSec,
                    textShadow: isPlaying ? `0 0 10px ${T.teal}60` : "none",
                    transition: "all 0.3s",
                  }}>
                    {currentDate}
                  </span>
                  <span style={{ fontSize: 9, color: T.textMut, fontFamily: "monospace" }}>
                    {frameIdx + 1} / {dayBuckets.length} days
                  </span>
                </div>

                {/* Float tracking badge */}
                {selectedFloat && (
                  <div style={{
                    marginLeft: "auto", fontSize: 10, color: T.teal, fontFamily: "monospace",
                    padding: "3px 10px", borderRadius: 6, background: "rgba(0,212,186,0.08)",
                    border: `1px solid rgba(0,212,186,0.2)`,
                  }}>
                    ↗ Tracking Float {selectedFloat}
                  </div>
                )}
              </div>
            )}

            {/* ── Map + sidebar ── */}
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ flex: 1, borderRadius: 12, overflow: "hidden", border: `1px solid ${T.border}` }}>
                {loading || fetching ? (
                  <div style={{
                    height: 520, display: "flex", flexDirection: "column",
                    alignItems: "center", justifyContent: "center", gap: 12,
                    background: T.bg, color: T.textMut, fontFamily: "monospace", fontSize: 13,
                  }}>
                    <div style={{
                      width: 32, height: 32, border: `2px solid ${T.border}`,
                      borderTop: `2px solid ${T.teal}`, borderRadius: "50%",
                      animation: "spin 0.8s linear infinite",
                    }} />
                    <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
                    {fetching ? "Fetching float positions…" : `Loading ${perPage} float profiles…`}
                  </div>
                ) : (
                  <LeafletArgoMap
                    profiles={stableProfiles}
                    mode={colorMode}
                    selected={selected}
                    onHover={handleHover}
                    onMapClick={handleMapClick}
                    allTrails={allTrails}
                    currentDayProfiles={currentDayProfiles}
                    prevDayProfiles={prevDayProfiles}
                    selectedFloat={selectedFloat}
                    isPlaying={isPlaying}
                  />
                )}
              </div>

              {selected && (
                <div style={{ width: 270, flexShrink: 0 }}>
                  <ProfilePanel p={selected} onClose={() => setSelected(null)} />
                </div>
              )}
            </div>

            {/* Legend */}
            {!loading && !fetching && currentDayProfiles.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <Legend mode={colorMode} />
              </div>
            )}
          </div>
        </div>

        {/* ── Basin breakdown table ── */}
        {!loading && !fetching && currentDayProfiles.length > 0 && (
          <div className="card">
            <div className="card-header">
              <span className="card-title">Basin Breakdown</span>
              <span className="badge badge-teal" style={{ fontSize: 9 }}>{currentDayProfiles.length} floats</span>
            </div>
            <div className="card-body">
              <table className="ocean-table">
                <thead>
                  <tr>
                    <th>Basin</th><th>Floats</th><th>Avg SST</th><th>Avg MLD</th><th>Avg Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(BASINS).map(basin => {
                    const bp = currentDayProfiles.filter(p => p.basin === basin);
                    if (bp.length === 0) return null;
                    const bSst = bp.filter(p => p.sst_argo != null);
                    const bMld = bp.filter(p => p.mld      != null);
                    return (
                      <tr key={basin}>
                        <td style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: BASINS[basin] }} />
                          <span style={{ color: T.textPri }}>{basin}</span>
                        </td>
                        <td>{bp.length}</td>
                        <td>{bSst.length ? `${(bSst.reduce((s, p) => s + p.sst_argo!, 0) / bSst.length).toFixed(2)}°C` : "—"}</td>
                        <td>{bMld.length ? `${(bMld.reduce((s, p) => s + p.mld!,     0) / bMld.length).toFixed(0)} m`  : "—"}</td>
                        <td>{`${(bp.reduce((s, p) => s + p.confidence, 0) / bp.length * 100).toFixed(0)}%`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {tooltip && <Tooltip p={tooltip.p} x={tooltip.x} y={tooltip.y} />}
    </>
  );
}