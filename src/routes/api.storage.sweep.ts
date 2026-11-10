import { createFileRoute } from "@tanstack/react-router";
import { sweepDeps } from "@/server/cloudflare";
import { sweepForUser } from "@/server/sweep-route";

/** The signed-in user empties their own part of the screenshot clean-up queue. */
export const Route = createFileRoute("/api/storage/sweep")({
  server: { handlers: { POST: ({ request }) => sweepForUser(request, sweepDeps()) } },
});
