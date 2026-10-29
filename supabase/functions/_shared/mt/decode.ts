/** Bytes -> text for MetaTrader exports. MT5 writes UTF-16LE (with or without a BOM); MT4 usually writes UTF-8/ANSI. */
export function decodeText(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  // BOM-less UTF-16LE: ASCII text has a NUL every second byte.
  if (bytes.length > 4 && bytes[1] === 0 && bytes[3] === 0)
    return new TextDecoder("utf-16le").decode(bytes);
  return new TextDecoder("utf-8").decode(bytes);
}

/** "PK": an .xlsx is a zip container. */
export function isXlsx(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b;
}
