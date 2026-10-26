/** Small illustrative graphics shared by the landing page and feature pages. All figures are sample data. */
export const Meter = ({ label, value }: { label: string; value: number }) => (
  <div><div className="flex justify-between text-xs text-[var(--mk-mute)]"><span>{label}</span><span className="font-mono">{value}</span></div>
    <div className="mt-1 h-1.5 rounded-full bg-[var(--mk-line)]"><div className="h-full rounded-full bg-[var(--mk-acc)]" style={{ width: `${value}%` }} /></div></div>
);

const CAL = [0, 1, 1, 2, -1, 0, 0, 1, 2, 1, -1, 1, 0, 0, 2, 1, -1, 1, 1, 0, 0, 1, 1, 2, 0, 1, 0, 0, -1, 1, 2, 1, 1, 0, 0];
const calBg = (v: number) => v === 2 ? "var(--mk-acc)" : v === 1 ? "color-mix(in srgb, var(--mk-acc) 45%, transparent)" : v === -1 ? "color-mix(in srgb, #ef4444 60%, transparent)" : "var(--mk-s2)";
export const Cal = () => <div className="grid grid-cols-7 gap-1" aria-hidden>{CAL.map((v, i) => <div key={i} className="aspect-square" style={{ background: calBg(v), borderRadius: 4 }} />)}</div>;

export const Bars = () => (
  <div className="flex h-40 items-end gap-3" aria-hidden>{[30, 52, 40, 68, 56, 80, 64, 92].map((h, i) => <div key={i} className="flex-1 rounded-t" style={{ height: `${h}%`, background: i === 7 ? "var(--mk-acc)" : "var(--mk-line)" }} />)}</div>
);

export const Monte = () => (
  <svg viewBox="0 0 200 80" className="h-40 w-full" aria-hidden fill="none" strokeWidth="2" strokeLinecap="round">
    {[["M0 60 L50 52 L100 40 L150 28 L200 8", 1], ["M0 60 L50 56 L100 50 L150 46 L200 40", 0.5], ["M0 60 L50 58 L100 56 L150 62 L200 58", 0.35], ["M0 60 L50 64 L100 62 L150 70 L200 74", 0.35]].map(([d, o], i) => <path key={i} d={String(d)} stroke="var(--mk-acc)" opacity={Number(o)} />)}
  </svg>
);

export const JournalRows = () => (
  <div className="text-sm" aria-hidden>
    <div className="grid grid-cols-4 gap-2 border-b border-[var(--mk-line)] pb-2 text-xs text-[var(--mk-mute)]"><span>Date</span><span>Setup</span><span>Result</span><span className="text-right">P&L</span></div>
    {[["Mon", "Breakout", "1.8R", "+$214", 1], ["Tue", "Pullback", "0.6R", "+$72", 1], ["Wed", "Range fade", "-1.0R", "$120", 0], ["Thu", "Breakout", "1.2R", "+$143", 1]].map(([d, s, r, p, w]) => (
      <div key={String(d)} className="grid grid-cols-4 gap-2 border-b border-[var(--mk-line)] py-3 last:border-0"><span>{d}</span><span>{s}</span><span className="font-mono">{r}</span><span className={`text-right font-mono ${w ? "text-[var(--mk-acc)]" : "text-red-500"}`}>{w ? p : `-${p}`}</span></div>
    ))}
  </div>
);
