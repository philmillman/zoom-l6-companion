/**
 * Direction-agnostic classifier for Zoom L6 SysEx. Used by the editor session, the SysEx
 * explorer and the capture decoder. Never throws on malformed input; returns `notZoom`/`unknownZoom`.
 */
import { ZoomCmd, SessionCmdId } from './messages';

export type ZoomL6Message =
  | { kind: 'identityRequest'; deviceId: number }
  | {
      kind: 'identityReply';
      deviceId: number;
      manufacturer: number;
      family: number[];
      member: number[];
      firmware: string;
    }
  | { kind: 'editorOpen' }
  | {
      kind: 'editorOpenState';
      subtype: number;
      flags: number[];
      supportedIds: number[];
      tail: number[];
      /** Everything after the 2A opcode (excluding F7). */
      payload: number[];
    }
  | { kind: 'heartbeat' }
  | { kind: 'heartbeatAck' }
  | { kind: 'fileTransfer'; enable: boolean }
  | { kind: 'sessionCmd'; id: number; args: number[] }
  | { kind: 'getParam'; group: number; index: number }
  /** `45 …` in either direction: host write, or device reply to `46`. */
  | { kind: 'paramValue'; group: number; index: number; values: number[] }
  | { kind: 'genericAck'; code: number; args: number[] }
  | { kind: 'sceneInfo'; subtype: number; data: number[] }
  | { kind: 'unknownZoom'; cmd: number; body: number[] }
  | { kind: 'notZoom' };

export type ParsedZoomL6Message = ZoomL6Message & { raw: number[] };
export type ZoomL6MessageKind = ZoomL6Message['kind'];

/** True for `F0 52 00 00 …` (Zoom header, device 0, model 0). */
export function isZoomL6(bytes: readonly number[]): boolean {
  return bytes.length >= 5 && bytes[0] === 0xf0 && bytes[1] === 0x52 && bytes[2] === 0x00 && bytes[3] === 0x00;
}

function stripEnd(bytes: readonly number[]): number[] {
  const arr = Array.from(bytes);
  if (arr.length && arr[arr.length - 1] === 0xf7) arr.pop();
  return arr;
}

function parseUniversal(bytes: readonly number[]): ZoomL6Message | null {
  // F0 7E <dev> 06 01 F7 / F0 7E <dev> 06 02 <mfr> <f1 f2> <m1 m2> <fw…> F7
  if (bytes.length < 5 || bytes[0] !== 0xf0 || bytes[1] !== 0x7e || bytes[3] !== 0x06) return null;
  const deviceId = bytes[2] ?? 0;
  if (bytes[4] === 0x01) return { kind: 'identityRequest', deviceId };
  if (bytes[4] === 0x02) {
    const body = stripEnd(bytes);
    const manufacturer = body[5] ?? 0;
    const family = body.slice(6, 8);
    const member = body.slice(8, 10);
    const fwBytes = body.slice(10).filter((b) => b !== 0);
    const firmware = String.fromCharCode(...fwBytes);
    return { kind: 'identityReply', deviceId, manufacturer, family, member, firmware };
  }
  return null;
}

/**
 * The `2A 03 …` editor-open reply carries a `<subtype> <flags> … <supported command ids> … <state>`
 * blob whose exact framing is not fully reverse-engineered yet. In real captures the id list is an
 * ascending run of the session-command ids the editor may address (`01 02 03 … 41`) that sits
 * *after* an interior run of zero bytes, so the old "collect until the first 00 00" heuristic
 * stopped almost immediately and returned garbage. Until the framing is verified we treat `payload` as the source of truth and derive `supportedIds`
 * heuristically as the longest strictly-ascending contiguous run after the flag region. `flags`
 * and `tail` are best-effort and may change once the layout is confirmed.
 */
function extractSupportedIds(payload: number[], start: number): { ids: number[]; runStart: number; runEnd: number } {
  let bestStart = start;
  let bestEnd = start;
  let curStart = start;
  for (let i = start; i < payload.length; i++) {
    const isAscending = i > curStart && payload[i]! > payload[i - 1]! && payload[i]! !== 0x00;
    if (payload[i]! === 0x00) {
      curStart = i + 1;
      continue;
    }
    if (!isAscending && i > curStart) curStart = i;
    if (i - curStart > bestEnd - bestStart) {
      bestStart = curStart;
      bestEnd = i;
    }
  }
  return { ids: payload.slice(bestStart, bestEnd + 1), runStart: bestStart, runEnd: bestEnd };
}

