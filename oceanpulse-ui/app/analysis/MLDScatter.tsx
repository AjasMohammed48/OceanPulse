"use client";

import { useEffect, useState } from "react";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface FloatProfile {
  sst: number;
  mld: number;
  float_id: string;
  time: string;
  basin: string;
}

const BASIN_COLORS: Record<string, string> = {
  "Arabian Sea": "#f97316",
  "Bay of Bengal": "#0ea5e9",
  "Southern Indian Ocean": "#14b8a6",
  "Equatorial Indian Ocean": "#a78bfa",
  "Indian Ocean": "#64748b",
};

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  return (
    <div
      style={{
        background: "#0d2535",
        border: "1px solid #1e3a4a",
        borderRadius: 8,
        padding: "8px 12px",
        color: "#e2e8f0",
        fontSize: 12,
      }}
    >
      <div>SST: <strong>{d?.sst?.toFixed(2)}°C</strong></div>
      <div>MLD: <strong>{d?.mld?.toFixed(1)} m</strong></div>
      <div style={{ color: "#64748b" }}>{d?.basin}</div>
      <div style={{ color: "#64748b" }}>{d?.time?.slice(0, 10)}</div>
    </div>
  );
};

export default function MLDScatter() {
  const [byBasin, setByBasin] = useState<Record<string, FloatProfile[]>>({});
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch up to 100 profiles — your API uses sst_argo and mld field names
    fetch("http://localhost:8000/api/argo/profiles?per_page=100&sort=time_desc")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        // Real API returns: {profiles: [{sst_argo, mld, ohc_700m, float_id, time, basin, ...}]}
        const raw: Array<Record<string, any>> = json.profiles ?? [];
        const valid = raw.filter(
          (p) => p.sst_argo != null && p.mld != null
        );

        // Remap to chart-friendly shape
        const mapped: FloatProfile[] = valid.map((p) => ({
          sst: p.sst_argo,
          mld: p.mld,
          float_id: p.float_id,
          time: p.time,
          basin: p.basin ?? "Indian Ocean",
        }));

        // Group by basin for multi-series scatter
        const grouped: Record<string, FloatProfile[]> = {};
        for (const p of mapped) {
          if (!grouped[p.basin]) grouped[p.basin] = [];
          grouped[p.basin].push(p);
        }

        setByBasin(grouped);
        setTotal(mapped.length);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  if (loading)
    return (
      <div style={{ color: "#94a3b8", padding: "48px", textAlign: "center" }}>
        Loading Argo profiles…
      </div>
    );
  if (error || total === 0)
    return (
      <div style={{ color: "#64748b", padding: "48px", textAlign: "center" }}>
        {error
          ? `Failed to load: ${error}`
          : "No profiles with both SST and MLD — run compute_profile_uncertainty() first"}
      </div>
    );

  const basins = Object.keys(byBasin);

  return (
    <div style={{ width: "100%" }}>
      {/* Basin legend */}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        {basins.map((b) => (
          <span key={b} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "#94a3b8" }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: BASIN_COLORS[b] ?? "#64748b",
                display: "inline-block",
              }}
            />
            {b} ({byBasin[b].length})
          </span>
        ))}
      </div>

      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 24, left: 8, bottom: 24 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4a" />
            <XAxis
              dataKey="sst"
              type="number"
              name="SST"
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{ value: "Sea Surface Temperature (°C)", position: "insideBottom", offset: -12, fill: "#64748b", fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <YAxis
              dataKey="mld"
              type="number"
              name="MLD"
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{ value: "Mixed Layer Depth (m)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 11 }}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />
            {basins.map((basin) => (
              <Scatter
                key={basin}
                name={basin}
                data={byBasin[basin]}
                fill={BASIN_COLORS[basin] ?? "#64748b"}
                fillOpacity={0.75}
                r={4}
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p style={{ color: "#475569", fontSize: 11, marginTop: 6, textAlign: "center" }}>
        {total} profiles · Warmer SST → shallower MLD → strong stratification
      </p>
    </div>
  );
}
