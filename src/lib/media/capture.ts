import { toPng } from "html-to-image";

/** Saves a DOM element (a calendar, a chart) as a 2x PNG with the current theme's background. */
export async function downloadElementPng(el: HTMLElement, filename: string) {
  const bg = getComputedStyle(document.body).backgroundColor;
  const url = await toPng(el, { pixelRatio: 2, cacheBust: true, backgroundColor: bg, filter: (n) => !(n instanceof HTMLElement && n.dataset.noCapture !== undefined) });
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
}
