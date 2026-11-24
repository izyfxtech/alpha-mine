import path from "node:path";
import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  server: {
    allowedHosts: [".vercel.run"],
  },
  preview: {
    allowedHosts: [".vercel.run"],
  },
  plugins: [
    // Builds the server side as a Cloudflare Worker (config: wrangler.jsonc) and runs it in workerd during `vite dev`.
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tanstackStart({
      // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
      server: { entry: "server" },
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      // The P&L engine lives under supabase/functions so the Edge Function and the app run the same code.
      "@engine": path.resolve(import.meta.dirname, "supabase/functions/_shared/pnl-engine"),
      "@shared": path.resolve(import.meta.dirname, "supabase/functions/_shared"),
    },
  },
});
