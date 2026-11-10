/**
 * Signed links to private screenshots. A link is the file's path plus an expiry time and an HMAC of both, made with a secret
 * only the Worker knows, so an <img> tag can load the file without sending a login header and nobody can forge or extend a link.
 */
const encoder = new TextEncoder();

const hmacKey = (secret: string, usages: KeyUsage[]) =>
  crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    usages,
  );

const message = (path: string, expires: number) => encoder.encode(`${path}\n${expires}`);

const toHex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** The signature for `path` valid until `expires` (seconds since 1970). */
export async function signPath(secret: string, path: string, expires: number): Promise<string> {
  return toHex(
    await crypto.subtle.sign("HMAC", await hmacKey(secret, ["sign"]), message(path, expires)),
  );
}

/** True when the signature matches the path and expiry and the expiry has not passed. The comparison is constant-time. */
export async function isValidSignature(
  secret: string,
  path: string,
  expires: number,
  signature: string,
  nowSeconds: number,
): Promise<boolean> {
  if (!Number.isFinite(expires) || expires < nowSeconds) return false;
  const bytes = fromHex(signature);
  if (!bytes) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, ["verify"]),
    bytes,
    message(path, expires),
  );
}
