import { createFileRoute, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { parseISO, startOfMonth } from "date-fns";
import { CHARTS } from "@/lib/nav";
import { ReportsWorkspace, type ReportsView } from "@/components/reports/ReportsWorkspace";

export type ReportsSearch = {
  view?: ReportsView;
  chart?: string;
  month?: string;
  year?: number;
};

const validViews: ReportsView[] = ["overview", "breakdown", "equity", "calendar", "chart-lab"];
const defaultReportMonth = startOfMonth(new Date());

export const Route = createFileRoute("/_authenticated/reports")({
  validateSearch: (search: Record<string, unknown>): ReportsSearch => {
    const chart = CHARTS.some(([slug]) => slug === search.chart) ? String(search.chart) : "compare";
    const year = Number(search.year);
    return {
      view: validViews.includes(search.view as ReportsView)
        ? (search.view as ReportsView)
        : "overview",
      chart,
      month:
        typeof search.month === "string" && /^\d{4}-\d{2}$/.test(search.month)
          ? search.month
          : undefined,
      year: Number.isInteger(year) && year > 1900 && year < 3000 ? year : undefined,
    };
  },
  head: () => ({
    meta: [
      { title: "Reports — EdgeWhiz" },
      {
        name: "description",
        content: "Review journal performance, trade breakdowns and Chart Lab reports.",
      },
      { property: "og:title", content: "Reports — EdgeWhiz" },
      {
        property: "og:description",
        content: "Review journal performance, trade breakdowns and Chart Lab reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReportsRoute,
});

function ReportsRoute() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const view = search.view ?? "overview";
  const chart = search.chart ?? "compare";
  const month = search.month
    ? startOfMonth(parseISO(`${search.month}-02T12:00:00`))
    : search.year
      ? startOfMonth(parseISO(`${search.year}-01-02T12:00:00`))
      : defaultReportMonth;
  const base = { chart, month: search.month, year: search.year };

  if (pathname.replace(/\/$/, "") !== "/reports") return <Outlet />;

  return (
    <ReportsWorkspace
      view={view}
      chart={chart}
      month={month}
      onViewChange={(nextView) => {
        void navigate({
          to: "/reports",
          search: { ...base, view: nextView },
        } as never);
      }}
      onChartChange={(nextChart) => {
        void navigate({
          to: "/reports",
          search: { ...base, view: "chart-lab", chart: nextChart },
        } as never);
      }}
      onMonthChange={(nextMonth) => {
        void navigate({
          to: "/reports",
          search: {
            ...base,
            view: "calendar",
            month: `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`,
            year: undefined,
          },
        } as never);
      }}
    />
  );
}