function parseEditorOpenState(payload: number[]): ZoomL6Message {
  const subtype = payload[0] ?? 0;
  const flags = payload.slice(1, 10);
  const { ids: supportedIds, runEnd } = extractSupportedIds(payload, 10);
  const tail = supportedIds.length > 0 ? payload.slice(runEnd + 1) : payload.slice(10);
  return { kind: 'editorOpenState', subtype, flags, supportedIds, tail, payload };
}

export function parseZoomL6(bytes: readonly number[]): ParsedZoomL6Message {
  const raw = Array.from(bytes);
  const universal = parseUniversal(raw);
  if (universal) return { ...universal, raw };
  if (!isZoomL6(raw)) return { kind: 'notZoom', raw };

  const cmd = raw[4]!;
  const body = stripEnd(raw).slice(5);
  const b0 = body[0];

  switch (cmd) {
    case ZoomCmd.EditorOpen:
      return { kind: 'editorOpen', raw };
    case ZoomCmd.EditorOpenReply:
      return { ...parseEditorOpenState(body), raw };
    case ZoomCmd.Session:
      if (b0 === SessionCmdId.Heartbeat && body.length === 1) return { kind: 'heartbeat', raw };
      if (b0 === SessionCmdId.FileTransfer && body.length === 2) {
        return { kind: 'fileTransfer', enable: body[1] === 0x01, raw };
      }
      return { kind: 'sessionCmd', id: b0 ?? -1, args: body.slice(1), raw };
    case ZoomCmd.Ack:
      if (b0 === SessionCmdId.Heartbeat && body.length === 1) return { kind: 'heartbeatAck', raw };
      return { kind: 'genericAck', code: b0 ?? -1, args: body.slice(1), raw };
    case ZoomCmd.GetParam:
      return { kind: 'getParam', group: body[0] ?? -1, index: body[1] ?? -1, raw };
    case ZoomCmd.SetParam:
      return { kind: 'paramValue', group: body[0] ?? -1, index: body[1] ?? -1, values: body.slice(2), raw };
    case ZoomCmd.Scene:
      return { kind: 'sceneInfo', subtype: b0 ?? -1, data: body.slice(1), raw };
    default:
      return { kind: 'unknownZoom', cmd, body, raw };
  }
}

/** Human-readable one-liner for logs and reports. */
export function describeZoomL6(m: ZoomL6Message): string {
  switch (m.kind) {
    case 'identityRequest': return 'Identity request';
    case 'identityReply': return `Identity reply (mfr 0x${m.manufacturer.toString(16)}, fw ${m.firmware || '?'})`;
    case 'editorOpen': return 'Editor open';
    case 'editorOpenState': return `Editor open reply (subtype ${m.subtype}, ${m.supportedIds.length} ids, ${m.payload.length} bytes)`;
    case 'heartbeat': return 'Heartbeat';
    case 'heartbeatAck': return 'Heartbeat ack';
    case 'fileTransfer': return `File transfer ${m.enable ? 'ON' : 'OFF'}`;
    case 'sessionCmd': return `Session cmd 0x${m.id.toString(16).padStart(2, '0')} [${m.args.length} bytes]`;
    case 'getParam': return `Get param ${m.group}:${m.index}`;
    case 'paramValue': return `Param ${m.group}:${m.index} = [${m.values.join(' ')}]`;
    case 'genericAck': return `Ack 0x${m.code.toString(16).padStart(2, '0')}`;
    case 'sceneInfo': return `Scene info (subtype ${m.subtype}, ${m.data.length} bytes)`;
    case 'unknownZoom': return `Unknown Zoom cmd 0x${m.cmd.toString(16).padStart(2, '0')} [${m.body.length} bytes]`;
    case 'notZoom': return 'Non-Zoom SysEx';
  }
}
