import { safeCurrency } from "@/lib/currencies";
import { localDay, localToday } from "@/lib/time/local-time";
import { useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useJournal } from "@/lib/journal/journal-context";
import { useJournalTable } from "@/lib/journal/crud";
import { cn } from "@/lib/utils";
import { useDialogs } from "@/components/ui/confirm";
import { DatePicker } from "@/components/ui/date-picker";
import { card, sel } from "@/components/settings/settings-kit";

export function Cashflows() {
  const { confirm } = useDialogs();
  const { journal } = useJournal();
  const t = useJournalTable("journal_cashflows", journal?.id, "occurred_on", false);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localToday());
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("deposit");
  const [note, setNote] = useState("");
  const money = (n: number) =>
    `${n < 0 ? "-" : ""}${Math.abs(n).toLocaleString("en-US", { style: "currency", currency: safeCurrency(journal?.currency) })}`;
  const rows = useMemo(() => {
    const start = Number(journal?.starting_balance ?? 0);
    const list = [
      ...(start
        ? [
            {
              id: "start",
              occurred_on:
                journal?.deposit_date ?? (journal?.created_at ? localDay(journal.created_at) : ""),
              amount: start,
              note: "Starting balance",
              locked: true,
            },
          ]
        : []),
      ...t.rows.map((r) => ({
        id: r.id,
        occurred_on: r.occurred_on,
        amount: Number(r.amount),
        note: r.note,
        locked: false,
      })),
    ].sort((a, b) => a.occurred_on.localeCompare(b.occurred_on) || (a.locked ? -1 : 1));
    let bal = 0;
    return list.map((r) => ({ ...r, balance: (bal += r.amount) })).reverse();
  }, [t.rows, journal]);
  const valid = !!date && Number.isFinite(Number(amount)) && Number(amount) > 0;
  return (
    <div className="max-w-[700px]">
      <Button
        variant="ink"
        size="sm"
        className="mb-4 h-[30px] rounded-md px-3 text-[12px]"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5" />
        Add More
      </Button>
      <div className={cn(card, "overflow-hidden")}>
        <table className="w-full text-[12px] tabular">
          <thead>
            <tr className="h-[42px] text-left">
              <th className="px-4 font-semibold">Date</th>
              <th className="px-2 font-semibold">Amount</th>
              <th className="px-2 font-semibold">New Balance</th>
              <th className="px-2 font-semibold">Reason</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={cn(
                  "h-[37px]",
                  r.amount >= 0 ? "bg-row-win text-profit" : "bg-row-loss text-loss",
                )}
              >
                <td className="px-4">{r.occurred_on}</td>
                <td className="px-2">{money(r.amount)}</td>
                <td className="px-2">{money(r.balance)}</td>
                <td className="px-2 text-t2">{r.note}</td>
                <td className="px-2 text-right">
                  {!r.locked && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-foreground"
                      aria-label="Delete transaction"
                      onClick={async () => {
                        if (
                          await confirm({
                            title: "Delete transaction?",
                            message: "Balances and returns will be recalculated.",
                            destructive: true,
                          })
                        )
                          t.remove(r.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-t4">
                  No deposits or withdrawals yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogTitle>Add deposit or withdrawal</DialogTitle>
          <DialogDescription className="sr-only">
            Record money added to or taken from the account.
          </DialogDescription>
          <div className="space-y-3">
            <DatePicker aria-label="Date" value={date} onChange={setDate} />
            <select
              aria-label="Type"
              className={sel}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
            >
              <option value="deposit">Deposit</option>
              <option value="withdrawal">Withdrawal</option>
            </select>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="Amount"
              aria-label="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Input
              placeholder="Reason (optional)"
              aria-label="Reason"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={async () => {
                const r = await t.insert({
                  occurred_on: date,
                  amount: (kind === "withdrawal" ? -1 : 1) * Number(amount),
                  note: note || null,
                });
                if (r) {
                  setAmount("");
                  setNote("");
                  setOpen(false);
                }
              }}
            >
              Add
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------ Instruments and Setups ------------------------ */
