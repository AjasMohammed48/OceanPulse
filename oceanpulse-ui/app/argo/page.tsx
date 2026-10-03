"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import PageShell from "../components/PageShell";

// ─── Types ────────────────────────────────────────────────────
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

interface ArgoResponse {
  profiles: ArgoProfile[];
  total: number;
  page: number;
  per_page: number;
}

const BASINS = ["All Basins", "Arabian Sea", "Bay of Bengal", "Southern Indian Ocean", "Equatorial Indian Ocean", "Indian Ocean"];
const PER_PAGE = 20;

// ─── Helpers ──────────────────────────────────────────────────
function fmt(val: number | null, decimals = 2, suffix = "") {
  if (val == null || isNaN(val)) return "—";
  return `${val.toFixed(decimals)}${suffix}`;
}

function ConfidencePill({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 80 ? "var(--teal-bright)" : pct >= 60 ? "var(--heat-orange)" : "var(--heat-red)";
  return (
    <span style={{ fontSize: "0.7rem", fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: `${color}22`, color, border: `1px solid ${color}44` }}>
      {pct}%
    </span>
  );
}

function BasinBadge({ basin }: { basin: string }) {
  const colors: Record<string, string> = {
    "Arabian Sea": "var(--heat-orange)",
    "Bay of Bengal": "var(--cold-blue)",
    "Southern Indian Ocean": "var(--teal-bright)",
    "Equatorial Indian Ocean": "var(--teal-mid)",
    "Indian Ocean": "var(--text-secondary)",
  };
  const c = colors[basin] || "var(--text-muted)";
  return (
    <span style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: 99, background: `${c}18`, color: c, border: `1px solid ${c}30` }}>
      {basin}
    </span>
  );
}

// ─── Input style ──────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.48rem 0.75rem",
  borderRadius: 8,
  background: "rgba(255,255,255,0.05)",
  border: "1px solid var(--border-subtle)",
  color: "var(--text-primary)",
  fontSize: "0.82rem",
  outline: "none",
  fontFamily: "var(--font-display)",
};

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: "pointer",
};

