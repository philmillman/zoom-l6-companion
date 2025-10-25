import { WebMidi, Input, Output } from 'webmidi';
import { ref, computed } from 'vue';
import type { MIDIControl } from '../config/midiConfig';

export class MidiService {
  private input: Input | null = null;
  private output: Output | null = null;
  private isInitialized = false;

  // Reactive state for connection tracking
  private _isConnected = ref(false);
  private _inputName = ref('No input connected');
  private _outputName = ref('No output connected');

  // Device state change callback
  private onDeviceStateChangeCallback: (() => void) | null = null;

  async initialize(): Promise<boolean> {
    try {
      await WebMidi.enable();
      this.isInitialized = true;

      // Listen for device state changes
      WebMidi.addListener('connected', (event) => {
        this.onDeviceStateChange();
      });

      WebMidi.addListener('disconnected', (event) => {
        this.onDeviceStateChange();
      });
      return true;
    } catch (error) {
      console.error('Failed to enable WebMIDI:', error);
      return false;
    }
  }

  private onDeviceStateChange() {
    // Notify the component to refresh devices
    if (this.onDeviceStateChangeCallback) {
      this.onDeviceStateChangeCallback();
    }
  }

  // Method to set the device state change callback
  setDeviceStateChangeCallback(callback: () => void) {
    this.onDeviceStateChangeCallback = callback;
  }

  getAvailableInputs(): Input[] {
    if (!this.isInitialized) return [];
    return WebMidi.inputs;
  }

  getAvailableOutputs(): Output[] {
    if (!this.isInitialized) return [];
    return WebMidi.outputs;
  }

  connectInput(deviceName?: string): boolean {
    if (!this.isInitialized) return false;

    const inputs = this.getAvailableInputs();
    if (inputs.length === 0) return false;

    // Find specific device or use first available
    const targetInput = deviceName
      ? inputs.find(input => input.name.includes(deviceName))
      : inputs.find(input => input.name.toLowerCase().includes('zoom')) || inputs[0];

    if (!targetInput) return false;

    this.input = targetInput;
    this._inputName.value = targetInput.name;
    this._isConnected.value = this.input !== null || this.output !== null;
    return true;
  }

  connectOutput(deviceName?: string): boolean {
    if (!this.isInitialized) return false;

    const outputs = this.getAvailableOutputs();
    if (outputs.length === 0) return false;

    // Find specific device or use first available
    const targetOutput = deviceName
      ? outputs.find(output => output.name.includes(deviceName))
      : outputs.find(output => output.name.toLowerCase().includes('zoom')) || outputs[0];

    if (!targetOutput) return false;

    this.output = targetOutput;
    this._outputName.value = targetOutput.name;
    this._isConnected.value = this.input !== null || this.output !== null;
    return true;
  }

  sendControlChange(control: MIDIControl, value: number): void {
    if (!this.output) {
      console.warn('No MIDI output connected');
      return;
    }

    // Clamp value to valid range
    const clampedValue = Math.max(control.min, Math.min(control.max, value));

    try {
      // WebMidi v3: third argument is options object, not a channel number
      this.output.sendControlChange(control.cc, clampedValue, { channels: control.channel });
    } catch (error) {
      console.error('Failed to send MIDI CC:', error);
    }
  }

  private controlChangeListeners: Set<(cc: number, value: number, channel: number) => void> = new Set();
  private noteOnListeners: Set<(note: number, velocity: number, channel: number) => void> = new Set();
  private noteOffListeners: Set<(note: number, velocity: number, channel: number) => void> = new Set();
  private programChangeListeners: Set<(program: number, channel: number) => void> = new Set();

  addControlChangeListener(callback: (cc: number, value: number, channel: number) => void): void {
    if (!this.input) {
      console.warn('No MIDI input connected');
      return;
    }

    // Add callback to our set of listeners
    this.controlChangeListeners.add(callback);

    // If this is the first listener, set up the MIDI input listener
    if (this.controlChangeListeners.size === 1) {
      this.input.addListener('controlchange', (event: any) => {
        const cc = event.controller.number;
        // Get the normalized value (0-1) and convert to MIDI range (0-127)
        const normalizedValue = event.value; // This is 0-1
        const channel = event.message.channel;

        // Convert normalized value to MIDI range (0-127)
        let rawValue = Math.round(normalizedValue * 127);

        // Try to get the actual raw MIDI value from various sources
        const controllerValue = event.controller.value;
        const messageData = event.message.dataBytes || event.message.data;

        if (controllerValue !== undefined && controllerValue >= 0 && controllerValue <= 127) {
          rawValue = controllerValue;
        } else if (messageData && messageData.length >= 3) {
          // MIDI CC message format: [status, cc, value]
          const midiValue = messageData[2];
          if (midiValue !== undefined && midiValue >= 0 && midiValue <= 127) {
            rawValue = midiValue;
          }
        }

        // Ensure we have a valid MIDI value (0-127)
        if (rawValue < 0 || rawValue > 127 || isNaN(rawValue)) {
          console.warn(`Invalid MIDI value: ${rawValue}, using normalized value * 127`);
          rawValue = Math.round(normalizedValue * 127);
        }


        // Use the raw MIDI value (0-127) for our controls
        this.controlChangeListeners.forEach(listener => {
          try {
            listener(cc, rawValue, channel);
          } catch (error) {
            console.error('Error in MIDI listener callback:', error);
          }
        });
      });
    }
  }

