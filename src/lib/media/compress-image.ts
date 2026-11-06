const MAX_SIDE = 1920;          // a chart screenshot stays readable at this size
const KEEP_BELOW = 300_000;     // an image already this small and not larger than MAX_SIDE is uploaded untouched
const THUMB_SIDE = 640;
const RASTER = /^image\/(png|jpe?g|webp|bmp)$/i;

const canDecode = (file: File) => RASTER.test(file.type) && typeof createImageBitmap !== "undefined" && typeof document !== "undefined";

/** Draws the image scaled so its longest side is at most `side` and encodes it as WebP (JPEG where WebP is not available). */
async function encode(bmp: ImageBitmap, side: number, quality: number): Promise<{ blob: Blob; scaled: boolean } | null> {
  const scale = Math.min(1, side / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bmp.width * scale)); canvas.height = Math.max(1, Math.round(bmp.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparency would turn black in JPEG
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const toBlob = (type: string) => new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
  let blob = await toBlob("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg"); // an old browser silently returns PNG for WebP
  return blob ? { blob, scaled: scale < 1 } : null;
}

const rename = (file: File, ext: string, suffix = "") => file.name.replace(/\.\w+$/, "") + suffix + ext;
const extOf = (b: Blob) => (b.type === "image/webp" ? ".webp" : ".jpg");

/**
 * Shrinks a screenshot before it is stored: longest side 1920 px and WebP at quality 0.82, typically 5-10x smaller than a raw
 * PNG. The original is kept when it is already small, or when re-encoding would not make it smaller. Animated or vector
 * images (GIF, SVG) and browsers without createImageBitmap pass through unchanged.
 */
export async function compressImage(file: File): Promise<File> {
  if (!canDecode(file)) return file;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file);
    if (file.size <= KEEP_BELOW && Math.max(bmp.width, bmp.height) <= MAX_SIDE) return file;
    const out = await encode(bmp, MAX_SIDE, 0.82);
    if (!out || (!out.scaled && out.blob.size >= file.size)) return file;
    return new File([out.blob], rename(file, extOf(out.blob)), { type: out.blob.type });
  } catch { return file; } finally { bmp?.close(); } // frees the decoded bitmap now instead of whenever it is collected
}

/** A small preview (longest side 640 px) for galleries and cards, so they do not download the full screenshot. Null if it cannot be made. */
export async function makeThumbnail(file: File): Promise<File | null> {
  if (!canDecode(file)) return null;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(file);
    const out = await encode(bmp, THUMB_SIDE, 0.7);
    return out ? new File([out.blob], rename(file, ".webp", ".thumb"), { type: out.blob.type }) : null;
  } catch { return null; } finally { bmp?.close(); }
}

/** Where a screenshot's thumbnail lives: next to the file, so no extra column is needed. Older screenshots have none. */
export const thumbPath = (path: string) => `${path}.thumb.webp`;
