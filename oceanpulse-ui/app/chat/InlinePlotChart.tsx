// app/chat/InlinePlotChart.tsx
// ─────────────────────────────────────────────────────────────
// This file is imported dynamically (ssr: false) by chat/page.tsx.
// Keeping it in a separate file lets Next.js bundle all of Recharts
// together, which fixes the blank chart issue.
// ─────────────────────────────────────────────────────────────

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface PlotData {
  type: "line" | "bar";
  title: string;
  x_label: string;
  y_label: string;
  data: Array<{ x: string | number; y: number }>;
}

export default function InlinePlotChart({ plot }: { plot: PlotData }) {
  const chartData = plot.data.map((d) => ({ name: String(d.x), value: d.y }));

  const tickStyle = {
    fill: "var(--text-muted)",
    fontSize: 10,
    fontFamily: "var(--font-mono)",
  };

  const tooltipStyle = {
    background: "var(--ocean-mid)",
    border: "1px solid var(--border-active)",
    borderRadius: 8,
    color: "var(--text-primary)",
    fontFamily: "var(--font-mono)",
    fontSize: 11,
  };

  return (
    // IMPORTANT: The outer div MUST have an explicit pixel height.
    // ResponsiveContainer uses the parent height — "100%" alone
    // is not enough if the parent has no height set.
    <div style={{ width: "100%", height: 220 }}>
      <ResponsiveContainer width="100%" height="100%">
        {plot.type === "bar" ? (
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="name" tick={tickStyle} axisLine={{ stroke: "var(--border-subtle)" }} tickLine={false} />
            <YAxis
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              label={{ value: plot.y_label, angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 9 }}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Bar dataKey="value" fill="var(--teal-mid)" radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : (
          <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" />
            <XAxis dataKey="name" tick={tickStyle} axisLine={{ stroke: "var(--border-subtle)" }} tickLine={false} />
            <YAxis
              tick={tickStyle}
              axisLine={false}
              tickLine={false}
              label={{ value: plot.y_label, angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 9 }}
            />
            <Tooltip contentStyle={tooltipStyle} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--teal-bright)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: "var(--teal-bright)", stroke: "var(--ocean-void)", strokeWidth: 2 }}
            />
          </LineChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
