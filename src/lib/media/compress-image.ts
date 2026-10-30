const MAX_BYTES = 1_500_000; // above this a screenshot is recompressed instead of being rejected by storage limits
const MAX_SIDE = 2400;

/** Shrinks large raster images (scale down + JPEG) so uploads stay fast; small or non-raster files pass through. */
export async function compressImage(file: File): Promise<File> {
  if (file.size <= MAX_BYTES || !/^image\/(png|jpe?g|webp|bmp)$/i.test(file.type) || typeof createImageBitmap === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // JPEG has no transparency
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    for (const q of [0.85, 0.7, 0.55]) {
      const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", q));
      if (blob && (blob.size <= MAX_BYTES || q === 0.55)) return blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    }
    return file;
  } catch { return file; }
}
