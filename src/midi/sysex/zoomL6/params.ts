/**
 * Parameter registry for the Zoom L6 / L6max editor protocol.
 *
 * This is the single source of truth consumed by the UI (which controls to render, with which
 * range/labels, for which model), the editor session (how to encode/decode values) and the
 * SysEx explorer (which addresses are known).
 *
 * Every entry starts `verified: false` with a **placeholder address in group 0x7F** (never sent
 * by the app). Reverse-engineering captures (see docs/CAPTURE_GUIDE.md) promote entries to
 * `verified: true` with a real address, encoding, range and an `evidence` note.
 */

export type ZoomModel = 'l6' | 'l6max';

export type ParamEncoding =
  /** single 7-bit byte */
  | { kind: 'u7' }
  /** two 7-bit bytes, LSB first (0..16383) */
  | { kind: 'u14le' }
  /** four 7-bit bytes, LSB first */
  | { kind: 'u28le' }
  /** single byte 0/1 */
  | { kind: 'bool' }
  /** single byte index into `labels` */
  | { kind: 'enum'; labels: readonly string[] }
  /** fixed-length ASCII (7-bit) */
  | { kind: 'ascii'; length: number };

export type ParamAddress =
  /** `46 <group> <index>` read / `45 <group> <index> <values…>` write */
  | { scheme: 'param'; group: number; index: number }
  /**
   * `31 <id> <prefix…> <value…>` session command (the family every editable setting is written
   * with; see docs/PROTOCOL.md). `prefix` is a fixed run of argument bytes that select the target
   * (e.g. `[pad]`, `[ch, aux]`, `[effect, param]`); the encoded value bytes follow it. Session
   * writes are **write-only** — the read encoding (`46 …`) is not yet decoded.
   */
  | { scheme: 'session'; id: number; prefix?: number[] }
  /** derived from the Universal Identity Reply, read-only */
  | { scheme: 'identity' };

export type ParamCategory = 'midi' | 'fx' | 'aux' | 'pads' | 'system' | 'recorder' | 'monitor' | 'info';

