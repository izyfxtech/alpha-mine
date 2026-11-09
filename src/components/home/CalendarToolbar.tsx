import { addMonths, format } from "date-fns";
import { Camera, ChevronLeft, ChevronRight } from "lucide-react";

/** The month switcher and save-as-image button in the Profit Calendar's title row. */
export function CalendarToolbar({
  month,
  onMonthChange,
  onSave,
}: {
  month: Date;
  onMonthChange?: (month: Date) => void;
  onSave?: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        data-no-capture
        className="flex items-center overflow-hidden rounded-md border border-ink-line text-[12px] font-medium"
      >
        <button
          aria-label="Previous month"
          className="flex h-[26px] w-[26px] items-center justify-center hover:bg-muted"
          onClick={() => onMonthChange?.(addMonths(month, -1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="flex h-[26px] w-[110px] items-center justify-center border-x border-ink-line">
          {format(month, "MMMM yyyy")}
        </span>
        <button
          aria-label="Next month"
          className="flex h-[26px] w-[26px] items-center justify-center hover:bg-muted"
          onClick={() => onMonthChange?.(addMonths(month, 1))}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <button
        data-no-capture
        type="button"
        aria-label="Save calendar as image"
        title="Save calendar as image"
        className="rounded-md p-1.5 hover:bg-muted"
        onClick={onSave}
      >
        <Camera className="h-5 w-5" />
      </button>
    </div>
  );
}
