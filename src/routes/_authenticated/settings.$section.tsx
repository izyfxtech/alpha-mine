import { createFileRoute, notFound } from "@tanstack/react-router";
import { Empty } from "@/components/kit";
import { SETTINGS } from "@/lib/nav";
import { Account } from "@/components/settings/account";
import { Cashflows } from "@/components/settings/cashflows";
import { Comments } from "@/components/settings/comments";
import { CustomStatistics } from "@/components/settings/custom-statistics";
import { ItemList } from "@/components/settings/item-list";
import { JournalSettings } from "@/components/settings/journal-settings";
import { SessionCategories } from "@/components/settings/session-categories";

export const Route = createFileRoute("/_authenticated/settings/$section")({
  head: ({ params }) => {
    const label = SETTINGS.find(([s]) => s === params.section)?.[1] ?? "Settings";
    const title = `${label} Settings — AlphaMine`;
    const description = `Manage ${label.toLowerCase()} settings in AlphaMine.`;
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

function SettingsPage() {
  const { section } = Route.useParams();
  return (
    <div>
      {section === "account" && <Account />}
      {section === "journal" && <JournalSettings />}
      {section === "cashflows" && <Cashflows />}
      {section === "instruments" && (
        <ItemList table="instruments" field="symbol" label="Instrument" />
      )}
      {section === "setups" && <ItemList table="setups" field="name" label="Setup" describe />}
      {section === "rules" && <ItemList table="trading_rules" field="name" label="Rule" describe />}
      {section === "comments" && <Comments />}
      {section === "sessions" && <SessionCategories />}
      {section === "custom-statistics" && <CustomStatistics />}
    </div>
  );
}

/* ------------------------------ shared bits ------------------------------ */