// ─── Profile detail modal ─────────────────────────────────────
function ProfileModal({
  profile,
  onClose,
  onSendToChat,
}: {
  profile: ArgoProfile | null;
  onClose: () => void;
  onSendToChat: (p: ArgoProfile) => void;
}) {
  if (!profile) return null;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{ width: "100%", maxWidth: 540, maxHeight: "88vh", overflowY: "auto", padding: "1.5rem" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1.25rem" }}>
          <div>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", fontFamily: "var(--font-mono)" }}>
              Argo Float Profile
            </p>
            <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
              {profile.profile_id}
            </h3>
            <p style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: 3 }}>
              Float {profile.float_id} &nbsp;·&nbsp;{" "}
              {new Date(profile.time).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 8, color: "var(--text-muted)", cursor: "pointer", fontSize: "1rem", padding: "0.3rem 0.6rem" }}>✕</button>
        </div>

        {/* Location grid */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.65rem", marginBottom: "1rem" }}>
          {[
            { label: "Latitude",       value: `${profile.latitude.toFixed(4)}° N` },
            { label: "Longitude",      value: `${profile.longitude.toFixed(4)}° E` },
            { label: "Ocean Region",   value: profile.basin },
            { label: "Data Confidence",value: <ConfidencePill value={profile.confidence} /> },
          ].map((item) => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "0.65rem 0.8rem", border: "1px solid var(--border-subtle)" }}>
              <p style={{ fontSize: "0.65rem", color: "var(--text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "var(--font-mono)" }}>{item.label}</p>
              <p style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-primary)" }}>{item.value}</p>
            </div>
          ))}
        </div>

        {/* Measurements */}
        <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.6rem", fontFamily: "var(--font-mono)" }}>
          Ocean Measurements
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem", marginBottom: "1.25rem" }}>
          {[
            { label: "Sea Surface Temperature", value: fmt(profile.sst_argo, 2, " °C"), color: "var(--heat-red)" },
            { label: "Mixed Layer Depth",        value: fmt(profile.mld, 1, " m"),       color: "var(--cold-blue)" },
            { label: "Ocean Heat Content",       value: profile.ohc_700m != null ? `${(profile.ohc_700m / 1e8).toFixed(2)} ×10⁸ J/m²` : "—", color: "var(--heat-orange)" },
          ].map((m) => (
            <div key={m.label} style={{ textAlign: "center", background: "rgba(255,255,255,0.02)", borderRadius: 8, padding: "0.75rem 0.5rem", border: `1px solid ${m.color}25` }}>
              <p style={{ fontSize: "1rem", fontWeight: 700, color: m.color, marginBottom: 4 }}>{m.value}</p>
              <p style={{ fontSize: "0.62rem", color: "var(--text-muted)", lineHeight: 1.4 }}>{m.label}</p>
            </div>
          ))}
        </div>

        {/* Seasonal anomaly */}
        {profile.sst_seasonal_anom != null && (
          <div style={{ marginBottom: "1rem", padding: "0.65rem 0.9rem", borderRadius: 8, background: "rgba(0,212,186,0.06)", border: "1px solid var(--border-subtle)" }}>
            <p style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--teal-bright)" }}>Seasonal Temperature Anomaly: </strong>
              {profile.sst_seasonal_anom > 0 ? "+" : ""}{profile.sst_seasonal_anom.toFixed(3)} °C above the monthly average for this time of year
            </p>
          </div>
        )}

        {/* Sparse flag */}
        {profile.sparse_flag && (
          <div style={{ marginBottom: "1rem", padding: "0.65rem 0.9rem", borderRadius: 8, background: "rgba(255,140,66,0.08)", border: "1px solid rgba(255,140,66,0.25)" }}>
            <p style={{ fontSize: "0.73rem", color: "var(--heat-orange)", fontWeight: 600 }}>⚠ Sparse Data Flag</p>
            <p style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginTop: 3, lineHeight: 1.5 }}>
              This profile has fewer depth measurements than usual. Mixed layer depth and heat content values may be less accurate.
            </p>
          </div>
        )}

        {/* What is an Argo float */}
        <div style={{ marginBottom: "1.25rem", padding: "0.8rem 1rem", borderRadius: 8, background: "rgba(0,212,186,0.04)", border: "1px solid var(--border-subtle)" }}>
          <p style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.65 }}>
            <strong style={{ color: "var(--teal-mid)" }}>What is an Argo float? </strong>
            An Argo float is a small underwater robot, about the size of a fire extinguisher, that drifts through the ocean collecting temperature, saltiness, and pressure measurements as it rises and sinks. It sends its data by satellite each time it surfaces.
          </p>
        </div>

        {/* Send to Ocean Chat button */}
        <button
          onClick={() => onSendToChat(profile)}
          style={{
            width: "100%",
            padding: "0.65rem 1rem",
            borderRadius: 10,
            background: "linear-gradient(90deg, rgba(0,168,150,0.25), rgba(0,212,186,0.15))",
            border: "1px solid var(--border-active)",
            color: "var(--teal-bright)",
            fontWeight: 700,
            fontSize: "0.84rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            transition: "all 0.2s",
            fontFamily: "var(--font-display)",
          }}
        >
          <span>💬</span>
          Ask Ocean Chat about this float
        </button>
      </div>
    </div>
  );
}

