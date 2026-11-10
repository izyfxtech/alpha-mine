import { createFileRoute } from "@tanstack/react-router";
import { screenshotDeps } from "@/server/cloudflare";
import { removeScreenshots } from "@/server/screenshots";

export const Route = createFileRoute("/api/screenshots/remove")({
  server: { handlers: { POST: ({ request }) => removeScreenshots(request, screenshotDeps()) } },
});
