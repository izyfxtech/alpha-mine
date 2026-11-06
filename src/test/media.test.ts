import { beforeEach, describe, expect, it, vi } from "vitest";

const sign = vi.fn(async (paths: string[]) => ({ data: paths.map((p) => ({ path: p, signedUrl: `https://s/${p}?t=${sign.mock.calls.length}`, error: null })), error: null }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { storage: { from: () => ({ createSignedUrls: (paths: string[]) => sign(paths) }) } } }));

import { compressImage, thumbPath } from "@/lib/media/compress-image";
import { normalizeImageUrl } from "@/lib/media/image-links";
import { MAX_SHOTS } from "@/lib/media/limits";
import { clearSignedUrls, signPaths } from "@/lib/media/signed-urls";

describe("screenshot limit", () => {
  it("is 10", () => expect(MAX_SHOTS).toBe(10));
});

describe("signed urls are reused so the browser keeps its cached image", () => {
  beforeEach(() => { clearSignedUrls(); sign.mockClear(); });
  it("signs a path once and hands out the same url again", async () => {
    const a = await signPaths(["u/1.webp", "u/2.webp"]);
    const b = await signPaths(["u/1.webp", "u/2.webp"]);
    expect(sign).toHaveBeenCalledTimes(1);
    expect(b.get("u/1.webp")).toBe(a.get("u/1.webp"));
  });
  it("asks only for the paths it has not signed", async () => {
    await signPaths(["u/1.webp"]);
    await signPaths(["u/1.webp", "u/2.webp"]);
    expect(sign).toHaveBeenLastCalledWith(["u/2.webp"]);
  });
  it("signs again once a url is close to expiring", async () => {
    vi.useFakeTimers();
    try {
      await signPaths(["u/1.webp"]);
      vi.advanceTimersByTime(51 * 60_000);
      await signPaths(["u/1.webp"]);
      expect(sign).toHaveBeenCalledTimes(2);
    } finally { vi.useRealTimers(); }
  });
  it("de-duplicates paths and signs in batches of 100", async () => {
    await signPaths(Array.from({ length: 250 }, (_, i) => `u/${i % 240}.webp`));
    expect(sign).toHaveBeenCalledTimes(3);
  });
  it("leaves out a path Storage cannot sign", async () => {
    sign.mockResolvedValueOnce({ data: [{ path: "u/1.webp", signedUrl: "https://s/x", error: null }, { path: "u/1.webp.thumb.webp", signedUrl: "", error: "not found" as never }], error: null });
    const m = await signPaths(["u/1.webp", "u/1.webp.thumb.webp"]);
    expect(m.has("u/1.webp")).toBe(true);
    expect(m.has("u/1.webp.thumb.webp")).toBe(false);
  });
});

describe("image links", () => {
  it("turns a TradingView share page into its picture", () => {
    expect(normalizeImageUrl("https://www.tradingview.com/x/AbC123xy/")).toBe("https://s3.tradingview.com/snapshots/a/AbC123xy.png");
    expect(normalizeImageUrl("https://tradingview.com/x/Zz9/?utm=1")).toBe("https://s3.tradingview.com/snapshots/z/Zz9.png");
  });
  it("leaves any other address alone", () => {
    expect(normalizeImageUrl("https://i.imgur.com/a.png")).toBe("https://i.imgur.com/a.png");
    expect(normalizeImageUrl("https://www.tradingview.com/chart/ABC/")).toBe("https://www.tradingview.com/chart/ABC/");
  });
});

describe("compression passes through what it must not touch", () => {
  it("animated or vector images and files it cannot decode are returned as they are", async () => {
    const gif = new File(["x"], "a.gif", { type: "image/gif" });
    expect(await compressImage(gif)).toBe(gif);
    const png = new File(["x"], "a.png", { type: "image/png" }); // jsdom cannot decode
    expect(await compressImage(png)).toBe(png);
  });
  it("a preview lives next to its file", () => expect(thumbPath("u/t/a.webp")).toBe("u/t/a.webp.thumb.webp"));
});
