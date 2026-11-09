import { Area as RArea, AreaChart as RAreaChart } from "recharts";
import { useId } from "react";
import { ResponsiveContainer, YAxis } from "recharts";

/** Spark line for KPI widgets */
export function Spark({
  data,
  height = 40,
  width = 90,
  line,
}: {
  data: number[];
  height?: number;
  width?: number;
  line?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const pts = data.map((v, i) => ({ i, v }));
  return (
    <div style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RAreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={`k${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset={0} stopColor="var(--color-chart-1)" stopOpacity={0.45} />
              <stop offset={1} stopColor="var(--color-chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <RArea
            type="monotone"
            dataKey="v"
            stroke="var(--color-chart-1)"
            strokeWidth={1.5}
            fill={line ? "none" : `url(#k${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </RAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
