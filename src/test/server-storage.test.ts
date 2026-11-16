// @vitest-environment node
import { describe, expect, it } from "vitest";
import { isCleanPath, isOwnPath } from "@/server/paths";
import { isValidSignature, signPath } from "@/server/signing";
import {
  expiryFor,
  readScreenshot,
  visibleToCaller,
  removeScreenshots,
  signScreenshots,
  uploadScreenshot,
  type ScreenshotDeps,
} from "@/server/screenshots";
import { sharedJournal, type ShareDeps } from "@/server/share";

describe("paths", () => {
  it("accepts a file inside the user's own folder", () => {
    expect(isOwnPath("u1", "u1/trade/abc-shot.png")).toBe(true);
  });

  it("refuses another user's folder, a prefix lookalike and the folder itself", () => {
    expect(isOwnPath("u1", "u2/trade/a.png")).toBe(false);
    expect(isOwnPath("u1", "u10/trade/a.png")).toBe(false);
    expect(isOwnPath("u1", "u1")).toBe(false);
  });

  it("refuses anything that could climb out of a folder", () => {
    for (const p of ["u1/../u2/a.png", "u1/./a.png", "/u1/a.png", "u1//a.png", "", "u1/a/"])
      expect(isCleanPath(p), p).toBe(false);
    expect(isCleanPath(`u1/${"a".repeat(500)}`)).toBe(false);
  });
});

describe("signed links", () => {
  const now = 1_000;
  it("verify for the same path and expiry, and only until they expire", async () => {
    const sig = await signPath("secret", "u1/a.png", now + 60);
    expect(await isValidSignature("secret", "u1/a.png", now + 60, sig, now)).toBe(true);
    expect(await isValidSignature("secret", "u1/a.png", now + 60, sig, now + 61)).toBe(false);
  });

  it("do not verify for another path, expiry, secret or malformed signature", async () => {
    const sig = await signPath("secret", "u1/a.png", now + 60);
    expect(await isValidSignature("secret", "u1/b.png", now + 60, sig, now)).toBe(false);
    expect(await isValidSignature("secret", "u1/a.png", now + 99999, sig, now)).toBe(false);
    expect(await isValidSignature("other", "u1/a.png", now + 60, sig, now)).toBe(false);
    expect(await isValidSignature("secret", "u1/a.png", now + 60, "zz", now)).toBe(false);
    expect(await isValidSignature("secret", "u1/a.png", now + 60, "", now)).toBe(false);
  });
});

/** A bucket that keeps files in memory, with the few R2 calls the handlers use. */
function memoryBucket() {
  const files = new Map<string, { bytes: string; type: string }>();
  const bucket = {
    files,
    async put(path: string, body: ReadableStream, options: R2PutOptions) {
      if (files.has(path)) return null;
      const type = (options.httpMetadata as R2HTTPMetadata).contentType ?? "";
      files.set(path, { bytes: await new Response(body).text(), type });
      return {};
    },
    async get(path: string) {
      const file = files.get(path);
      if (!file) return null;
      return {
        body: new Response(file.bytes).body,
        httpEtag: '"etag"',
        writeHttpMetadata: (h: Headers) => h.set("content-type", file.type),
      };
    },
    async delete(paths: string[]) {
      for (const p of paths) files.delete(p);
    },
  };
  return bucket;
}

function deps(userId: string | null) {
  const bucket = memoryBucket();
  const d: ScreenshotDeps = {
    bucket: bucket as unknown as R2Bucket,
    secret: "secret",
    supabase: { url: "http://supabase.test", anonKey: "key" },
    nowSeconds: () => 1_000,
    verify: async () => userId,
  };
  return { d, bucket };
}

const put = (body: string, type = "image/png", extra: Record<string, string> = {}) =>
  new Request("http://app.test/x", {
    method: "PUT",
    body,
    headers: { "content-type": type, "content-length": String(body.length), ...extra },
  });
const post = (body: unknown) =>
  new Request("http://app.test/x", { method: "POST", body: JSON.stringify(body) });

