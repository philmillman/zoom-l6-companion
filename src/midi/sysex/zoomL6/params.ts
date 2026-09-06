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
  /** `31 <id> <value…>` session command (like file transfer) */
  | { scheme: 'session'; id: number }
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
    encoding: enumEnc(MIDI_OUT_MODES),
    range: enumRange(MIDI_OUT_MODES),
    models: BOTH,
    description: 'Out: MIDI generated by the mixer (or from USB) is sent to MIDI OUT. Thru: MIDI IN is echoed to MIDI OUT.',
  }),
  def({
    id: 'mixerControlViaMidi',
    label: 'Mixer Control via MIDI',
    category: 'midi',
    encoding: { kind: 'bool' },
    range: { min: 0, max: 1, step: 1 },
    models: BOTH,
    description: 'Allow devices on the MIDI IN/OUT jacks to control the mixer.',
  }),
  def({
    id: 'midiChannel',
    label: 'MIDI Channel',
    category: 'midi',
    encoding: { kind: 'u7' },
    range: { min: 1, max: 16, step: 1 },
    deviceOffset: -1,
    models: BOTH,
  }),

  // ── Internal effect parameters ──────────────────────────────────────────
  def({ id: 'fx.hall.decay', label: 'Decay', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.hall.tone', label: 'Tone', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.room.decay', label: 'Decay', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.room.tone', label: 'Tone', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.spring.dwell', label: 'Dwell', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.spring.tone', label: 'Tone', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.delay.time', label: 'Time', category: 'fx', encoding: { kind: 'u14le' }, range: { min: 0, max: 2000, unit: 'ms' }, models: BOTH }),
  def({ id: 'fx.delay.feedback', label: 'Feedback', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),
  def({ id: 'fx.echo.time', label: 'Time', category: 'fx', encoding: { kind: 'u14le' }, range: { min: 0, max: 2000, unit: 'ms' }, models: BOTH }),
  def({ id: 'fx.echo.repeat', label: 'Repeat', category: 'fx', encoding: { kind: 'u7' }, range: { min: 0, max: 100 }, models: BOTH }),

  // ── System ──────────────────────────────────────────────────────────────
  def({ id: 'batteryType', label: 'Battery Type', category: 'system', encoding: enumEnc(BATTERY_TYPES), range: enumRange(BATTERY_TYPES), models: BOTH }),
  def({ id: 'autoPowerOff', label: 'Auto Power Off', category: 'system', encoding: enumEnc(AUTO_POWER_OFF), range: enumRange(AUTO_POWER_OFF), models: BOTH }),
  def({
    id: 'dateTime',
    label: 'Date & Time',
    category: 'system',
    encoding: { kind: 'ascii', length: 12 },
    range: { min: 0, max: 0 },
    models: BOTH,
    description: 'The official editor pushes the computer clock on connect. Encoding unknown until captured.',
  }),
  def({ id: 'recorderMode', label: 'Recorder Mode', category: 'recorder', encoding: enumEnc(RECORDER_MODES), range: enumRange(RECORDER_MODES), models: BOTH }),

  // ── L6max-only routing / USB ────────────────────────────────────────────
  def({ id: 'monitorPoint', label: 'Monitor Point', category: 'monitor', encoding: enumEnc(OUTPUT_POINTS), range: enumRange(OUTPUT_POINTS), models: L6MAX }),
  def({ id: 'subOutPoint', label: 'Sub-Out Point', category: 'monitor', encoding: enumEnc(OUTPUT_POINTS), range: enumRange(OUTPUT_POINTS), models: L6MAX }),
  def({ id: 'usbMixMinus', label: 'USB Mix Minus', category: 'monitor', encoding: { kind: 'bool' }, range: { min: 0, max: 1, step: 1 }, models: L6MAX }),
  def({ id: 'usbAudioMode', label: 'USB Audio Mode', category: 'monitor', encoding: enumEnc(USB_AUDIO_MODES), range: enumRange(USB_AUDIO_MODES), models: L6MAX }),

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

// AUX send points: per channel × AUX 1/2. Channels 7–8 exist only on the L6max.
for (const aux of [1, 2] as const) {
  for (let ch = 1; ch <= 8; ch++) {
    entries.push(
      def({
        id: `aux${aux}SendPoint.ch${ch as Ch}`,
        label: `AUX ${aux} send point (ch ${ch})`,
        category: 'aux',
        encoding: enumEnc(SEND_POINTS),
        range: enumRange(SEND_POINTS),
        models: ch <= 6 ? BOTH : L6MAX,
      }),
    );
  }
}

// Sound pads 1–4.
for (let pad = 1; pad <= 4; pad++) {
  const p = pad as Pad;
  entries.push(
    def({ id: `pad${p}.mode`, label: `Pad ${p} play mode`, category: 'pads', encoding: enumEnc(PAD_MODES), range: enumRange(PAD_MODES), models: BOTH }),
    def({
      id: `pad${p}.level`,
      label: `Pad ${p} level`,
      category: 'pads',
      encoding: { kind: 'u7' },
      range: { min: 0, max: 127, unit: 'dB' },
      models: BOTH,
      description: 'Editor shows −∞ … +10 dB; step encoding unknown until captured.',
    }),
    def({
      id: `pad${p}.note`,
      label: `Pad ${p} MIDI note`,
      category: 'pads',
      encoding: { kind: 'u7' },
      range: { min: 0, max: 127, step: 1 },
      models: BOTH,
      description: 'The editor also offers "Not Mapped"; its sentinel value is unknown until captured.',
    }),
    def({ id: `pad${p}.clockSync`, label: `Pad ${p} MIDI clock sync`, category: 'pads', encoding: { kind: 'bool' }, range: { min: 0, max: 1, step: 1 }, models: L6MAX }),
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
    case 'session': return `session:${a.id}`;
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