// ─── Upload Panel ─────────────────────────────────────────────
function UploadPanel() {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setStatus("uploading");
    const form = new FormData();
    form.append("file", file);
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    try {
      const res = await fetch(`${API}/api/argo/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setStatus("success");
      setMessage(data.message || "Uploaded successfully.");
    } catch (err: any) {
      setStatus("error");
      setMessage(err.message || "Upload failed.");
    }
  };

  return (
    <div className="card" style={{ padding: "1.25rem", marginBottom: "1.5rem" }}>
      <p style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.25rem" }}>Upload a Profile File</p>
      <p style={{ fontSize: "0.77rem", color: "var(--text-muted)", marginBottom: "1rem", lineHeight: 1.55 }}>
        Upload your own Argo profile in NetCDF (.nc) or CSV format. OceanPulse will add it to the profile database.
      </p>
      <div
        className="upload-zone"
        style={{ cursor: "pointer", minHeight: 90, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: dragging ? "rgba(0,212,186,0.08)" : undefined }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) setFile(f); }}
        onClick={() => inputRef.current?.click()}
      >
        <input ref={inputRef} type="file" accept=".nc,.csv" style={{ display: "none" }} onChange={(e) => e.target.files?.[0] && setFile(e.target.files[0])} />
        <span style={{ fontSize: "1.4rem", marginBottom: "0.35rem" }}>📁</span>
        {file
          ? <p style={{ fontSize: "0.82rem", color: "var(--teal-bright)", fontWeight: 600 }}>{file.name}</p>
          : <p style={{ fontSize: "0.76rem", color: "var(--text-muted)", textAlign: "center" }}>Drag and drop a .nc or .csv file here, or click to browse</p>
        }
      </div>
      {file && status !== "success" && (
        <button onClick={handleUpload} disabled={status === "uploading"} style={{ marginTop: "0.75rem", width: "100%", padding: "0.55rem", borderRadius: 8, background: "var(--teal-mid)", border: "none", color: "var(--ocean-void)", fontWeight: 700, fontSize: "0.82rem", cursor: "pointer", fontFamily: "var(--font-display)" }}>
          {status === "uploading" ? "Uploading…" : "Upload Profile"}
        </button>
      )}
      {status === "success" && <div style={{ marginTop: "0.65rem", padding: "0.6rem 0.85rem", borderRadius: 8, background: "rgba(0,212,186,0.1)", border: "1px solid var(--border-active)", fontSize: "0.78rem", color: "var(--teal-bright)" }}>✓ {message}</div>}
      {status === "error"   && <div style={{ marginTop: "0.65rem", padding: "0.6rem 0.85rem", borderRadius: 8, background: "rgba(255,77,109,0.1)", border: "1px solid rgba(255,77,109,0.3)", fontSize: "0.78rem", color: "var(--heat-red)" }}>✕ {message}</div>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function ArgoPage() {
  const router = useRouter();

  const [data,     setData]     = useState<ArgoResponse | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [page,     setPage]     = useState(1);
  const [selected, setSelected] = useState<ArgoProfile | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  // Filters
  const [search,    setSearch]    = useState("");
  const [basin,     setBasin]     = useState("All Basins");
  const [sortBy,    setSortBy]    = useState("time_desc");
  const [dateFrom,  setDateFrom]  = useState("");
  const [dateTo,    setDateTo]    = useState("");
  const [searchLat, setSearchLat] = useState("");
  const [searchLon, setSearchLon] = useState("");
  const [radiusDeg, setRadiusDeg] = useState("2");

  const fetchProfiles = useCallback(async () => {
    setLoading(true);
    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const params = new URLSearchParams({
      page: String(page),
      per_page: String(PER_PAGE),
      sort: sortBy,
    });
    if (search.trim())   params.set("search", search.trim());
    if (basin !== "All Basins") params.set("basin", basin);
    if (dateFrom)        params.set("date_from", dateFrom);
    if (dateTo)          params.set("date_to", dateTo);
    if (searchLat.trim() && searchLon.trim()) {
      params.set("lat", searchLat.trim());
      params.set("lon", searchLon.trim());
      params.set("radius_deg", radiusDeg || "2");
    }

    try {
      const res = await fetch(`${API}/api/argo/profiles?${params}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Server error: ${res.status}`);
      }
      const d = await res.json();
      setData(d);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, basin, sortBy, dateFrom, dateTo, searchLat, searchLon, radiusDeg]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  // ── Send profile to Ocean Chat ─────────────────────────────
  const sendToChat = (p: ArgoProfile) => {
    const msg = encodeURIComponent(
      `Tell me about Argo float ${p.float_id} that collected data at latitude ${p.latitude.toFixed(3)}°, longitude ${p.longitude.toFixed(3)}° on ${p.time.slice(0, 10)} in the ${p.basin}. ` +
      `The sea surface temperature was ${p.sst_argo != null ? p.sst_argo.toFixed(2) + "°C" : "not recorded"}, ` +
      `the mixed layer depth was ${p.mld != null ? p.mld.toFixed(1) + " m" : "not recorded"}, ` +
      `and the ocean heat content in the top 700 metres was ${p.ohc_700m != null ? (p.ohc_700m / 1e8).toFixed(2) + " ×10⁸ J/m²" : "not recorded"}. ` +
      `What does this data tell us about ocean conditions in this area?`
    );
    router.push(`/chat?message=${msg}`);
  };

  const totalPages = data ? Math.ceil(data.total / PER_PAGE) : 1;

  return (
    <>
      <title>Find Argo Float Profiles</title>

      {/* ── Explainer banner ───────────────────────────────── */}
      <div className="card" style={{
        background: "linear-gradient(135deg, rgba(0,168,150,0.08), rgba(0,212,186,0.04))",
        border: "1px solid var(--border-active)",
        marginBottom: "1.5rem",
        padding: "1rem 1.25rem",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem",
      }}>
        <p style={{ fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7, maxWidth: 640 }}>
          Argo floats are underwater robots that drift through the Indian Ocean measuring temperature, saltiness, and pressure.
          Each time one surfaces, it sends back a snapshot of ocean conditions.
          Search by location, date, or ocean region — then click any profile to explore the data or ask the AI assistant about it.
        </p>
        <button
          onClick={() => setShowUpload(v => !v)}
          style={{ padding: "0.45rem 1rem", borderRadius: 8, background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-subtle)", color: "var(--text-secondary)", fontSize: "0.8rem", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-display)" }}
        >
          {showUpload ? "Hide Upload" : "⬆ Upload a Profile File"}
        </button>
      </div>

      {showUpload && <UploadPanel />}

      {/* ── Filter row 1: text + basin + sort ──────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Search by Float ID</p>
          <input type="text" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="e.g. 1902204" style={inputStyle} />
        </div>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Ocean Region</p>
          <select value={basin} onChange={(e) => { setBasin(e.target.value); setPage(1); }} style={selectStyle}>
            {BASINS.map(b => <option key={b} value={b} style={{ background: "var(--ocean-mid)" }}>{b}</option>)}
          </select>
        </div>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Sort By</p>
          <select value={sortBy} onChange={(e) => { setSortBy(e.target.value); setPage(1); }} style={selectStyle}>
            <option value="time_desc" style={{ background: "var(--ocean-mid)" }}>Newest first</option>
            <option value="time_asc"  style={{ background: "var(--ocean-mid)" }}>Oldest first</option>
            <option value="sst_desc"  style={{ background: "var(--ocean-mid)" }}>Hottest temperature first</option>
            <option value="confidence_desc" style={{ background: "var(--ocean-mid)" }}>Most reliable data first</option>
          </select>
        </div>
      </div>

      {/* ── Filter row 2: date range + lat/lon ─────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Date From</p>
          <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} style={inputStyle} />
        </div>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Date To</p>
          <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} style={inputStyle} />
        </div>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Latitude (°N)</p>
          <input type="number" value={searchLat} onChange={(e) => { setSearchLat(e.target.value); setPage(1); }} placeholder="-40 to 30" style={inputStyle} min={-40} max={30} step={0.1} />
        </div>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Longitude (°E)</p>
          <input type="number" value={searchLon} onChange={(e) => { setSearchLon(e.target.value); setPage(1); }} placeholder="20 to 120" style={inputStyle} min={20} max={120} step={0.1} />
        </div>
        <div>
          <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", marginBottom: "0.28rem", fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Search Radius (°)</p>
          <input type="number" value={radiusDeg} onChange={(e) => { setRadiusDeg(e.target.value); setPage(1); }} placeholder="2" style={inputStyle} min={0.5} max={20} step={0.5} />
        </div>
      </div>

      {/* Active location filter indicator */}
      {searchLat && searchLon && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", padding: "0.3rem 0.75rem", borderRadius: 99, background: "rgba(0,212,186,0.1)", border: "1px solid var(--border-active)", fontSize: "0.75rem", color: "var(--teal-bright)" }}>
          📍 Searching near {parseFloat(searchLat).toFixed(2)}°N, {parseFloat(searchLon).toFixed(2)}°E within {radiusDeg}°
          <button onClick={() => { setSearchLat(""); setSearchLon(""); }} style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: "0.8rem", padding: 0 }}>✕</button>
        </div>
      )}

      {/* Results count */}
      {data && !loading && (
        <p style={{ fontSize: "0.73rem", color: "var(--text-muted)", marginBottom: "0.75rem", fontFamily: "var(--font-mono)" }}>
          {data.total === 0 ? "No profiles found" : `Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, data.total)} of ${data.total.toLocaleString()} profiles`}
        </p>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginBottom: "1rem", padding: "0.75rem 1rem", borderRadius: 10, background: "rgba(255,77,109,0.08)", border: "1px solid rgba(255,77,109,0.25)", fontSize: "0.8rem", color: "var(--heat-red)" }}>
          ⚠ Could not load profiles: {error}
        </div>
      )}

      {/* ── Profile table ──────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: "1.25rem" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                {["Float ID", "Date", "Ocean Region", "Latitude", "Longitude", "Sea Surface Temp.", "Mixed Layer Depth", "Confidence", ""].map(h => (
                  <th key={h} style={{ padding: "0.7rem 1rem", textAlign: "left", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap", background: "rgba(255,255,255,0.015)", fontFamily: "var(--font-mono)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} style={{ padding: "0.75rem 1rem" }}>
                        <div style={{ height: 13, borderRadius: 4, background: "rgba(255,255,255,0.06)", width: "75%", animation: "pulse-dot 1.5s ease infinite" }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : data?.profiles.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    No profiles match your filters. Try expanding the search radius or changing the date range.
                  </td>
                </tr>
              ) : (
                data?.profiles.map((p) => (
                  <tr
                    key={p.profile_id}
                    style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", cursor: "pointer", transition: "background 0.12s" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(0,212,186,0.04)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                  >
                    <td style={{ padding: "0.65rem 1rem", color: "var(--teal-mid)", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>{p.float_id}</td>
                    <td style={{ padding: "0.65rem 1rem", color: "var(--text-secondary)", whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                      {new Date(p.time).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </td>
                    <td style={{ padding: "0.65rem 1rem" }}><BasinBadge basin={p.basin} /></td>
                    <td style={{ padding: "0.65rem 1rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.76rem" }}>{p.latitude.toFixed(3)}°</td>
                    <td style={{ padding: "0.65rem 1rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: "0.76rem" }}>{p.longitude.toFixed(3)}°</td>
                    <td style={{ padding: "0.65rem 1rem", color: p.sst_argo != null && p.sst_argo > 29 ? "var(--heat-red)" : "var(--text-primary)", fontWeight: 600, fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>
                      {fmt(p.sst_argo, 2, " °C")}
                    </td>
                    <td style={{ padding: "0.65rem 1rem", color: "var(--text-primary)", fontFamily: "var(--font-mono)", fontSize: "0.78rem" }}>{fmt(p.mld, 1, " m")}</td>
                    <td style={{ padding: "0.65rem 1rem" }}><ConfidencePill value={p.confidence} /></td>
                    <td style={{ padding: "0.65rem 1rem" }}>
                      <button
                        onClick={() => setSelected(p)}
                        style={{ padding: "0.28rem 0.7rem", fontSize: "0.72rem", fontWeight: 600, borderRadius: 6, border: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap", fontFamily: "var(--font-display)" }}
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", justifyContent: "center", marginBottom: "1.5rem" }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "0.35rem 0.9rem", borderRadius: 7, border: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", cursor: page === 1 ? "not-allowed" : "pointer", fontSize: "0.78rem", opacity: page === 1 ? 0.4 : 1, fontFamily: "var(--font-display)" }}>← Previous</button>
          <span style={{ fontSize: "0.76rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>Page {page} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={{ padding: "0.35rem 0.9rem", borderRadius: 7, border: "1px solid var(--border-subtle)", background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", cursor: page === totalPages ? "not-allowed" : "pointer", fontSize: "0.78rem", opacity: page === totalPages ? 0.4 : 1, fontFamily: "var(--font-display)" }}>Next →</button>
        </div>
      )}

      {/* Profile modal */}
      <ProfileModal profile={selected} onClose={() => setSelected(null)} onSendToChat={(p) => { setSelected(null); sendToChat(p); }} />

    </>
  );
}