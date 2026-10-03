"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ChartPoint {
  year: number;
  ohc: number | null;
  anomaly: number | null;
}

export default function OHCDecomposition() {
  const [data, setData] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("http://localhost:8000/api/trends")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const yearly: Array<{ year: number; ohc: number | null }> = json.yearly ?? [];
        const valid = yearly.filter((d) => d.ohc != null);
        if (valid.length === 0) {
          setError("No OHC values in trends data — run compute_profile_uncertainty() first");
          setLoading(false);
          return;
        }

        // Compute a linear baseline so we can show the anomaly overlay
        const n = valid.length;
        const xs = valid.map((_, i) => i);
        const ys = valid.map((d) => d.ohc as number);
        const meanX = xs.reduce((a, b) => a + b, 0) / n;
        const meanY = ys.reduce((a, b) => a + b, 0) / n;
        const slope =
          xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0) /
          xs.reduce((s, x) => s + (x - meanX) ** 2, 0);
        const intercept = meanY - slope * meanX;

        const points: ChartPoint[] = valid.map((d, i) => {
          const baseline = intercept + slope * i;
          return {
            year: d.year,
            ohc: Math.round((d.ohc as number) * 100) / 100,
            anomaly: Math.round(((d.ohc as number) - baseline) * 1000) / 1000,
          };
        });

        setData(points);
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
        Loading OHC data…
      </div>
    );
  if (error || data.length === 0)
    return (
      <div style={{ color: "#64748b", padding: "48px", textAlign: "center" }}>
        {error ?? "No OHC data available"}
      </div>
    );

  return (
    <div style={{ width: "100%", height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 40, left: 8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4a" />
          <XAxis dataKey="year" tick={{ fill: "#64748b", fontSize: 11 }} />
          <YAxis
            yAxisId="left"
            tick={{ fill: "#64748b", fontSize: 11 }}
            label={{ value: "OHC 700m (ZJ)", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: "#64748b", fontSize: 11 }}
            label={{ value: "Anomaly (ZJ)", angle: 90, position: "insideRight", fill: "#64748b", fontSize: 10 }}
          />
          <Tooltip
            contentStyle={{ background: "#0d2535", border: "1px solid #1e3a4a", borderRadius: 8, color: "#e2e8f0" }}
            labelStyle={{ color: "#94a3b8" }}
            formatter={(v: any, name: string) => [typeof v === "number" ? v.toFixed(3) : v, name]}
          />
          <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="ohc"
            name="Raw OHC"
            fill="#0e4f6e"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={{ r: 3, fill: "#0ea5e9" }}
            fillOpacity={0.25}
            connectNulls
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="anomaly"
            name="Baseline Anomaly"
            stroke="#a78bfa"
            strokeWidth={1.5}
            dot={false}
            strokeDasharray="5 3"
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
