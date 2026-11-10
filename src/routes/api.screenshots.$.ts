import { createFileRoute } from "@tanstack/react-router";
import { screenshotDeps } from "@/server/cloudflare";
import { readScreenshot, uploadScreenshot } from "@/server/screenshots";

/** `/api/screenshots/<path>`: GET with a signed link reads a file, PUT stores one. See src/server/screenshots.ts. */
export const Route = createFileRoute("/api/screenshots/$")({
  server: {
    handlers: {
      GET: ({ request, params }) =>
        readScreenshot(request, params["_splat"] ?? "", screenshotDeps()),
      PUT: ({ request, params }) =>
        uploadScreenshot(request, params["_splat"] ?? "", screenshotDeps()),
    },
  },
});
