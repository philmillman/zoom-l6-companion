/**
 * Zoom LiveTrak L6 SysEx constants and message builders.
 * Reverse-engineered; see Magicking/L6-MassStorage (README + zooml6_info.py) and docs/PROTOCOL.md.
 *
 * Envelope: F0 52 <device 00> <model 00> <cmd> <body…> F7
 */

export const SYSEX_START = 0xf0;
export const SYSEX_END = 0xf7;

/** `F0 52 00 00` — Zoom manufacturer, device 0 (broadcast), model 0 (L6). */
export const ZOOM_HDR = Object.freeze([SYSEX_START, 0x52, 0x00, 0x00] as const);

export const ZoomCmd = {
  /** Device → host acknowledgement: `00 <code>` (code echoes the session command id, e.g. 0B, 09). */
  Ack: 0x00,
  /** Device → host reply to EditorOpen: `2A 03 <state/capabilities blob>`. */
  EditorOpenReply: 0x2a,
  /** Host → device: start an editor session. */
  EditorOpen: 0x2b,
  /** Host → device session command: `31 <id> <args…>` (0B heartbeat, 09 file transfer, 00 state sync). */
  Session: 0x31,
  /** Host → device set parameter `45 <group> <index> <values…>`; also device → host reply to GetParam. */
  SetParam: 0x45,
  /** Host → device get parameter `46 <group> <index>`. */
  GetParam: 0x46,
  /** Scene / track info `67 <subtype> …`. */
  Scene: 0x67,
} as const;
export type ZoomCmd = (typeof ZoomCmd)[keyof typeof ZoomCmd];

export const SessionCmdId = {
  StateSync: 0x00,
  FileTransfer: 0x09,
  Heartbeat: 0x0b,
} as const;

export const zoomL6Sysex = {
  identityRequest: Object.freeze([0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7] as const),
  editorOpen: Object.freeze([0xf0, 0x52, 0x00, 0x00, 0x2b, 0xf7] as const),
  /** Editor keep-alive (~100 ms in real Zoom editor); primes session before file-transfer OFF in FS mode. */
  heartbeat: Object.freeze([0xf0, 0x52, 0x00, 0x00, 0x31, 0x0b, 0xf7] as const),
  activateFileTransfer: Object.freeze([0xf0, 0x52, 0x00, 0x00, 0x31, 0x09, 0x01, 0xf7] as const),
  deactivateFileTransfer: Object.freeze([0xf0, 0x52, 0x00, 0x00, 0x31, 0x09, 0x00, 0xf7] as const),
} as const;

function assertDataByte(b: number, what: string): void {
  if (!Number.isInteger(b) || b < 0 || b > 0x7f) {
    throw new RangeError(`${what} must be an integer in 0..127, got ${b}`);
  }
}

/** Builds `F0 52 00 00 <cmd> <body…> F7`, validating every body byte is 7-bit. */
export function zoomMsg(cmd: number, ...body: number[]): number[] {
  assertDataByte(cmd, 'command byte');
  body.forEach((b, i) => assertDataByte(b, `body[${i}]`));
  return [...ZOOM_HDR, cmd, ...body, SYSEX_END];
}

/** `46 <group> <index>` — ask the device for a parameter value (reply is `45 <group> <index> <values…>`). */
export function buildGetParam(group: number, index: number): number[] {
  return zoomMsg(ZoomCmd.GetParam, group, index);
}

/** `45 <group> <index> <values…>` — write a parameter value (device answers with `00 <code>`). */
export function buildSetParam(group: number, index: number, values: readonly number[]): number[] {
  return zoomMsg(ZoomCmd.SetParam, group, index, ...values);
}

/** `31 <id> <args…>` — session command (heartbeat 0B, file transfer 09 <0|1>, state sync 00 …). */
export function buildSessionCmd(id: number, ...args: number[]): number[] {
  return zoomMsg(ZoomCmd.Session, id, ...args);
}

/** `67 <subtype>` — scene / track information request (observed subtype 01). */
export function buildSceneInfoRequest(subtype = 0x01): number[] {
  return zoomMsg(ZoomCmd.Scene, subtype);
}

/** Verbatim "capability set" the official editor sends after EditorOpen (`45 05 02 00 00 00 00 00 27 00`). */
export function buildCapabilitiesSet(): number[] {
  return zoomMsg(ZoomCmd.SetParam, 0x05, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x27, 0x00);
}
