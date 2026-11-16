// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createSupabaseFetch } from "@/lib/supabase-key-fetch";

const call = async (key: string, headers: Record<string, string>) => {
  let seen: Headers | undefined;
  const base = (async (_input: unknown, init?: RequestInit) => {
    seen = new Headers(init?.headers);
    return new Response("{}");
  }) as typeof fetch;
  await createSupabaseFetch(key, base)("https://x.supabase.co/rest/v1/t", { headers });
  return seen!;
};

describe("createSupabaseFetch", () => {
  it("sends a new-style key as apikey only", async () => {
    const h = await call("sb_secret_abc", { Authorization: "Bearer sb_secret_abc" });
    expect(h.get("apikey")).toBe("sb_secret_abc");
    expect(h.get("Authorization")).toBeNull();
  });

  it("keeps a signed-in user's token", async () => {
    const h = await call("sb_publishable_abc", { Authorization: "Bearer user.jwt.token" });
    expect(h.get("Authorization")).toBe("Bearer user.jwt.token");
    expect(h.get("apikey")).toBe("sb_publishable_abc");
  });

  it("leaves a legacy JWT key untouched", async () => {
    const h = await call("eyJ.legacy.key", { Authorization: "Bearer eyJ.legacy.key" });
    expect(h.get("Authorization")).toBe("Bearer eyJ.legacy.key");
  });
});
