import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { sel } from "@/components/settings/settings-kit";
import { ACCESS_CHOICES, LOCKED_SCOPES, SCOPES, type ScopeKey } from "@/lib/mentor/scopes";

export interface AccessChoice {
  journalIds: string[];
  scopes: ScopeKey[];
  /** Days the mentor can read, or null for "until I stop it". */
  days: number | null;
}

/** What to share with a mentor: which journals, which kinds of data, and for how long. Used when inviting, accepting and editing. */
export function AccessForm({
  journals,
  value,
  onChange,
}: {
  journals: { id: string; name: string; currency?: string }[];
  value: AccessChoice;
  onChange: (v: AccessChoice) => void;
}) {
  const toggleJournal = (id: string, on: boolean) =>
    onChange({
      ...value,
      journalIds: on
        ? [...new Set([...value.journalIds, id])]
        : value.journalIds.filter((x) => x !== id),
    });
  const toggleScope = (k: ScopeKey, on: boolean) =>
    onChange({
      ...value,
      scopes: on ? [...new Set([...value.scopes, k])] : value.scopes.filter((x) => x !== k),
    });
  return (
    <div className="space-y-4">
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold">Journals to share</legend>
        {journals.map((j) => (
          <label key={j.id} className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={value.journalIds.includes(j.id)}
              onCheckedChange={(v) => toggleJournal(j.id, !!v)}
              aria-label={`Share ${j.name}`}
            />
            <span className="truncate">{j.name}</span>
            {j.currency && <span className="text-xs text-muted-foreground">{j.currency}</span>}
          </label>
        ))}
        {!journals.length && (
          <p className="text-sm text-muted-foreground">You have no journals yet.</p>
        )}
      </fieldset>
      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold">What they can see</legend>
        {SCOPES.map((s) => {
          const locked = LOCKED_SCOPES.includes(s.key);
          return (
            <label key={s.key} className="flex items-start gap-2 text-sm">
              <Checkbox
                className="mt-0.5"
                checked={locked || value.scopes.includes(s.key)}
                disabled={locked}
                onCheckedChange={(v) => toggleScope(s.key, !!v)}
                aria-label={s.label}
              />
              <span>
                {s.label}
                <span className="block text-xs text-muted-foreground">{s.hint}</span>
              </span>
            </label>
          );
        })}
        <p className="text-xs text-muted-foreground">
          Trades and amounts are always part of a share for now. Your broker login, share link and
          your diary are never shared.
        </p>
      </fieldset>
      <div>
        <Label className="text-xs" htmlFor="access-days">
          For how long
        </Label>
        <select
          id="access-days"
          className={sel}
          value={value.days ?? "forever"}
          onChange={(e) =>
            onChange({
              ...value,
              days: e.target.value === "forever" ? null : Number(e.target.value),
            })
          }
        >
          {ACCESS_CHOICES.map((c) => (
            <option key={c.label} value={c.days ?? "forever"}>
              {c.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-muted-foreground">
          You can stop sharing at any time; it takes effect at once.
        </p>
      </div>
    </div>
  );
}
