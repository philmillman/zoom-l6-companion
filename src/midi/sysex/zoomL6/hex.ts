/** Hex helpers shared by the debugger, explorer and capture decoder. */

/** `[0xf0, 0x52]` → `"F0 52"` (uppercase, space separated). */
export function bytesToHex(bytes: readonly number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

/**
 * Parses loosely formatted hex into bytes. Accepts `F0 52 00`, `f05200`, `$F0,$52`, `0xF0 0x52`,
 * commas/newlines as separators. Throws on odd digit counts or non-hex input.
 */
export function hexToBytes(text: string): number[] {
  const cleaned = text
    .replace(/0x/gi, ' ')
    .replace(/\$/g, ' ')
    .replace(/[,\n\r\t]/g, ' ')
    .trim();
  if (cleaned === '') return [];
  const tokens = cleaned.split(/\s+/);
  const out: number[] = [];
  for (const token of tokens) {
    if (!/^[0-9a-fA-F]+$/.test(token)) {
      throw new RangeError(`Invalid hex token: "${token}"`);
    }
    if (token.length % 2 !== 0) {
      throw new RangeError(`Odd number of hex digits in "${token}"`);
    }
    for (let i = 0; i < token.length; i += 2) {
      out.push(parseInt(token.slice(i, i + 2), 16));
    }
  }
  return out;
}
