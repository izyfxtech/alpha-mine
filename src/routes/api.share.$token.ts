import { createFileRoute } from "@tanstack/react-router";
import { shareDeps } from "@/server/cloudflare";
import { sharedJournal } from "@/server/share";

export const Route = createFileRoute("/api/share/$token")({
  server: {
    handlers: { GET: ({ request, params }) => sharedJournal(request, params.token, shareDeps()) },
  },
});
