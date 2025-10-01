import { WebMidi, Input, Output } from 'webmidi';
import type { MIDIControl } from '../config/midiConfig';

export class MidiService {
  private input: Input | null = null;
  private output: Output | null = null;
  private isInitialized = false;

  async initialize(): Promise<boolean> {
    try {
      await WebMidi.enable();
      this.isInitialized = true;
      console.log('WebMIDI enabled successfully');
      return true;
    } catch (error) {
      console.error('Failed to enable WebMIDI:', error);
      return false;
    }
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
    console.log('Connected to MIDI input:', targetInput.name);
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
    console.log('Connected to MIDI output:', targetOutput.name);
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
      this.output.sendControlChange(control.cc, clampedValue, control.channel);
      console.log(`Sent CC${control.cc} = ${clampedValue} on channel ${control.channel}`);
    } catch (error) {
      console.error('Failed to send MIDI CC:', error);
    }
  }

  addControlChangeListener(callback: (cc: number, value: number, channel: number) => void): void {
    if (!this.input) {
      console.warn('No MIDI input connected');
      return;
    }

    this.input.addListener('controlchange', (event: any) => {
      callback(event.controller.number, event.value, event.message.channel);
    });
  }

  removeAllListeners(): void {
    if (this.input) {
      this.input.removeListener();
    }
  }

  disconnect(): void {
    this.removeAllListeners();
    this.input = null;
    this.output = null;
  }

  get isConnected(): boolean {
    return this.input !== null || this.output !== null;
  }

  get inputName(): string {
    return this.input?.name || 'No input connected';
  }

  get outputName(): string {
    return this.output?.name || 'No output connected';
  }
}

// Singleton instance
export const midiService = new MidiService();