import { CURRENCIES } from "@/lib/currencies";
import { useWhenChanged } from "@/lib/use-when-changed";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TypedConfirm } from "@/components/settings-parts";
import { supabase } from "@/integrations/supabase/client";
import { sweepStorage } from "@/lib/media/sweep-storage";
import { useJournal } from "@/lib/journal/journal-context";
import { cn } from "@/lib/utils";
import { Float, bare } from "@/components/settings/form-bits";
import { MARKETS, TRADE_TYPES, card, currencyName } from "@/components/settings/settings-kit";

export function JournalSettings() {
  const { journal, journals, setJournalId, refresh } = useJournal();
  const initial = useMemo(
    () =>
      journal
        ? {
            name: journal.name,
            currency: journal.currency,
            starting_balance: String(journal.starting_balance),
            markets: journal.markets.join(", "),
            trade_type: journal.trade_type,
            broker: journal.broker ?? "",
            auto_pnl: journal.auto_pnl,
            quantity_unit: journal.quantity_unit ?? "",
          }
        : null,
    [journal],
  );
  const [f, setF] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useWhenChanged(initial, setF);
  if (!journal || !f || !initial) return null;
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const valid = f.name.trim() && f.markets.trim() && Number.isFinite(Number(f.starting_balance));
  const marketOptions = MARKETS.includes(f.markets)
    ? MARKETS
    : [f.markets, ...MARKETS].filter(Boolean);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF({ ...f, [k]: v });
  return (
    <div className="max-w-[500px] space-y-[22px]">
      <div className={card}>
        <div className="space-y-3 p-[26px]">
          <Float label="Journal Name *">
            <input className={bare} value={f.name} onChange={(e) => set("name", e.target.value)} />
          </Float>
          <Float label="Account Currency *">
            <select
              className={bare}
              value={f.currency}
              onChange={(e) => set("currency", e.target.value)}
            >
              {[...new Set([f.currency, ...CURRENCIES])].map((c) => (
                <option key={c} value={c}>
                  {currencyName(c)}
                </option>
              ))}
            </select>
          </Float>
          <Float label="Starting Balance">
            <input
              className={cn(bare, "tabular")}
              type="number"
              value={f.starting_balance}
              onChange={(e) => set("starting_balance", e.target.value)}
            />
          </Float>
          <Float label="Markets *">
            <select
              className={bare}
              value={f.markets}
              onChange={(e) => set("markets", e.target.value)}
            >
              {marketOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Float>
          <Float label="Default Trade Type *">
            <select
              className={bare}
              value={f.trade_type}
              onChange={(e) => set("trade_type", e.target.value)}
            >
              {TRADE_TYPES.map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Float>
          <Float label="Quantity is measured in">
            <select
              className={bare}
              value={f.quantity_unit}
              disabled={!!journal.mt_login}
              onChange={(e) => set("quantity_unit", e.target.value)}
            >
              <option value="">Not set</option>
              <option value="units">Units (shares, coins, contracts)</option>
              <option value="lots">Lots (forex, CFDs)</option>
            </select>
          </Float>
          <Float label="Broker">
            <input
              className={bare}
              value={f.broker}
              onChange={(e) => set("broker", e.target.value)}
            />
          </Float>
          <div className="flex items-center gap-3 pt-1 text-[12px]">
            <Switch
              id="auto_pnl"
              checked={f.auto_pnl}
              onCheckedChange={(v) => set("auto_pnl", v)}
            />
            <Label htmlFor="auto_pnl" className="font-normal">
              Auto Calculate Profit/Loss
            </Label>
          </div>
          {journal.mt_login
            ? null
            : f.quantity_unit === "" && (
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-t3">
                  Pick lots or units so profit/loss and R-multiples can be worked out correctly.
                  Until then they are never guessed.
                </p>
              )}
          {journal.mt_login && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-t3">
              Linked to {journal.mt_platform?.toUpperCase()} account {journal.mt_login}
              {journal.mt_server ? ` on ${journal.mt_server}` : ""}. Trades imported from it are
              matched by ticket, so re-importing never duplicates them.
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t px-[26px] py-4">
          <Button
            size="sm"
            variant={dirty && valid ? "ink" : "secondary"}
            disabled={!dirty || !valid}
            onClick={async () => {
              const { error } = await supabase
                .from("journals")
                .update({
                  name: f.name.trim(),
                  currency: f.currency,
                  broker: f.broker || null,
                  markets: f.markets
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                  trade_type: f.trade_type,
                  auto_pnl: f.auto_pnl,
                  quantity_unit:
                    f.quantity_unit === "units" || f.quantity_unit === "lots"
                      ? f.quantity_unit
                      : null,
                  starting_balance: Number(f.starting_balance),
                })
                .eq("id", journal.id);
              if (error) toast.error(error.message);
              else {
                toast.success("Journal saved");
                refresh();
              }
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => setF(initial)}>
            Reset
          </Button>
        </div>
      </div>
      <div className={cn(card, "flex items-center justify-between gap-4 p-[22px]")}>
        <div>
          <p className="text-[13px] font-semibold">Delete this journal</p>
          <p className="text-xs text-t3">
            Removes the journal with all of its trades, plans, notes and sessions.
          </p>
        </div>
        <Button
          variant="outline"
          className="text-loss"
          disabled={journals.length < 2}
          title={journals.length < 2 ? "You need at least one other journal" : undefined}
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete journal
        </Button>
      </div>
      <TypedConfirm
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this journal?"
        phrase={journal.name}
        confirmLabel="Delete journal"
        description={
          <p>
            This permanently deletes <b className="text-t1">{journal.name}</b> with all of its
            trades, screenshots, plans, notes and sessions. It cannot be undone.
          </p>
        }
        onConfirm={async () => {
          const next = journals.find((j) => j.id !== journal.id);
          const { error } = await supabase.from("journals").delete().eq("id", journal.id);
          if (error) {
            toast.error(error.message);
            throw error;
          }
          sweepStorage();
          if (next) setJournalId(next.id);
          refresh();
        }}
      />
    </div>
  );
}

/* ---------------------- Deposits & Withdrawals (cashflows) ---------------------- */
