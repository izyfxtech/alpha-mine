import { supabase } from "@/integrations/supabase/client";

/**
 * Asks the server to delete the screenshot files whose rows were just removed (a deleted or merged trade, a deleted
 * journal). The database queues the paths; this empties the user's own part of the queue. Best effort: a failure
 * leaves the paths queued, and the scheduled sweep picks them up.
 */
export function sweepStorage() {
  void supabase.functions.invoke("sweep-storage").catch(() => undefined);
}
