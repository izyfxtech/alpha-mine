import { defineConfig } from "drizzle-kit";

// Drizzle Kit generates the SQL, the Supabase CLI applies and tracks it.
// `prefix: "supabase"` names files <timestamp>_<name>.sql, which is what the CLI expects.
export default defineConfig({
  dialect: "postgresql",
  schema: "./drizzle/schema.ts",
  out: "./supabase/migrations",
  migrations: { prefix: "supabase" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
