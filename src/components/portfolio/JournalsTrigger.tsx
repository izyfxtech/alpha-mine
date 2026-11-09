import type { ComponentProps } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** The "Journals" button that opens the journal picker. Props pass through so it can be a popover trigger. */
export function JournalsTrigger(props: Omit<ComponentProps<typeof Button>, "children">) {
  return (
    <Button
      variant="outline"
      className="h-8 w-56 justify-between bg-card text-[12px] font-normal"
      {...props}
    >
      Journals <ChevronDown className="h-4 w-4" />
    </Button>
  );
}
