// MIDI CC Configuration for Zoom L6Max
// Extended version with 8 channels (4 mono + 4 stereo), 4 scenes, AI Noise Reduction, and subMix sends

import type { ChannelControls, GlobalControls, SoundPad, SceneControl } from './midiConfig';

// Channel strip MIDI CC mappings for L6Max (8 channels: 1-4 mono, 5-8 stereo)
export const channelControlsL6Max: ChannelControls[] = [
    // Channel 1
    {
        channel: 1,
        controls: {
            volume: { name: 'Level', cc: 81, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 73, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 1, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 21, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 11, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 33, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 49, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 57, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 65, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 41, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 93, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 2
    {
        channel: 2,
        controls: {
            volume: { name: 'Level', cc: 82, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 74, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 2, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 22, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 12, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 34, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 50, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 58, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 66, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 42, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 94, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 3
    {
        channel: 3,
        controls: {
            volume: { name: 'Level', cc: 83, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 75, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 3, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 23, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 13, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 35, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 51, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 59, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 67, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 43, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 95, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 4
    {
        channel: 4,
        controls: {
            volume: { name: 'Level', cc: 84, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 76, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 4, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 24, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 14, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 36, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 52, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 60, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 68, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 44, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 102, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 5
    {
        channel: 5,
        controls: {
            volume: { name: 'Level', cc: 85, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 77, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 5, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 25, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 15, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 37, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 53, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 61, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 69, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 45, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 103, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
            monoX2: { name: 'MONO x2', cc: 109, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 6
    {
        channel: 6,
        controls: {
            volume: { name: 'Level', cc: 86, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 78, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 6, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 26, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 16, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 38, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 54, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 62, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 70, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 46, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 104, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
            monoX2: { name: 'MONO x2', cc: 110, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 7
    {
        channel: 7,
        controls: {
            volume: { name: 'Level', cc: 87, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 79, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 7, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 27, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 17, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 39, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 55, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 63, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 71, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 47, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 105, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
            usb12: { name: 'USB 1/2', cc: 113, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    },
    // Channel 8
    {
        channel: 8,
        controls: {
            volume: { name: 'Level', cc: 88, channel: 1, min: 0, max: 127, defaultValue: 100, type: 'knob' },
            pan: { name: 'Pan', cc: 80, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            eq: {
                high: { name: 'High', cc: 8, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                mid: { name: 'Mid', cc: 28, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                midFreq: { name: 'Mid Freq', cc: 18, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
                low: { name: 'Low', cc: 40, channel: 1, min: 0, max: 127, defaultValue: 64, type: 'knob' },
            },
            aux1: { name: 'AUX1', cc: 56, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            aux2: { name: 'AUX2', cc: 64, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            efxSend: { name: 'EFX', cc: 72, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            subMix: { name: 'SUB MIX', cc: 48, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'knob' },
            mute: { name: 'Mute', cc: 106, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
            usb34: { name: 'USB 3/4', cc: 114, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
        }
    }
];

// Global controls for L6Max
export const globalControlsL6Max: GlobalControls = {
    efxType: {
        name: 'EFX Type',
        cc: 117,
        channel: 1,
        min: 0,
        max: 127,
        defaultValue: 1,
        type: 'radio',
        options: [
            { label: 'AI NR', value: 0 },
            { label: 'Hall', value: 21 },
            { label: 'Room', value: 43 },
            { label: 'Spring', value: 64 },
            { label: 'Delay', value: 85 },
            { label: 'Echo', value: 107 },
        ]
    },
    compressor: { name: 'Compressor', cc: 119, channel: 1, min: 0, max: 127, defaultValue: 0, type: 'toggle' },
};

// Sound Pads (same as L6)
export const soundPadsL6Max: SoundPad[] = [
    { id: 1, name: 'Pad 1', note: 60, channel: 1 },
    { id: 2, name: 'Pad 2', note: 62, channel: 1 },
    { id: 3, name: 'Pad 3', note: 64, channel: 1 },
    { id: 4, name: 'Pad 4', note: 65, channel: 1 },
];

// Scene Controls for L6Max (4 scenes: A, B, C, D)
export const sceneControlsL6Max: SceneControl[] = [
    { id: 'A', name: 'Scene A', program: 0, channel: 1, description: 'A' },
    { id: 'B', name: 'Scene B', program: 1, channel: 1, description: 'B' },
    { id: 'C', name: 'Scene C', program: 2, channel: 1, description: 'C' },
    { id: 'D', name: 'Scene D', program: 3, channel: 1, description: 'D' },
];

