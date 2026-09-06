/**
 * Parses text copied from snoize MIDI Monitor (Select All -> Copy) into structured SysEx events.
 * See docs/CAPTURE_GUIDE.md for how a capture is produced.
 *
 * One event per line, tab-separated, no header: Time / Source / Message / Chan / Data.
 * - Source is `From <port>` (device->host) or `To <port>` (spied output, host->device).
 * - Message is exactly `SysEx` for SysEx rows; other rows are skipped.
 * - Data in Expert mode is plain hex (`F0 52 00 00 2B F7`); in normal mode there is an extra
 *   `ZOOM Corporation 6 bytes` cell before the hex, so the LAST cell that looks like hex data
 *   wins. Hex may be truncated after 255 data bytes, ending in an ellipsis.
 */

export type CaptureDirection = 'host→device' | 'device→host' | 'unknown';

export interface CaptureEvent {
  line: number;
  time: string;
  port: string;
  dir: CaptureDirection;
  type: string;
  bytes: number[];
  truncated: boolean;
}

const HEX_BYTE = String.raw`\$?[0-9A-Fa-f]{2}`;
const ELLIPSIS = String.raw`(?:…|\.\.\.)`;
/** Matches a whole cell of space-separated hex bytes, optionally `$`-prefixed, optionally truncated. */
const DATA_CELL_RE = new RegExp(`^(${HEX_BYTE})(?: (${HEX_BYTE}))*\\s*(${ELLIPSIS})?$`);
const ELLIPSIS_SUFFIX_RE = new RegExp(`\\s*${ELLIPSIS}\\s*$`);

function looksLikeHexData(cell: string): boolean {
  const trimmed = cell.trim();
  if (trimmed === '') return false;
  return DATA_CELL_RE.test(trimmed);
}

function decodeHexCell(cell: string): { bytes: number[]; truncated: boolean } {
  const trimmed = cell.trim();
  const truncated = ELLIPSIS_SUFFIX_RE.test(trimmed);
  const withoutEllipsis = trimmed.replace(ELLIPSIS_SUFFIX_RE, '').trim();
  const tokens = withoutEllipsis.length ? withoutEllipsis.split(/\s+/) : [];
  const bytes = tokens.map((tok) => parseInt(tok.replace(/^\$/, ''), 16));
  return { bytes, truncated };
}

/** Fallback direction guess from the opcode byte when the Source column has no `From `/`To ` prefix. */
function directionFromOpcode(bytes: readonly number[]): CaptureDirection {
  const opcode = bytes[4];
  if (opcode === undefined) return 'unknown';
  if (opcode === 0x46 || opcode === 0x2b || opcode === 0x31) return 'host→device';
  if (opcode === 0x2a || opcode === 0x00) return 'device→host';
  return 'unknown';
}

function parseSource(source: string): { dir: CaptureDirection; port: string } {
  const trimmed = source.trim();
  if (trimmed.startsWith('From ')) return { dir: 'device→host', port: trimmed.slice('From '.length).trim() };
  if (trimmed.startsWith('To ')) return { dir: 'host→device', port: trimmed.slice('To '.length).trim() };
  return { dir: 'unknown', port: trimmed };
}

/** Parses MIDI Monitor clipboard text into SysEx capture events. Never throws on malformed input. */
export function parseMidiMonitorText(text: string): CaptureEvent[] {
  const lines = text.split(/\r\n|\r|\n/);
  const events: CaptureEvent[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]!;
    if (rawLine.trim() === '') continue;

    const cells = rawLine.split('\t');
    if (cells.length < 3) continue;

    const time = (cells[0] ?? '').trim();
    const source = cells[1] ?? '';
    const message = (cells[2] ?? '').trim();
    if (message !== 'SysEx') continue;

    let dataCell: string | null = null;
    for (let c = cells.length - 1; c >= 3; c--) {
      const cell = cells[c] ?? '';
      if (looksLikeHexData(cell)) {
        dataCell = cell;
        break;
      }
    }
    if (dataCell === null) continue;

    const { bytes, truncated } = decodeHexCell(dataCell);
    if (bytes.length === 0) continue;

    const { dir: prefixDir, port } = parseSource(source);
    const dir = prefixDir === 'unknown' ? directionFromOpcode(bytes) : prefixDir;

    events.push({
      line: i + 1,
      time,
      port,
      dir,
      type: message,
      bytes,
      truncated,
    });
  }

  return events;
}
