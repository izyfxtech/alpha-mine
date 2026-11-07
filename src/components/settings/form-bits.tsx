import { type ReactNode } from "react";

export function Float({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="relative block rounded-md border bg-card px-3 pb-1.5 pt-3.5 text-sm">
      <span className="absolute -top-[7px] left-2 bg-card px-1 text-xs text-t3">{label}</span>
      {children}
    </label>
  );
}
export const bare = "w-full bg-transparent text-sm outline-none";
