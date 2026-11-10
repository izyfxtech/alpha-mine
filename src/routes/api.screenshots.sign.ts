import { createFileRoute } from "@tanstack/react-router";
import { screenshotDeps } from "@/server/cloudflare";
import { signScreenshots } from "@/server/screenshots";

export const Route = createFileRoute("/api/screenshots/sign")({
  server: { handlers: { POST: ({ request }) => signScreenshots(request, screenshotDeps()) } },
});