  removeControlChangeListener(callback: (cc: number, value: number, channel: number) => void): void {
    this.controlChangeListeners.delete(callback);
  }

  addNoteOnListener(callback: (note: number, velocity: number, channel: number) => void): void {
    if (!this.input) {
      console.warn('No MIDI input connected');
      return;
    }

    // Add callback to our set of listeners
    this.noteOnListeners.add(callback);

    // If this is the first listener, set up the MIDI input listener
    if (this.noteOnListeners.size === 1) {
      this.input.addListener('noteon', (event: any) => {
        const note = event.note.number;
        const velocity = event.velocity || 0;
        const channel = event.message.channel;


        // Notify all listeners
        this.noteOnListeners.forEach(listener => {
          try {
            listener(note, velocity, channel);
          } catch (error) {
            console.error('Error in Note On listener callback:', error);
          }
        });
      });
    }
  }

  removeNoteOnListener(callback: (note: number, velocity: number, channel: number) => void): void {
    this.noteOnListeners.delete(callback);
  }

  addNoteOffListener(callback: (note: number, velocity: number, channel: number) => void): void {
    if (!this.input) {
      console.warn('No MIDI input connected');
      return;
    }

    // Add callback to our set of listeners
    this.noteOffListeners.add(callback);

    // If this is the first listener, set up the MIDI input listener
    if (this.noteOffListeners.size === 1) {
      this.input.addListener('noteoff', (event: any) => {
        const note = event.note.number;
        const velocity = event.velocity || 0;
        const channel = event.message.channel;


        // Notify all listeners
        this.noteOffListeners.forEach(listener => {
          try {
            listener(note, velocity, channel);
          } catch (error) {
            console.error('Error in Note Off listener callback:', error);
          }
        });
      });
    }
  }

  removeNoteOffListener(callback: (note: number, velocity: number, channel: number) => void): void {
    this.noteOffListeners.delete(callback);
  }

  addProgramChangeListener(callback: (program: number, channel: number) => void): void {
    if (!this.input) {
      console.warn('No MIDI input connected');
      return;
    }

    // Add callback to our set of listeners
    this.programChangeListeners.add(callback);

    // If this is the first listener, set up the MIDI input listener
    if (this.programChangeListeners.size === 1) {
      this.input.addListener('programchange', (event: any) => {
        const program = event.value;
        const channel = event.message.channel;


        // Notify all listeners
        this.programChangeListeners.forEach(listener => {
          try {
            listener(program, channel);
          } catch (error) {
            console.error('Error in Program Change listener callback:', error);
          }
        });
      });
    }
  }

  removeProgramChangeListener(callback: (program: number, channel: number) => void): void {
    this.programChangeListeners.delete(callback);
  }

  // Note helpers for sound pads
  sendNoteOn(note: number, channel: number, velocity = 100): void {
    if (!this.output) {
      console.warn('No MIDI output connected');
      return;
    }
    try {
      // Convert MIDI velocity (0-127) to normalized value (0-1)
      const normalizedVelocity = Math.max(0, Math.min(1, velocity / 127));
      this.output.playNote(note, { channels: channel, attack: normalizedVelocity });
    } catch (error) {
      console.error('Failed to send Note On:', error);
    }
  }

  sendNoteOff(note: number, channel: number, release = 0): void {
    if (!this.output) {
      console.warn('No MIDI output connected');
      return;
    }
    try {
      this.output.stopNote(note, { channels: channel, release });
    } catch (error) {
      console.error('Failed to send Note Off:', error);
    }
  }

  sendProgramChange(program: number, channel: number): void {
    if (!this.output) {
      console.warn('No MIDI output connected');
      return;
    }

    // Clamp program to valid range (0-127)
    const clampedProgram = Math.max(0, Math.min(127, program));

    try {
      this.output.sendProgramChange(clampedProgram, { channels: channel });
    } catch (error) {
      console.error('Failed to send Program Change:', error);
    }
  }

  removeAllListeners(): void {
    if (this.input) {
      this.input.removeListener();
    }
    this.controlChangeListeners.clear();
    this.noteOnListeners.clear();
    this.noteOffListeners.clear();
    this.programChangeListeners.clear();
  }

  disconnect(): void {
    this.removeAllListeners();
    this.input = null;
    this.output = null;
    this._inputName.value = 'No input connected';
    this._outputName.value = 'No output connected';
    this._isConnected.value = false;
  }

  get isConnected(): boolean {
    return this._isConnected.value;
  }

  // Expose the reactive ref for Vue components to track
  get connectionState() {
    return this._isConnected;
  }

  get inputName(): string {
    return this._inputName.value;
  }

  get outputName(): string {
    return this._outputName.value;
  }

}

// Singleton instance
export const midiService = new MidiService();