describe("screenshot API", () => {
  it("stores an image in the user's folder and refuses to overwrite it", async () => {
    const { d, bucket } = deps("u1");
    expect((await uploadScreenshot(put("png"), "u1/t/a.png", d)).status).toBe(201);
    expect(bucket.files.get("u1/t/a.png")?.bytes).toBe("png");
    expect((await uploadScreenshot(put("again"), "u1/t/a.png", d)).status).toBe(409);
    expect(bucket.files.get("u1/t/a.png")?.bytes).toBe("png");
  });

  it("refuses uploads from signed-out visitors, into other folders, of non-images and of unknown size", async () => {
    expect((await uploadScreenshot(put("x"), "u1/a.png", deps(null).d)).status).toBe(401);
    const { d } = deps("u1");
    expect((await uploadScreenshot(put("x"), "u2/a.png", d)).status).toBe(403);
    expect((await uploadScreenshot(put("x"), "u1/../u2/a.png", d)).status).toBe(403);
    expect((await uploadScreenshot(put("<svg/>", "image/svg+xml"), "u1/a.svg", d)).status).toBe(
      415,
    );
    const noLength = new Request("http://app.test/x", {
      method: "PUT",
      body: "x",
      headers: { "content-type": "image/png" },
    });
    noLength.headers.delete("content-length");
    expect((await uploadScreenshot(noLength, "u1/a.png", d)).status).toBe(411);
  });

  it("signs only the user's own paths, and a signed link reads the file back", async () => {
    const { d } = deps("u1");
    await uploadScreenshot(put("png"), "u1/t/a b.png", d);
    const signed = await signScreenshots(post({ paths: ["u1/t/a b.png", "u2/t/a.png"] }), d);
    const { urls } = (await signed.json()) as { urls: Record<string, string> };
    expect(Object.keys(urls)).toEqual(["u1/t/a b.png"]);
    const url = urls["u1/t/a b.png"]!;
    const read = await readScreenshot(new Request(`http://app.test${url}`), "u1/t/a b.png", d);
    expect(read.status).toBe(200);
    expect(await read.text()).toBe("png");
    expect(read.headers.get("content-type")).toBe("image/png");
  });

  it("refuses a link that is expired, tampered with, or used for another file", async () => {
    const { d } = deps("u1");
    await uploadScreenshot(put("png"), "u1/t/a.png", d);
    const { urls } = (await (await signScreenshots(post({ paths: ["u1/t/a.png"] }), d)).json()) as {
      urls: Record<string, string>;
    };
    const url = urls["u1/t/a.png"]!;
    const get = (u: string, path: string, at = 1_000) =>
      readScreenshot(new Request(`http://app.test${u}`), path, { ...d, nowSeconds: () => at });
    // Signed at t=1000: valid through the hour boundary at least an hour ahead (7200), not a second longer.
    expect((await get(url, "u1/t/a.png", 1_000 + 3601)).status).toBe(200);
    expect((await get(url, "u1/t/a.png", 7_200)).status).toBe(200);
    expect((await get(url, "u1/t/a.png", 7_201)).status).toBe(403);
    expect((await get(url.slice(0, -1) + "0", "u1/t/a.png")).status).toBe(403);
    expect((await get(url, "u1/t/b.png")).status).toBe(403);
    expect((await get("/x", "u1/t/a.png")).status).toBe(403);
  });

  it("gives the same link for the same file all through an hour, so the browser can reuse its cached image", async () => {
    const { d } = deps("u1");
    const signAt = async (at: number) => {
      const res = await signScreenshots(post({ paths: ["u1/t/a.png"] }), {
        ...d,
        nowSeconds: () => at,
      });
      return ((await res.json()) as { urls: Record<string, string> }).urls["u1/t/a.png"]!;
    };
    const first = await signAt(3_601); // just after a boundary
    expect(await signAt(3_601)).toBe(first);
    expect(await signAt(5_000)).toBe(first);
    expect(await signAt(7_200)).toBe(first); // still the same bucket up to the next boundary
    expect(await signAt(7_201)).not.toBe(first);
  });

  it("keeps every link valid for at least an hour and less than two", () => {
    for (const at of [0, 1, 1_000, 3_599, 3_600, 3_601, 86_399, 1_794_000_123]) {
      const life = expiryFor(at) - at;
      expect(life, String(at)).toBeGreaterThanOrEqual(3600);
      expect(life, String(at)).toBeLessThan(7200);
      expect(expiryFor(at) % 3600).toBe(0);
    }
  });

  it("signs another person's file only when the database says the caller may see it, with a short link", async () => {
    const { d } = deps("m1");
    const asked: string[][] = [];
    const withVisible = (allowed: string[]): ScreenshotDeps => ({
      ...d,
      visible: async (_r, paths) => {
        asked.push(paths);
        return paths.filter((p) => allowed.includes(p));
      },
    });
    const sign = async (dd: ScreenshotDeps, paths: string[]) =>
      (
        (await (await signScreenshots(post({ paths }), dd)).json()) as {
          urls: Record<string, string>;
        }
      ).urls;

    const urls = await sign(withVisible(["s1/t/a.png"]), [
      "m1/own.png",
      "s1/t/a.png",
      "s2/t/b.png",
    ]);
    expect(Object.keys(urls).sort()).toEqual(["m1/own.png", "s1/t/a.png"]);
    expect(asked).toEqual([["s1/t/a.png", "s2/t/b.png"]]); // own files are never sent to the database
    const exp = (u: string) => Number(new URL(`http://x${u}`).searchParams.get("exp"));
    expect(exp(urls["s1/t/a.png"]!) - 1_000).toBeGreaterThanOrEqual(300);
    expect(exp(urls["s1/t/a.png"]!) - 1_000).toBeLessThan(600);
    expect(exp(urls["m1/own.png"]!) - 1_000).toBeGreaterThanOrEqual(3600);
    // the shared link really reads the file
    await d.bucket.put("s1/t/a.png", new Response("png").body!, {
      httpMetadata: { contentType: "image/png" },
    } as R2PutOptions);
    const read = await readScreenshot(
      new Request(`http://app.test${urls["s1/t/a.png"]}`),
      "s1/t/a.png",
      d,
    );
    expect(read.status).toBe(200);
  });

  it("never asks the database about a path that could climb out of a folder, nor when nothing is foreign", async () => {
    const { d } = deps("m1");
    let calls = 0;
    const dd: ScreenshotDeps = { ...d, visible: async () => (calls++, []) };
    await signScreenshots(post({ paths: ["m1/own.png"] }), dd);
    await signScreenshots(post({ paths: ["s1/../s2/a.png", "/etc/passwd", ""] }), dd);
    expect(calls).toBe(0);
  });

  it("asks Supabase with the caller's own token, keeps only what was asked, and answers none on any failure", async () => {
    const cfg = { url: "http://supabase.test", anonKey: "key" };
    const req = (auth?: string) =>
      new Request("http://app.test/x", {
        method: "POST",
        headers: auth ? { Authorization: auth } : {},
      });
    let seen: { url: string; auth: string | null; body: string } | null = null;
    const fetcher = (async (url: string, init: RequestInit) => {
      seen = {
        url,
        auth: (init.headers as Record<string, string>)["Authorization"] ?? null,
        body: String(init.body),
      };
      return new Response(JSON.stringify(["s1/a.png", "not-asked.png", 7]), { status: 200 });
    }) as unknown as typeof fetch;
    expect(
      await visibleToCaller(req("Bearer tok"), ["s1/a.png", "s1/b.png"], cfg, fetcher),
    ).toEqual(["s1/a.png"]);
    expect(seen).toEqual({
      url: "http://supabase.test/rest/v1/rpc/visible_screenshot_paths",
      auth: "Bearer tok",
      body: JSON.stringify({ _paths: ["s1/a.png", "s1/b.png"] }),
    });
    expect(await visibleToCaller(req(), ["s1/a.png"], cfg, fetcher)).toEqual([]);
    const failing = (async () => new Response("no", { status: 500 })) as unknown as typeof fetch;
    expect(await visibleToCaller(req("Bearer tok"), ["s1/a.png"], cfg, failing)).toEqual([]);
    const broken = (async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    expect(await visibleToCaller(req("Bearer tok"), ["s1/a.png"], cfg, broken)).toEqual([]);
  });

  it("deletes only the user's own files", async () => {
    const { d, bucket } = deps("u1");
    bucket.files.set("u1/a.png", { bytes: "a", type: "image/png" });
    bucket.files.set("u2/a.png", { bytes: "b", type: "image/png" });
    const res = await removeScreenshots(post({ paths: ["u1/a.png", "u2/a.png"] }), d);
    expect(await res.json()).toEqual({ removed: 1 });
    expect([...bucket.files.keys()]).toEqual(["u2/a.png"]);
    expect((await removeScreenshots(post({ paths: "nope" }), d)).status).toBe(400);
  });
});

describe("share links", () => {
  const TOKEN = "11111111-2222-3333-4444-555555555555";
  function shareDeps(allowed = true) {
    const store = new Map<string, string>();
    let calls = 0;
    const d: ShareDeps = {
      cache: {
        get: async (k: string) => store.get(k) ?? null,
        put: async (k: string, v: string) => void store.set(k, v),
      } as unknown as KVNamespace,
      limiter: { limit: async () => ({ success: allowed }) } as RateLimit,
      supabase: { url: "http://supabase.test", anonKey: "sb_publishable_x" },
      fetcher: (async () => {
        calls++;
        return new Response('{"name":"demo"}');
      }) as typeof fetch,
    };
    return { d, calls: () => calls };
  }
  const req = () => new Request("http://app.test/x");

  it("asks the database once, then serves the cached answer", async () => {
    const { d, calls } = shareDeps();
    const first = await sharedJournal(req(), TOKEN, d);
    const second = await sharedJournal(req(), TOKEN, d);
    expect(first.headers.get("x-cache")).toBe("miss");
    expect(second.headers.get("x-cache")).toBe("hit");
    expect(await second.json()).toEqual({ name: "demo" });
    expect(calls()).toBe(1);
  });

  it("refuses a malformed token without touching the database, and limits busy visitors", async () => {
    const { d, calls } = shareDeps();
    expect((await sharedJournal(req(), "nope", d)).status).toBe(404);
    expect(calls()).toBe(0);
    expect((await sharedJournal(req(), TOKEN, shareDeps(false).d)).status).toBe(429);
  });
});
