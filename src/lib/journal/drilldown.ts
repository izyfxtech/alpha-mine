import { useNavigate } from "@tanstack/react-router";
import { useJournal, type Filters } from "@/lib/journal/journal-context";

/** Click-through: apply a filter patch on top of the current filters and open the journal on exactly those trades. */
export function useDrillDown() {
  const { filters, setFilters } = useJournal();
  const navigate = useNavigate();
  return (patch: Filters) => { setFilters({ ...filters, ...patch }); void navigate({ to: "/journal" }); };
}
