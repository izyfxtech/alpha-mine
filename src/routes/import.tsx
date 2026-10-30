import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, FileArrowDown, Table, PencilSimpleLine } from "@phosphor-icons/react";
import { CtaBand, PageHero, Section, SiteLayout } from "@/components/marketing/site";
import { Rv } from "@/components/marketing/marketing-shell";

const DESC = "Bring your history into AlphaMine from MetaTrader 5 reports, CSV or Excel files, or log trades by hand.";
const methods = [
  { icon: FileArrowDown, t: "MetaTrader 4 and 5 reports", d: "Import the HTML or Excel report exported from MetaTrader 5. Each trade keeps its platform ticket, commission and swap, and the broker's P&L is kept and checked against an independent calculation." },
  { icon: Table, t: "CSV and Excel files", d: "Already keep a spreadsheet? Upload a CSV or Excel file and your trades land in the journal ready to tag." },
  { icon: PencilSimpleLine, t: "Manual entry", d: "Log a trade by hand with its setup, comments and screenshots, for platforms or markets you do not export from." },
];
const steps = [
  { t: "Export from your platform", d: "In MetaTrader 5, export your account history as an HTML or Excel report." },
  { t: "Choose a journal", d: "Pick the journal the trades belong to. Each journal has its own broker, currency and starting balance." },
  { t: "Import and review", d: "Upload the file, check the trades, then tag your setups and decisions." },
];
export const Route = createFileRoute("/import")({
  head: () => ({ meta: [{ title: "Import trades | AlphaMine" }, { name: "description", content: DESC }, { property: "og:title", content: "Import trades | AlphaMine" }, { property: "og:description", content: DESC }, { property: "og:type", content: "website" }], links: [{ rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&display=swap" }] }),
  component: () => (
    <SiteLayout>
      <PageHero eyebrow="Import" title="Bring your trading history with you" lead="Start with months of results instead of an empty journal. Import a MetaTrader 5 report, upload a spreadsheet, or log trades by hand.">
        <Link to="/auth" search={{ mode: "signup" }} className="mk-btn mk-btn-pri">Start journaling free <ArrowRight size={18} weight="bold" /></Link>
      </PageHero>
      <Section n="01" label="Ways to import" title="Pick the route that matches your platform">
        <div className="grid gap-4 md:grid-cols-3">
          {methods.map((m, i) => (
            <Rv key={m.t} delay={i * 80}><article className="mk-card h-full p-6"><m.icon size={28} className="text-[var(--mk-acc)]" /><h3 className="mt-4 text-xl font-semibold">{m.t}</h3><p className="mt-2 text-base text-[var(--mk-mute)]">{m.d}</p></article></Rv>
          ))}
        </div>
      </Section>
      <Section n="02" label="How it works" title="From a platform export to a tagged journal">
        <ol className="relative grid gap-10 md:grid-cols-3 md:gap-8">
          <div className="absolute left-0 right-0 top-5 hidden h-px bg-[var(--mk-line)] md:block" aria-hidden />
          {steps.map((s, i) => (
            <Rv key={s.t} delay={i * 100}><li className="relative list-none"><span className="relative z-10 grid h-10 w-10 place-items-center rounded-full border border-[var(--mk-line)] bg-[var(--mk-bg)] font-mono text-sm text-[var(--mk-acc)]">{i + 1}</span><h3 className="mt-5 text-xl font-semibold">{s.t}</h3><p className="mt-2 text-base text-[var(--mk-mute)]">{s.d}</p></li></Rv>
          ))}
        </ol>
      </Section>
      <CtaBand title="Import your first report in minutes" />
    </SiteLayout>
  ),
});
