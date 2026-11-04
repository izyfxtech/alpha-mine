/**
 * Allow-list sanitiser for the rich-text notes (notebook, sessions, backtests, alternatives). They are stored as HTML and put back
 * into the page with innerHTML, so anything stored must be harmless when loaded: no scripts, no event handlers, no javascript: URLs.
 */
const ALLOWED_TAGS = new Set(["A", "B", "STRONG", "I", "EM", "U", "S", "BR", "P", "DIV", "SPAN", "H1", "H2", "H3", "H4", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "HR", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "IMG", "FONT"]);
const ALLOWED_ATTRS = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "style", "align", "target", "rel", "color", "size"]);
const SAFE_URL = /^(https?:|mailto:)/i;

/** A URL a person typed into the Link or Image prompt: http, https or mailto only (images: http and https). */
export function safeUrl(raw: string, kind: "link" | "image" = "link"): string | null {
  const t = raw.trim();
  if (!t) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`;
  if (!SAFE_URL.test(withScheme)) return null;
  if (kind === "image" && /^mailto:/i.test(withScheme)) return null;
  return withScheme;
}

export function sanitizeHtml(html: string): string {
  if (!html || typeof DOMParser === "undefined") return typeof DOMParser === "undefined" ? "" : html;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const walk = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName)) {
        // Drop dangerous elements whole; unwrap harmless unknown ones so their text survives.
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|LINK|META|FORM|INPUT|BUTTON|SVG|MATH|TEXTAREA|SELECT|BASE|NOSCRIPT)$/.test(child.tagName)) { child.remove(); continue; }
        walk(child);
        child.replaceWith(...child.childNodes);
        continue;
      }
      for (const a of [...child.attributes]) {
        const name = a.name.toLowerCase();
        if (!ALLOWED_ATTRS.has(name) || name.startsWith("on")) { child.removeAttribute(a.name); continue; }
        if ((name === "href" || name === "src") && !SAFE_URL.test(a.value.trim())) child.removeAttribute(a.name);
        if (name === "style" && /(expression|url\s*\(|javascript:|@import)/i.test(a.value)) child.removeAttribute(a.name);
      }
      if (child.tagName === "A") { child.setAttribute("rel", "noopener noreferrer"); if (child.getAttribute("target")) child.setAttribute("target", "_blank"); }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