export interface ParamRange {
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

export interface ParamDef {
  id: ParamId;
  label: string;
  category: ParamCategory;
  address: ParamAddress;
  encoding: ParamEncoding;
  range: ParamRange;
  /** Added to the UI value before encoding (e.g. MIDI channel 1..16 stored as 0..15 → -1). */
  deviceOffset?: number;
  /** Labels for out-of-range sentinel values (e.g. 128 = "Not Mapped"). */
  specialValues?: Readonly<Record<number, string>>;
  models: readonly ZoomModel[];
  readOnly?: boolean;
  /** Only verified entries may be written by the session without `force`. */
  verified: boolean;
  /** Where the address/encoding came from, e.g. "captures/02-midi-out-mode.txt lines 41-44". */
  evidence?: string;
  description?: string;
}

/** Placeholder group: never sent by the app. Explorer sweeps are clamped below it. */
export const PLACEHOLDER_GROUP = 0x7f;

export const EFFECT_TYPES = ['hall', 'room', 'spring', 'delay', 'echo'] as const;
export type EffectType = (typeof EFFECT_TYPES)[number];

type Ch = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type Pad = 1 | 2 | 3 | 4;

export type ParamId =
  | 'midiOutMode'
  | 'mixerControlViaMidi'
  | 'midiChannel'
  | `aux${1 | 2}SendPoint.ch${Ch}`
  | `pad${Pad}.mode`
  | `pad${Pad}.level`
  | `pad${Pad}.note`
  | `pad${Pad}.clockSync`
  | 'batteryType'
  | 'autoPowerOff'
  | 'dateTime'
  | 'recorderMode'
  | 'fx.hall.decay'
  | 'fx.hall.tone'
  | 'fx.room.decay'
  | 'fx.room.tone'
  | 'fx.spring.dwell'
  | 'fx.spring.tone'
  | 'fx.delay.time'
  | 'fx.delay.feedback'
  | 'fx.echo.time'
  | 'fx.echo.repeat'
  | 'monitorPoint'
  | 'subOutPoint'
  | 'usbMixMinus'
  | 'usbAudioMode'
  | 'sdInfo'
  | 'firmwareVersion';

/** Two parameters per internal effect type, in display order. */
export const EFFECT_PARAM_IDS: Readonly<Record<EffectType, readonly [ParamId, ParamId]>> = {
  hall: ['fx.hall.decay', 'fx.hall.tone'],
  room: ['fx.room.decay', 'fx.room.tone'],
  spring: ['fx.spring.dwell', 'fx.spring.tone'],
  delay: ['fx.delay.time', 'fx.delay.feedback'],
  echo: ['fx.echo.time', 'fx.echo.repeat'],
};

const BOTH: readonly ZoomModel[] = ['l6', 'l6max'];
const L6MAX: readonly ZoomModel[] = ['l6max'];

let placeholderIndex = 0;
function placeholder(): ParamAddress {
  return { scheme: 'param', group: PLACEHOLDER_GROUP, index: placeholderIndex++ };
}

type DefInput = Omit<ParamDef, 'address' | 'verified'> & Partial<Pick<ParamDef, 'address' | 'verified'>>;
function def(input: DefInput): ParamDef {
  return { address: placeholder(), verified: false, ...input };
}

const enumEnc = (labels: readonly string[]): ParamEncoding => ({ kind: 'enum', labels });
const enumRange = (labels: readonly string[]): ParamRange => ({ min: 0, max: labels.length - 1, step: 1 });

/** A `31 <id> <prefix…> <value…>` session-command address. */
const session = (id: number, ...prefix: number[]): ParamAddress =>
  prefix.length > 0 ? { scheme: 'session', id, prefix } : { scheme: 'session', id };

const MIDI_OUT_MODES = ['Out', 'Thru'] as const;
const SEND_POINTS = ['Pre Fader', 'Post Fader'] as const;
const PAD_MODES = ['One-shot', 'Loop', 'Hold'] as const;
const BATTERY_TYPES = ['Alkaline', 'Ni-MH', 'Lithium'] as const;
const AUTO_POWER_OFF = ['10 Hours', 'Never'] as const;
const RECORDER_MODES = ['Multi Track', 'Master Only'] as const;
const OUTPUT_POINTS = ['Pre Master Fader', 'Pre Master Fader + Comp', 'Post Master Fader'] as const;
const USB_AUDIO_MODES = ['Stereo mix', 'Multi Track'] as const;

const entries: ParamDef[] = [
  // ── MIDI ────────────────────────────────────────────────────────────────
  def({
    id: 'midiOutMode',
    label: 'MIDI Out Mode',
    category: 'midi',
    address: session(0x0c),
    encoding: enumEnc(MIDI_OUT_MODES),
    range: enumRange(MIDI_OUT_MODES),
    models: BOTH,
    verified: true,
    evidence: 'captures/02-midi-out-mode.txt: 31 0C 00 (Out) / 31 0C 01 (Thru), ack 00 0C',
    description: 'Out: MIDI generated by the mixer (or from USB) is sent to MIDI OUT. Thru: MIDI IN is echoed to MIDI OUT.',
  }),
  def({
    id: 'mixerControlViaMidi',
    label: 'Mixer Control via MIDI',
    category: 'midi',
    address: session(0x03),
    encoding: { kind: 'bool' },
    range: { min: 0, max: 1, step: 1 },
    models: BOTH,
    verified: true,
    evidence: 'captures/03-mixer-control-via-midi.txt: 31 03 00 (off) / 31 03 01 (on), ack 00 03',
    description: 'Allow devices on the MIDI IN/OUT jacks to control the mixer.',
  }),
  def({
    id: 'midiChannel',
    label: 'MIDI Channel',
    category: 'midi',
    address: session(0x0d),
    encoding: { kind: 'u7' },
    range: { min: 1, max: 16, step: 1 },
    deviceOffset: -1,
    models: BOTH,
    verified: true,
    evidence: 'captures/04-midi-channel.txt: 31 0D 00 (CH1) / 31 0D 0F (CH16), value = channel-1, ack 00 0D',
  }),

  // ── Internal effect parameters (31 13 <effect> <param> <lo> <hi>, u14le) ──
  def({ id: 'fx.hall.decay', label: 'Decay', category: 'fx', address: session(0x13, 0, 0), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/05-fx-hall.txt: 31 13 00 00 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.hall.tone', label: 'Tone', category: 'fx', address: session(0x13, 0, 1), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/05-fx-hall.txt: 31 13 00 01 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.room.decay', label: 'Decay', category: 'fx', address: session(0x13, 1, 0), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/06-fx-room.txt: 31 13 01 00 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.room.tone', label: 'Tone', category: 'fx', address: session(0x13, 1, 1), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/06-fx-room.txt: 31 13 01 01 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.spring.dwell', label: 'Dwell', category: 'fx', address: session(0x13, 2, 0), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/07-fx-spring.txt: 31 13 02 00 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.spring.tone', label: 'Tone', category: 'fx', address: session(0x13, 2, 1), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/07-fx-spring.txt: 31 13 02 01 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.delay.time', label: 'Time', category: 'fx', address: session(0x13, 3, 0), encoding: { kind: 'u14le' }, range: { min: 0, max: 2000, unit: 'ms' }, models: BOTH, verified: true, evidence: 'captures/08-fx-delay.txt: 31 13 03 00 <lo> <hi> swept 10..2000 ms (14-bit), ack 00 13' }),
  def({ id: 'fx.delay.feedback', label: 'Feedback', category: 'fx', address: session(0x13, 3, 1), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/08-fx-delay.txt: 31 13 03 01 <lo> <hi> swept 0..100, ack 00 13' }),
  def({ id: 'fx.echo.time', label: 'Time', category: 'fx', address: session(0x13, 4, 0), encoding: { kind: 'u14le' }, range: { min: 0, max: 2000, unit: 'ms' }, models: BOTH, verified: true, evidence: 'captures/09-fx-echo.txt: 31 13 04 00 <lo> <hi> swept 10..2000 ms (14-bit), ack 00 13' }),
  def({ id: 'fx.echo.repeat', label: 'Repeat', category: 'fx', address: session(0x13, 4, 1), encoding: { kind: 'u14le' }, range: { min: 0, max: 100 }, models: BOTH, verified: true, evidence: 'captures/09-fx-echo.txt: 31 13 04 01 <lo> <hi> swept 0..100, ack 00 13' }),

  // ── System ──────────────────────────────────────────────────────────────
  def({ id: 'batteryType', label: 'Battery Type', category: 'system', address: session(0x01), encoding: enumEnc(BATTERY_TYPES), range: enumRange(BATTERY_TYPES), models: BOTH, verified: true, evidence: 'captures/12-device-settings.txt: 31 01 00/01/02 (Alkaline/Ni-MH/Lithium), ack 00 01' }),
  def({ id: 'autoPowerOff', label: 'Auto Power Off', category: 'system', address: session(0x02), encoding: enumEnc(AUTO_POWER_OFF), range: enumRange(AUTO_POWER_OFF), models: BOTH, verified: true, evidence: 'captures/12-device-settings.txt: 31 02 00 (10 Hours) / 31 02 01 (Never), ack 00 02' }),
  def({
    id: 'dateTime',
    label: 'Date & Time',
    category: 'system',
    encoding: { kind: 'ascii', length: 12 },
    range: { min: 0, max: 0 },
    models: BOTH,
    description: 'The official editor pushes the computer clock on connect. Encoding unknown until captured.',
  }),
  def({ id: 'recorderMode', label: 'Recorder Mode', category: 'recorder', address: session(0x04), encoding: enumEnc(RECORDER_MODES), range: enumRange(RECORDER_MODES), models: BOTH, verified: true, evidence: 'captures/13-recorder-mode.txt: 31 04 00 (Multi Track) / 31 04 01 (Master Only), ack 00 04' }),

  // ── L6max-only routing / USB ────────────────────────────────────────────
  def({ id: 'monitorPoint', label: 'Monitor Point', category: 'monitor', address: session(0x19), encoding: enumEnc(OUTPUT_POINTS), range: enumRange(OUTPUT_POINTS), models: L6MAX, verified: true, evidence: 'captures/maxB-monitor-point.txt: 31 19 00/01/02 (Pre/Pre+Comp/Post), ack 00 19' }),
  def({ id: 'subOutPoint', label: 'Sub-Out Point', category: 'monitor', address: session(0x1a), encoding: enumEnc(OUTPUT_POINTS), range: enumRange(OUTPUT_POINTS), models: L6MAX, verified: true, evidence: 'captures/maxC-subout-point.txt: 31 1A 00/01/02 (Pre/Pre+Comp/Post), ack 00 1A' }),
  def({ id: 'usbMixMinus', label: 'USB Mix Minus', category: 'monitor', address: session(0x15), encoding: { kind: 'bool' }, range: { min: 0, max: 1, step: 1 }, models: L6MAX, verified: true, evidence: 'captures/maxD-usb-mix-minus.txt: 31 15 00 (Off) / 31 15 01 (On), ack 00 15' }),
  def({ id: 'usbAudioMode', label: 'USB Audio Mode', category: 'monitor', address: session(0x18), encoding: enumEnc(USB_AUDIO_MODES), range: enumRange(USB_AUDIO_MODES), models: L6MAX, verified: true, evidence: 'captures/maxE-usb-audio-mode.txt: 31 18 00 (Stereo mix) / 31 18 01 (Multi Track), ack 00 18' }),

  // ── Read-only info ──────────────────────────────────────────────────────
  def({
    id: 'sdInfo',
    label: 'microSD card',
    category: 'info',
    encoding: { kind: 'ascii', length: 0 },
    range: { min: 0, max: 0 },
    models: BOTH,
    readOnly: true,
    description: 'Capacity / free space / remaining recording time. Encoding unknown until captured.',
  }),
  def({
    id: 'firmwareVersion',
    label: 'Firmware',
    category: 'info',
    address: { scheme: 'identity' },
    encoding: { kind: 'ascii', length: 4 },
    range: { min: 0, max: 0 },
    models: BOTH,
    readOnly: true,
    verified: true,
    evidence: 'Universal Identity Reply, bytes after the model number (Magicking/L6-MassStorage README §5.1)',
  }),
];

// AUX send points: per channel × AUX 1/2 (31 14 <ch> <aux> <v>). Channels 1–6 captured on the L6
// (captures/10); channels 7–8 exist only on the L6max and were captured there (captures/maxF, AUX1).
// The AUX2 index for ch7/8 isn't in its own capture, but the AUX index semantics are proven on the
// L6 for ch1–6 and the ch7/8 channel index is proven in maxF, so the combination is sound.
for (const aux of [1, 2] as const) {
  for (let ch = 1; ch <= 8; ch++) {
    const hi = (n: number) => n.toString(16).padStart(2, '0');
    const evidence =
      ch <= 6
        ? `captures/10-aux-send-point.txt: 31 14 ${hi(ch - 1)} ${hi(aux - 1)} 00/01 (Pre/Post), ack 00 14`
        : `captures/maxF-aux78.txt: 31 14 ${hi(ch - 1)} 00 00/01 (ch${ch} AUX1 Pre/Post), ack 00 14` +
          (aux === 2 ? '; AUX2 (aux index 1) per the proven L6 pattern in captures/10' : '');
    entries.push(
      def({
        id: `aux${aux}SendPoint.ch${ch as Ch}`,
        label: `AUX ${aux} send point (ch ${ch})`,
        category: 'aux',
        address: session(0x14, ch - 1, aux - 1),
        encoding: enumEnc(SEND_POINTS),
        range: enumRange(SEND_POINTS),
        models: ch <= 6 ? BOTH : L6MAX,
        verified: true,
        evidence,
      }),
    );
  }
}

// Sound pads 1–4.
for (let pad = 1; pad <= 4; pad++) {
  const p = pad as Pad;
  const padIx = pad - 1;
  entries.push(
    def({
      id: `pad${p}.mode`,
      label: `Pad ${p} play mode`,
      category: 'pads',
      address: session(0x06, padIx),
      encoding: enumEnc(PAD_MODES),
      range: enumRange(PAD_MODES),
      models: BOTH,
      verified: true,
      evidence: `captures/11-sound-pad.txt: 31 06 ${padIx.toString(16).padStart(2, '0')} 00/01/02 (One-shot/Loop/Hold), ack 00 06`,
    }),
    def({
      id: `pad${p}.level`,
      label: `Pad ${p} level`,
      category: 'pads',
      address: session(0x07, padIx),
      encoding: { kind: 'u7' },
      range: { min: 0, max: 0x3b, unit: 'dB' },
      models: BOTH,
      verified: true,
      evidence: `captures/11-sound-pad.txt: 31 07 ${padIx.toString(16).padStart(2, '0')} <v> where v 0x00..0x3B maps to −∞ … +10 dB, ack 00 07`,
    }),
    def({
      id: `pad${p}.note`,
      label: `Pad ${p} MIDI note`,
      category: 'pads',
      // Wire layout is `31 0F <pad> <note> <mapped-flag>`: note byte then a flag (0 mapped / 1 not
      // mapped). Encoded as u14le so note N → [N, 0] and the "Not Mapped" sentinel 128 → [0, 1].
      address: session(0x0f, padIx),
      encoding: { kind: 'u14le' },
      range: { min: 0, max: 127, step: 1 },
      specialValues: { 128: 'Not Mapped' },
      models: BOTH,
      verified: true,
      evidence: `captures/11-sound-pad.txt: 31 0F ${padIx.toString(16).padStart(2, '0')} <note> 00 (mapped) / 31 0F ${padIx.toString(16).padStart(2, '0')} 00 01 (Not Mapped → value 128), ack 00 0F`,
    }),
    def({
      id: `pad${p}.clockSync`,
      label: `Pad ${p} MIDI clock sync`,
      category: 'pads',
      address: session(0x17, padIx),
      encoding: { kind: 'bool' },
      range: { min: 0, max: 1, step: 1 },
      models: L6MAX,
      verified: true,
      evidence: `captures/maxG-pad-clock-sync.txt: 31 17 00 00/01 (pad 1 Off/On), ack 00 17; pads 2-4 use the same <pad> index as 0x06/07/0F`,
    }),
  );
}

export const zoomL6Params: Readonly<Record<ParamId, ParamDef>> = Object.freeze(
  Object.fromEntries(entries.map((e) => [e.id, e])) as Record<ParamId, ParamDef>,
);

export const zoomL6ParamList: readonly ParamDef[] = Object.freeze(entries.slice());

export interface ListParamsFilter {
  model?: ZoomModel;
  verifiedOnly?: boolean;
  category?: ParamCategory;
}

export function listParams(filter: ListParamsFilter = {}): ParamDef[] {
  return zoomL6ParamList.filter(
    (p) =>
      (filter.model === undefined || p.models.includes(filter.model)) &&
      (!filter.verifiedOnly || p.verified) &&
      (filter.category === undefined || p.category === filter.category),
  );
}

export function getParam(id: ParamId): ParamDef {
  const p = zoomL6Params[id];
  if (!p) throw new Error(`Unknown parameter id: ${id}`);
  return p;
}

export function addressKey(a: ParamAddress): string {
  switch (a.scheme) {
    case 'param': return `param:${a.group}:${a.index}`;
    case 'session': return `session:${a.id}:${(a.prefix ?? []).join(',')}`;
    case 'identity': return 'identity';
  }
}

const byAddress = new Map<string, ParamDef>(zoomL6ParamList.map((p) => [addressKey(p.address), p]));

export function findParamByAddress(a: ParamAddress): ParamDef | undefined {
  return byAddress.get(addressKey(a));
}

/** Byte width of a value with this encoding (0 = variable/unknown). */
export function encodingWidth(enc: ParamEncoding): number {
  switch (enc.kind) {
    case 'u7':
    case 'bool':
    case 'enum':
      return 1;
    case 'u14le':
      return 2;
    case 'u28le':
      return 4;
    case 'ascii':
      return enc.length;
  }
}
