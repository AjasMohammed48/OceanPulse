// app/heatwaves/HeatwaveCharts.tsx
// Imported dynamically (ssr:false) by heatwaves/page.tsx

import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";

interface YearlySummary {
  year: number;
  count: number;
  avg_duration: number;
}

const TICK = { fill: "#3d6478", fontSize: 10, fontFamily: "'DM Mono', monospace" };
const TIP  = { backgroundColor: "#0b1e33", border: "1px solid rgba(0,212,186,0.30)", borderRadius: 8, color: "#e8f4f8", fontFamily: "'DM Mono', monospace", fontSize: 11 };
const GRID = { stroke: "rgba(0,212,186,0.08)", strokeDasharray: "3 3" };

export default function HeatwaveCharts({
  data,
  chartType,
}: {
  data: YearlySummary[];
  chartType: "bar" | "line";
}) {
  if (chartType === "bar") {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
          <CartesianGrid {...GRID} />
          <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
          <YAxis tick={TICK} axisLine={false} tickLine={false} />
          <Tooltip contentStyle={TIP} />
          <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.count > 5 ? "#ff4d6d" : entry.count > 3 ? "#ff8c42" : "#00a896"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid {...GRID} />
        <XAxis dataKey="year" tick={TICK} axisLine={false} tickLine={false} />
        <YAxis tick={TICK} axisLine={false} tickLine={false} unit="d" />
        <Tooltip contentStyle={TIP} />
        <Line
          type="monotone"
          dataKey="avg_duration"
          name="Avg duration (days)"
          stroke="#ff8c42"
          strokeWidth={2.5}
          dot={false}
          activeDot={{ r: 5, fill: "#ff8c42", stroke: "#03080f", strokeWidth: 2 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
