import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Empty, PageHeader } from "@/components/kit";
import { SETTINGS } from "@/lib/nav";
import { Account } from "@/components/settings/account";
import { Cashflows } from "@/components/settings/cashflows";
import { Comments } from "@/components/settings/comments";
import { CustomStatistics } from "@/components/settings/custom-statistics";
import { ItemList } from "@/components/settings/item-list";
import { JournalSettings } from "@/components/settings/journal-settings";
import { Mentors } from "@/components/settings/mentors";
import { SessionCategories } from "@/components/settings/session-categories";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/settings/$section")({
  head: ({ params }) => {
    const label = SETTINGS.find(([s]) => s === params.section)?.[1] ?? "Settings";
    const title = `${label} Settings — EdgeWhiz`;
    const description = `Manage ${label.toLowerCase()} settings in EdgeWhiz.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
      ],
    };
  },
  beforeLoad: ({ params }) => {
    if (!SETTINGS.some(([s]) => s === params.section)) throw notFound();
  },
  notFoundComponent: () => <Empty>That settings page doesn't exist.</Empty>,
  component: SettingsPage,
});

const SETTINGS_GROUPS = [
  { label: "Account", keys: ["account", "sharing"] },
  { label: "Journal", keys: ["journal", "cashflows"] },
  {
    label: "Organization",
    keys: ["instruments", "setups", "comments", "rules", "sessions", "custom-statistics"],
  },
] as const;

function SettingsPage() {
  const { section } = Route.useParams();
  const label = SETTINGS.find(([key]) => key === section)?.[1] ?? "Settings";
  return (
    <div className="mx-auto max-w-[1320px] space-y-5 pb-8">
      <PageHeader
        title="Settings"
        subtitle="Keep account details, journal defaults and review tools organized in one place."
      />
      <div className="grid min-w-0 gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          aria-label="Settings sections"
          className="h-fit rounded-xl border border-border/70 bg-card p-2"
        >
          {SETTINGS_GROUPS.map((group) => (
            <div key={group.label} className="mb-3 last:mb-0">
              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </p>
              <div className="grid gap-0.5 sm:grid-cols-2 lg:grid-cols-1">
                {group.keys.map((key) => {
                  const setting = SETTINGS.find(([settingKey]) => settingKey === key);
                  if (!setting) return null;
                  const [settingKey, settingLabel] = setting;
                  const active = section === settingKey;
                  return (
                    <Link
                      key={settingKey}
                      to="/settings/$section"
                      params={{ section: settingKey }}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                        active && "bg-sidebar-accent font-medium text-foreground",
                      )}
                    >
                      {settingLabel}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
        <section className="min-w-0 rounded-xl border border-border/70 bg-card p-4 sm:p-6">
          <header className="mb-5 border-b border-border/70 pb-4">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-info">
              Settings section
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight">{label}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Adjust {label.toLowerCase()} preferences for this workspace.
            </p>
          </header>
          {section === "account" && <Account />}
          {section === "sharing" && <Mentors />}
          {section === "journal" && <JournalSettings />}
          {section === "cashflows" && <Cashflows />}
          {section === "instruments" && (
            <ItemList table="instruments" field="symbol" label="Instrument" />
          )}
          {section === "setups" && <ItemList table="setups" field="name" label="Setup" describe />}
          {section === "rules" && (
            <ItemList table="trading_rules" field="name" label="Rule" describe />
          )}
          {section === "comments" && <Comments />}
          {section === "sessions" && <SessionCategories />}
          {section === "custom-statistics" && <CustomStatistics />}
        </section>
      </div>
    </div>
  );
}

/* ------------------------------ shared bits ------------------------------ */
