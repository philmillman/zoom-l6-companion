// MIDI CC Configuration for Zoom L6
// Based on typical Zoom L6 MIDI implementation

export interface MIDIControl {
  name: string;
  cc: number;
  channel: number;
  min: number;
  max: number;
  defaultValue: number;
  type: 'fader' | 'knob' | 'button' | 'toggle' | 'radio';
  options?: { label: string; value: number }[];
}

export interface ChannelControls {
  channel: number;
  controls: {
    volume: MIDIControl;
    pan: MIDIControl;
    eq: {
      high: MIDIControl;
      mid: MIDIControl;
      midFreq: MIDIControl;
      low: MIDIControl;
    };
    aux1: MIDIControl;
    aux2: MIDIControl;
    efxSend: MIDIControl;
    mute: MIDIControl;
    // Optional per-channel toggles
    monoX2?: MIDIControl; // Only for channels 3 and 4
    usb12?: MIDIControl;  // Only for channel 5
    usb34?: MIDIControl;  // Only for channel 6
  };
}

export interface GlobalControls {
  efxType: MIDIControl;
  compressor: MIDIControl;
}

export interface SoundPad {
  id: number;
  name: string;
  note: number; // MIDI note number
  channel: number;
}

// Channel strip MIDI CC mappings (typical values - may need adjustment based on actual device)
export const channelControls: ChannelControls[] = [
  // Channel 1
  {
    channel: 1,
    controls: {
      volume: { name: 'Level', cc: 83, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'Pan', cc: 73, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'High', cc: 1, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'Mid', cc: 21, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'Mid Freq', cc: 11, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'Low', cc: 33, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'AUX1', cc: 43, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'AUX2', cc: 53, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'EFX', cc: 63, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'Mute', cc: 93, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 2
  {
    channel: 2,
    controls: {
      volume: { name: 'Level', cc: 84, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'Pan', cc: 74, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'High', cc: 2, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'Mid', cc: 22, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'Mid Freq', cc: 12, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'Low', cc: 34, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'AUX1', cc: 44, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'AUX2', cc: 54, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'EFX', cc: 64, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'Mute', cc: 94, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 3
  {
    channel: 3,
    controls: {
      volume: { name: 'Level', cc: 85, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'Pan', cc: 75, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'High', cc: 3, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'Mid', cc: 23, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'Mid Freq', cc: 13, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'Low', cc: 35, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'AUX1', cc: 45, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'AUX2', cc: 55, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'EFX', cc: 65, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'Mute', cc: 95, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      monoX2: { name: 'MONO x2', cc: 109, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 4
  {
    channel: 4,
    controls: {
      volume: { name: 'Level', cc: 86, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'Pan', cc: 76, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'High', cc: 4, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'Mid', cc: 24, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'Mid Freq', cc: 14, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'Low', cc: 36, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'AUX1', cc: 46, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'AUX2', cc: 56, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'EFX', cc: 66, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'Mute', cc: 102, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      monoX2: { name: 'MONO x2', cc: 110, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 5
  {
    channel: 5,
    controls: {
      volume: { name: 'Level', cc: 87, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'Pan', cc: 77, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'High', cc: 5, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'Mid', cc: 25, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'Mid Freq', cc: 15, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'Low', cc: 37, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'AUX1', cc: 47, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'AUX2', cc: 57, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'EFX', cc: 67, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'Mute', cc: 103, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      usb12: { name: 'USB 1/2', cc: 113, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 6
  {
    channel: 6,
    controls: {
      volume: { name: 'Level', cc: 88, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'Pan', cc: 78, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'High', cc: 6, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'Mid', cc: 26, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'Mid Freq', cc: 16, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'Low', cc: 38, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'AUX1', cc: 48, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'AUX2', cc: 58, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'EFX', cc: 68, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'Mute', cc: 104, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      usb34: { name: 'USB 3/4', cc: 114, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  }
];

// Global controls
export const globalControls: GlobalControls = {
  efxType: {
    name: 'EFX Type',
    cc: 117,
    channel: 1,
    min: 0,
    max: 127,
    defaultValue: 1,
    type: 'radio',
    options: [
      { label: 'Hall', value: 1 },
      { label: 'Room', value: 26 },
      { label: 'Spring', value: 51 },
      { label: 'Delay', value: 80 },
      { label: 'Echo', value: 105 }
    ]
  },
  compressor: { name: 'Compressor', cc: 119, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
};

// Sound Pads (Note numbers based on screenshot: C3=60, D3=62, E3=64, F3=65)
export const soundPads: SoundPad[] = [
  { id: 1, name: 'Pad 1', note: 60, channel: 1 },
  { id: 2, name: 'Pad 2', note: 62, channel: 1 },
  { id: 3, name: 'Pad 3', note: 64, channel: 1 },
  { id: 4, name: 'Pad 4', note: 65, channel: 1 },
];