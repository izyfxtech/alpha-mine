import { Columns3 } from "lucide-react";

/** Column heads of the grouped table: the Group column, then each visible statistic. */
export function GroupTableHead({ columns }: { columns: readonly { k: string; l: string }[] }) {
  return (
    <thead>
      <tr className="h-[34px]">
        <th className="sticky left-0 z-10 w-[230px] border-r bg-background px-3 text-left font-semibold">
          Group
        </th>
        {columns.map((c) => (
          <th key={c.k} className="whitespace-nowrap px-3 text-right font-semibold">
            {c.l}
          </th>
        ))}
      </tr>
    </thead>
  );
}

/** The vertical "Columns" tab on the table's right edge. */
export function ColumnsTab({ expanded, onClick }: { expanded?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      aria-label="Columns"
      aria-expanded={expanded}
      onClick={onClick}
      className="absolute bottom-0 right-0 top-0 flex w-7 items-center justify-center bg-card text-xs font-semibold [writing-mode:vertical-rl] hover:bg-muted"
    >
      <Columns3 className="mb-1 h-3.5 w-3.5" />
      Columns
    </button>
  );
}
