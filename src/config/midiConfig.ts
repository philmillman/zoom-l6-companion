// MIDI CC Configuration for Zoom L6
// Based on typical Zoom L6 MIDI implementation

export interface MIDIControl {
  name: string;
  cc: number;
  channel: number;
  min: number;
  max: number;
  defaultValue: number;
  type: 'fader' | 'knob' | 'button' | 'toggle';
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
      volume: { name: 'CH1 Level', cc: 83, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'CH1 Pan', cc: 73, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'CH1 EQ High Level', cc: 1, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'CH1 EQ Mid Level', cc: 21, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'CH1 EQ Mid Freq', cc: 11, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'CH1 EQ Low Level', cc: 33, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'CH1 AUX1 Send', cc: 43, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'CH1 AUX2 Send', cc: 53, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'CH1 EFX Send', cc: 63, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'CH1 Mute', cc: 93, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 2
  {
    channel: 2,
    controls: {
      volume: { name: 'CH2 Level', cc: 84, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'CH2 Pan', cc: 74, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'CH2 EQ High Level', cc: 2, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'CH2 EQ Mid Level', cc: 22, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'CH2 EQ Mid Freq', cc: 12, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'CH2 EQ Low Level', cc: 34, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'CH2 AUX1 Send', cc: 44, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'CH2 AUX2 Send', cc: 54, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'CH2 EFX Send', cc: 64, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'CH2 Mute', cc: 94, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 3
  {
    channel: 3,
    controls: {
      volume: { name: 'CH3 Level', cc: 85, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'CH3 Pan', cc: 75, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'CH3 EQ High Level', cc: 3, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'CH3 EQ Mid Level', cc: 23, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'CH3 EQ Mid Freq', cc: 13, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'CH3 EQ Low Level', cc: 35, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'CH3 AUX1 Send', cc: 45, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'CH3 AUX2 Send', cc: 55, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'CH3 EFX Send', cc: 65, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'CH3 Mute', cc: 95, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      // Mono x2 toggle available for Ch3 (uses CC#109 per screenshot)
      // Interpreted as a toggle: 0=off, >0=on
      // We include it only on channels 3 and 4 per request
      // Note: channel field here is MIDI channel, which remains 1
      // while mixer "channel" is encoded by the specific CC numbers
      // configured above.
      // Adding as button/toggle type
      // Default off
      // Name kept concise for UI labels
      //
      // If you prefer momentary button semantics we can change type to 'button'.
      // Keeping 'toggle' for now to reflect on/off behavior.
      monoX2: { name: 'CH3 MONO x2', cc: 109, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 4
  {
    channel: 4,
    controls: {
      volume: { name: 'CH4 Level', cc: 86, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'CH4 Pan', cc: 76, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'CH4 EQ High Level', cc: 4, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'CH4 EQ Mid Level', cc: 24, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'CH4 EQ Mid Freq', cc: 14, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'CH4 EQ Low Level', cc: 36, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'CH4 AUX1 Send', cc: 46, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'CH4 AUX2 Send', cc: 56, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'CH4 EFX Send', cc: 66, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'CH4 Mute', cc: 102, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      monoX2: { name: 'CH4 MONO x2', cc: 110, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 5
  {
    channel: 5,
    controls: {
      volume: { name: 'CH5 Level', cc: 87, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'CH5 Pan', cc: 77, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'CH5 EQ High Level', cc: 5, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'CH5 EQ Mid Level', cc: 25, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'CH5 EQ Mid Freq', cc: 15, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'CH5 EQ Low Level', cc: 37, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'CH5 AUX1 Send', cc: 47, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'CH5 AUX2 Send', cc: 57, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'CH5 EFX Send', cc: 67, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'CH5 Mute', cc: 103, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      usb12: { name: 'CH5 USB 1/2', cc: 113, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  },
  // Channel 6
  {
    channel: 6,
    controls: {
      volume: { name: 'CH6 Level', cc: 88, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
      pan: { name: 'CH6 Pan', cc: 78, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      eq: {
        high: { name: 'CH6 EQ High Level', cc: 6, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        mid: { name: 'CH6 EQ Mid Level', cc: 26, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        midFreq: { name: 'CH6 EQ Mid Freq', cc: 16, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
        low: { name: 'CH6 EQ Low Level', cc: 38, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
      },
      aux1: { name: 'CH6 AUX1 Send', cc: 48, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      aux2: { name: 'CH6 AUX2 Send', cc: 58, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      efxSend: { name: 'CH6 EFX Send', cc: 68, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
      mute: { name: 'CH6 Mute', cc: 104, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
      usb34: { name: 'CH6 USB 3/4', cc: 114, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
    }
  }
];

// Global controls
export const globalControls: GlobalControls = {
  efxType: { name: 'EFX Type', cc: 117, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
  compressor: { name: 'Compressor', cc: 119, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
};

// Sound Pads (Note numbers based on screenshot: C3=60, D3=62, E3=64, F3=65)
export const soundPads: SoundPad[] = [
  { id: 1, name: 'Pad 1', note: 60, channel: 1 },
  { id: 2, name: 'Pad 2', note: 62, channel: 1 },
  { id: 3, name: 'Pad 3', note: 64, channel: 1 },
  { id: 4, name: 'Pad 4', note: 65, channel: 1 },
];