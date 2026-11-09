import { lazy, Suspense, type ComponentProps, type CSSProperties } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { EquityChart as EquityChartImpl } from "@/components/charts/equity-chart";
import type { PnlBars as PnlBarsImpl } from "@/components/charts/pnl-bars";
import type { Spark as SparkImpl } from "@/components/charts/spark";

/**
 * The chart components, loaded on demand. The charting library is large, so it is fetched only when a page first draws a chart,
 * and until then the page shows a placeholder of the same size, so the figures and tables around it appear straight away.
 * Import charts from here, not from the files beside this one.
 */
export type { EquityPoint } from "@/components/charts/equity-chart";

const Placeholder = ({ style }: { style: CSSProperties }) => (
  <Skeleton className="w-full" style={style} />
);

const LazyEquityChart = lazy(() =>
  import("@/components/charts/equity-chart").then((m) => ({ default: m.EquityChart })),
);
export function EquityChart(props: ComponentProps<typeof EquityChartImpl>) {
  return (
    <Suspense fallback={<Placeholder style={{ height: props.height ?? 280 }} />}>
      <LazyEquityChart {...props} />
    </Suspense>
  );
}

const LazyPnlBars = lazy(() =>
  import("@/components/charts/pnl-bars").then((m) => ({ default: m.PnlBars })),
);
export function PnlBars(props: ComponentProps<typeof PnlBarsImpl>) {
  return (
    <Suspense fallback={<Placeholder style={{ height: props.height ?? 260 }} />}>
      <LazyPnlBars {...props} />
    </Suspense>
  );
}

const LazySpark = lazy(() =>
  import("@/components/charts/spark").then((m) => ({ default: m.Spark })),
);
export function Spark(props: ComponentProps<typeof SparkImpl>) {
  return (
    <Suspense
      fallback={<Placeholder style={{ height: props.height ?? 40, width: props.width ?? 90 }} />}
    >
      <LazySpark {...props} />
    </Suspense>
  );
}
