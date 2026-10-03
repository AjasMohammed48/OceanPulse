"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface ChartPoint {
  year: number;
  observed: number | null;
  trend: number | null;
}

interface Props {
  variable: "SST" | "OHC" | "MLD";
}

const VAR_CONFIG = {
  SST: { key: "sst_anomaly", label: "SST Anomaly (°C)",    color: "#f97316", unit: "°C"  },
  OHC: { key: "ohc",         label: "OHC 700m",            color: "#0ea5e9", unit: " ZJ" },
  MLD: { key: "mld",         label: "Mixed Layer Depth (m)", color: "#a78bfa", unit: " m" },
};

function linearRegression(xs: number[], ys: number[]) {
  const n = xs.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;
  const ssXY  = xs.reduce((s, x, i) => s + (x - meanX) * (ys[i] - meanY), 0);
  const ssXX  = xs.reduce((s, x)    => s + (x - meanX) ** 2, 0);
  const ssYY  = ys.reduce((s, y)    => s + (y - meanY) ** 2, 0);
  const slope     = ssXX === 0 ? 0 : ssXY / ssXX;
  const intercept = meanY - slope * meanX;
  const r2        = ssYY === 0 ? 1 : (ssXY ** 2) / (ssXX * ssYY);
  return { slope, intercept, r2 };
}

export default function TrendRegression({ variable }: Props) {
  const [data, setData]       = useState<ChartPoint[]>([]);
  const [r2, setR2]           = useState<number | null>(null);
  const [slope, setSlope]     = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const cfg = VAR_CONFIG[variable];

  useEffect(() => {
    setLoading(true);
    setError(null);
    setData([]);

    fetch("http://localhost:8000/api/trends")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => {
        const yearly: Array<Record<string, any>> = json.yearly ?? [];

        const valid = yearly.filter(
          (d) => d.year != null && d[cfg.key] != null
        );

        if (valid.length === 0) {
          setError(`No ${variable} values found in trends data`);
          setLoading(false);
          return;
        }

        const xs = valid.map((_, i) => i);
        const ys = valid.map((d) => d[cfg.key] as number);
        const reg = linearRegression(xs, ys);

        const points: ChartPoint[] = valid.map((d, i) => ({
          year:     d.year,
          observed: Math.round(d[cfg.key] * 1000) / 1000,
          trend:    Math.round((reg.intercept + reg.slope * i) * 1000) / 1000,
        }));

        setData(points);
        setR2(reg.r2);
        setSlope(reg.slope);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [variable, cfg.key]);

  if (loading)
    return (
      <div style={{ color: "#94a3b8", padding: "48px", textAlign: "center" }}>
        Loading {variable} trend data…
      </div>
    );

  if (error || data.length === 0)
    return (
      <div style={{ color: "#64748b", padding: "48px", textAlign: "center" }}>
        {error ?? `No ${variable} data available`}
      </div>
    );

  const direction = (slope ?? 0) > 0 ? "↑ increasing" : "↓ decreasing";
  const dirColor  = (slope ?? 0) > 0 ? "#f97316" : "#0ea5e9";

  return (
    <div style={{ width: "100%" }}>
      {/* Stats row */}
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          { label: "R² (goodness of fit)", value: r2 != null ? r2.toFixed(4) : "—", color: r2 != null && r2 > 0.7 ? "#14b8a6" : "#94a3b8" },
          { label: "Trend direction",       value: direction,                          color: dirColor },
          { label: "Slope per year",        value: slope != null ? `${slope > 0 ? "+" : ""}${slope.toFixed(4)}${cfg.unit}` : "—", color: "#94a3b8" },
          { label: "Data points",           value: String(data.length),                color: "#94a3b8" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            background: "#081525", border: "1px solid #1e3a4a",
            borderRadius: 8, padding: "8px 14px", flex: 1, minWidth: 120,
          }}>
            <div style={{ fontSize: 10, color: "#475569", marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 14, fontWeight: 600, color, fontFamily: "monospace" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 24, left: 8, bottom: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e3a4a" />
            <XAxis
              dataKey="year"
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{ value: "Year", position: "insideBottom", offset: -4, fill: "#64748b", fontSize: 11 }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 11 }}
              label={{ value: cfg.label, angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10, dx: -4 }}
              width={60}
            />
            <Tooltip
              contentStyle={{ background: "#0d2535", border: "1px solid #1e3a4a", borderRadius: 8, color: "#e2e8f0" }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(v: any, name: string) => [
                typeof v === "number" ? `${v.toFixed(3)}${cfg.unit}` : v,
                name,
              ]}
            />
            <Legend wrapperStyle={{ color: "#94a3b8", fontSize: 12 }} />
            <Scatter
              dataKey="observed"
              name={`Observed ${variable}`}
              fill={cfg.color}
              fillOpacity={0.75}
              r={4}
            />
            <Line
              type="linear"
              dataKey="trend"
              name="Linear trend"
              stroke="#14b8a6"
              strokeWidth={2}
              dot={false}
              strokeDasharray="6 3"
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <p style={{ color: "#475569", fontSize: 11, marginTop: 8, textAlign: "center" }}>
        Dots = observed yearly values · Dashed line = fitted linear trend · R² closer to 1.0 = stronger trend signal
      </p>
    </div>
  );
}