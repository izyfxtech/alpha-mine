import { CURRENCIES } from "@/lib/currencies";
import { useWhenChanged } from "@/lib/use-when-changed";
import { localToday } from "@/lib/time/local-time";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/kit";
import { TypedConfirm } from "@/components/settings-parts";
import { supabase } from "@/integrations/supabase/client";
import { buildExport, deleteMyAccount, downloadText, tradesCsv } from "@/lib/account/export-data";
import { useNavigate } from "@tanstack/react-router";
import { useProfile } from "@/lib/profile-settings";
import { cn } from "@/lib/utils";
import { card, currencyName, sel, selFixed } from "@/components/settings/settings-kit";

export function Account() {
  const qc = useQueryClient();
  const { profile: data, settings, saveSettings } = useProfile();
  const [f, setF] = useState({
    display_name: data?.display_name ?? "",
    base_currency: data?.base_currency ?? "USD",
  });
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [exporting, setExporting] = useState<string | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  const navigate = useNavigate();
  async function exportData(kind: "json" | "csv") {
    setExporting("Preparing…");
    try {
      const file = await buildExport((l) => setExporting(l));
      const day = localToday();
      if (kind === "json")
        downloadText(
          `alphamine-data-${day}.json`,
          JSON.stringify(file, null, 2),
          "application/json",
        );
      else downloadText(`alphamine-trades-${day}.csv`, tradesCsv(file), "text/csv");
      toast.success("Download started");
    } catch (e) {
      toast.error((e as Error).message || "Could not export your data");
    } finally {
      setExporting(null);
    }
  }
  useWhenChanged(data, (next) => {
    if (next) setF({ display_name: next.display_name, base_currency: next.base_currency });
  });
  const toggles: [
    "showWeeklyTotals" | "showCalendarWinrate" | "showBalance" | "allowSharing",
    string,
  ][] = [
    ["showWeeklyTotals", "Show week totals in calendar"],
    ["showCalendarWinrate", "Show winrate next to the trade count in calendar"],
    ["showBalance", "Show account balance"],
    ["allowSharing", "Allow other users to share their journals with me using my email address"],
  ];
  const save = async (patch: Parameters<typeof saveSettings>[0]) => {
    try {
      await saveSettings(patch);
    } catch {
      toast.error("Could not save preference");
    }
  };
  return (
    <div className="max-w-[500px] space-y-[22px]">
      <div className={cn(card, "space-y-4 p-[26px]")}>
        {toggles.map(([key, label]) => (
          <div key={key} className="flex items-center gap-3 text-[12px]">
            <Switch
              id={key}
              checked={settings[key]}
              onCheckedChange={(checked) => save({ [key]: checked })}
            />
            <Label htmlFor={key} className="font-normal">
              {label}
            </Label>
          </div>
        ))}
        <div className="flex items-center justify-between gap-4 text-[12px]">
          <Label htmlFor="weekStartsOn" className="font-normal">
            First day of the week
          </Label>
          <select
            id="weekStartsOn"
            className={selFixed + " w-32"}
            value={settings.weekStartsOn}
            onChange={(e) => save({ weekStartsOn: e.target.value === "0" ? 0 : 1 })}
          >
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </select>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
          Change Password
        </Button>
      </div>
      <Panel title="Profile">
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Email</Label>
            <Input value={data?.email ?? ""} disabled />
          </div>
          <div>
            <Label className="text-xs">Display name</Label>
            <Input
              value={f.display_name}
              onChange={(e) => setF({ ...f, display_name: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Base currency</Label>
            <select
              className={sel}
              value={f.base_currency}
              onChange={(e) => setF({ ...f, base_currency: e.target.value })}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {currencyName(c)}
                </option>
              ))}
            </select>
          </div>
          <Button
            onClick={async () => {
              if (!data)
                return void toast.error("Your profile has not loaded yet. Try again in a moment.");
              const { error } = await supabase.from("profiles").upsert({ id: data.id, ...f });
              if (error) toast.error(error.message);
              else {
                toast.success("Profile saved");
                qc.invalidateQueries({ queryKey: ["profile"] });
              }
            }}
          >
            Save profile
          </Button>
        </div>
      </Panel>
      <Panel title="Your data">
        <div className="space-y-3 text-[12px]">
          <p className="text-t3">
            Download everything you have stored: every journal with its trades, notes, plans,
            sessions and settings. Screenshot entries list their storage path; the image files are
            not included.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => void exportData("json")}
            >
              Download all data (JSON)
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!exporting}
              onClick={() => void exportData("csv")}
            >
              Download trades (CSV)
            </Button>
          </div>
          {exporting && (
            <p className="text-t4" role="status">
              {exporting}
            </p>
          )}
          <div className="border-t pt-3">
            <p className="text-t3">
              Deleting your account permanently removes your sign-in, every journal and all of their
              trades, screenshots, notes and settings. It cannot be undone.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-2 text-loss"
              onClick={() => setDelOpen(true)}
            >
              <Trash2 className="h-4 w-4" /> Delete my account
            </Button>
          </div>
        </div>
      </Panel>
      <TypedConfirm
        open={delOpen}
        onOpenChange={setDelOpen}
        title="Delete your account?"
        phrase="delete my account"
        confirmLabel="Delete account"
        description={
          <p>
            This permanently deletes <b className="text-t1">{data?.email ?? "your account"}</b>, all
            of your journals and everything in them. Download your data first if you want a copy. It
            cannot be undone.
          </p>
        }
        onConfirm={async () => {
          await deleteMyAccount();
          toast.success("Your account was deleted");
          await navigate({ to: "/" });
        }}
      />
      <Dialog
        open={pwOpen}
        onOpenChange={(v) => {
          setPwOpen(v);
          if (!v) setPw("");
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogTitle>Change password</DialogTitle>
          <DialogDescription className="sr-only">
            Enter a new password for your account.
          </DialogDescription>
          <Input
            type="password"
            autoFocus
            aria-label="New password"
            placeholder="New password (min 8 characters)"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pw.length < 8}
              onClick={async () => {
                const { error } = await supabase.auth.updateUser({ password: pw });
                if (error) toast.error(error.message);
                else {
                  toast.success("Password updated");
                  setPwOpen(false);
                }
              }}
            >
              Update password
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* --------------------------------- Journal -------------------------------- */
