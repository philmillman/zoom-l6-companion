import { WebMidi, Input, Output } from 'webmidi';
import { ref, type Ref } from 'vue';
import type { MIDIControl } from '../config/midiConfig';
import { sendCompleteSysex } from '../midi/sysex/rawSysex';

export class MidiService {
  private input: Input | null = null;
  private output: Output | null = null;
  private isInitialized = false;

  // Reactive state for connection tracking
  private _isConnected = ref(false);
  private _inputName = ref('No input connected');
  private _outputName = ref('No output connected');
  private _midiOutputConnected = ref(false);
  private _midiInputConnected = ref(false);
  private _sysexEnabled = ref(false);

  // Device state change callback
  private onDeviceStateChangeCallback: (() => void) | null = null;

  async initialize(): Promise<boolean> {
    try {
      await WebMidi.enable({ sysex: true });
      this.isInitialized = true;
      this._sysexEnabled.value = WebMidi.sysexEnabled;
      if (!WebMidi.sysexEnabled) {
        console.warn('WebMIDI started without SysEx permission; mass storage and other SysEx features will be unavailable.');
      }

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
    if (this.onDeviceStateChangeCallback) {
      this.onDeviceStateChangeCallback();
    }
  }

  /**
   * After USB re-enumeration (e.g. mass storage toggle), WebMidi port objects go stale while the UI
   * still shows a connection. Drop dead ports and re-open by saved name so CC/SysEx work again.
   */
  /** Zoom file-transfer SysEx is observed on the Editor pair in `zooml6_fs.py`; Mixer Control carries CC. */
  hasZoomEditorSysexOutput(): boolean {
    return this.findZoomEditorOutput() !== null;
  }

  hasZoomEditorSysexInput(): boolean {
    return this.findZoomEditorInput() !== null;
  }

  syncPortsAfterHotplug(): boolean {
    let didChange = false;
    const savedInName = this._inputName.value;
    const savedOutName = this._outputName.value;

    if (this.input && this.input.state === 'disconnected') {
      this.removeAllListeners();
      this.input = null;
      this._midiInputConnected.value = false;
      didChange = true;
    }

    if (this.output && this.output.state === 'disconnected') {
      this.output = null;
      this._midiOutputConnected.value = false;
      didChange = true;
    }

    this._isConnected.value = this.input !== null || this.output !== null;

    if (savedInName !== 'No input connected' && !this.input) {
      if (this.connectInput(savedInName)) {
        didChange = true;
      }
    }

    if (savedOutName !== 'No output connected' && !this.output) {
      if (this.connectOutput(savedOutName)) {
        didChange = true;
      }
    }

    this._isConnected.value = this.input !== null || this.output !== null;
    return didChange;
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

    if (this.input !== null && (this.input.id !== targetInput.id || this.input.state === 'disconnected')) {
      this.removeAllListeners();
      this.input = null;
      this._midiInputConnected.value = false;
    }

    if (this.input !== null && this.input.id === targetInput.id && this.input.state === 'connected') {
      this._inputName.value = targetInput.name;
      this._midiInputConnected.value = true;
      this._isConnected.value = this.input !== null || this.output !== null;
      return true;
    }

    this.input = targetInput;
    this._inputName.value = targetInput.name;
    this._midiInputConnected.value = true;
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

    if (this.output !== null && (this.output.id !== targetOutput.id || this.output.state === 'disconnected')) {
      this.output = null;
      this._midiOutputConnected.value = false;
    }

    if (this.output !== null && this.output.id === targetOutput.id && this.output.state === 'connected') {
      this._outputName.value = targetOutput.name;
      this._midiOutputConnected.value = true;
      this._isConnected.value = this.input !== null || this.output !== null;
      return true;
    }

    this.output = targetOutput;
    this._outputName.value = targetOutput.name;
    this._midiOutputConnected.value = true;
    this._isConnected.value = this.input !== null || this.output !== null;
    return true;
  }

  sendControlChange(control: MIDIControl, value: number): void {
    if (this.output?.state === 'disconnected') {
      this.syncPortsAfterHotplug();
    }
    if (!this.output) {
      console.warn('No MIDI output connected');
      return;
    }

    // Clamp value to valid range
    const clampedValue = Math.max(control.min, Math.min(control.max, value));

    try {
      // WebMidi v3: third argument is options object, not a channel number
      this.output.sendControlChange(control.cc, clampedValue, { channels: control.channel });
      console.log(`Sent CC${control.cc} = ${clampedValue} on channel ${control.channel}`);
    } catch (error) {
      console.error('Failed to send MIDI CC:', error);
    }
  }

  /**
   * Sends a full SysEx message (0xF0 … 0xF7). Prefer adding named builders under `src/midi/sysex/`
   * and calling this from there or from feature code.
   *
   * Uses the Zoom **Editor** output when listed (same as Magicking/L6-MassStorage), otherwise the
   * selected mixer output.
   */
  sendSysexRaw(bytes: readonly number[]): void {
    this.syncPortsAfterHotplug();
    const editorOut = this.findZoomEditorOutput();
    const out = editorOut ?? this.output;
    if (!out) {
      throw new Error('No MIDI output available for SysEx (connect Mixer Control or ensure an Editor output exists).');
    }
    if (out.state === 'disconnected') {
      throw new Error('MIDI output port is disconnected; wait for USB to settle then reconnect or pick the port again.');
    }
    sendCompleteSysex(out, bytes);
  }

  /** True when the browser granted SysEx (see WebMidi.enable({ sysex: true })). */
  get sysexEnabled(): Ref<boolean> {
    return this._sysexEnabled;
  }

  /** True when a MIDI output port is selected (SysEx sends use this port). */
  get midiOutputConnected(): Ref<boolean> {
    return this._midiOutputConnected;
  }

  /** True when a MIDI input port is selected (needed to observe SysEx replies). */
  get midiInputConnected(): Ref<boolean> {
    return this._midiInputConnected;
  }

  /**
   * Resolves with the next inbound SysEx payload (full bytes including F0/F7), or null on timeout.
   * Listens on the Zoom **Editor** input when present (SysEx replies for file transfer), else the
   * selected mixer input — matches Magicking/L6-MassStorage `wait_for_sysex` pairing.
   */
  waitForSysexOnce(timeoutMs: number): Promise<readonly number[] | null> {
    this.syncPortsAfterHotplug();
    const inputPort = this.findZoomEditorInput() ?? this.input;
    if (!inputPort || inputPort.state === 'disconnected') {
      return Promise.resolve(null);
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (data: readonly number[] | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        inputPort.removeListener('sysex', onSysex);
        resolve(data);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      const onSysex = (event: { message: { data: number[] } }) => {
        const data = event.message?.data;
        if (!data?.length) return;
        finish(Array.from(data));
      };
      inputPort.addListener('sysex', onSysex as (e: unknown) => void);
    });
  }

  private nameLooksZoomish(lower: string): boolean {
    return (
      lower.includes('zoom') ||
      lower.includes('l-6') ||
      lower.includes('l6') ||
      lower.includes('livetrak')
    );
  }

  private findZoomEditorInput(): Input | null {
    const inputs = this.getAvailableInputs();
    for (const p of inputs) {
      if (p.state === 'disconnected') continue;
      const n = p.name.toLowerCase();
      if (!n.includes('editor')) continue;
      if (this.nameLooksZoomish(n)) return p;
    }
    for (const p of inputs) {
      if (p.state === 'disconnected') continue;
      if (p.name.toLowerCase().includes('editor')) return p;
    }
    return null;
  }

  private findZoomEditorOutput(): Output | null {
    const outputs = this.getAvailableOutputs();
    for (const p of outputs) {
      if (p.state === 'disconnected') continue;
      const n = p.name.toLowerCase();
      if (!n.includes('editor')) continue;
      if (this.nameLooksZoomish(n)) return p;
    }
    for (const p of outputs) {
      if (p.state === 'disconnected') continue;
      if (p.name.toLowerCase().includes('editor')) return p;
    }
    return null;
  }

  private controlChangeListeners: Set<(cc: number, value: number, channel: number) => void> = new Set();
  private noteOnListeners: Set<(note: number, velocity: number, channel: number) => void> = new Set();
  private noteOffListeners: Set<(note: number, velocity: number, channel: number) => void> = new Set();
  private programChangeListeners: Set<(program: number, channel: number) => void> = new Set();
  private sysexListeners: Set<(data: readonly number[]) => void> = new Set();

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

        console.log(`Received MIDI CC: CC${cc} = ${rawValue} (raw) / ${normalizedValue} (normalized) on channel ${channel}`);
        console.log('MIDI Value Sources:', {
          controllerValue: controllerValue,
          normalizedValue: normalizedValue,
          messageData: messageData,
          finalRawValue: rawValue
        });

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

        console.log(`Received MIDI Note On: ${note} (vel: ${velocity}) on channel ${channel}`);

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

        console.log(`Received MIDI Note Off: ${note} (vel: ${velocity}) on channel ${channel}`);

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

        console.log(`Received MIDI Program Change: ${program} on channel ${channel}`);

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

  addSysexListener(callback: (data: readonly number[]) => void): void {
    if (!this.input) {
      console.warn('No MIDI input connected');
      return;
    }

    this.sysexListeners.add(callback);

    if (this.sysexListeners.size === 1) {
      this.input.addListener('sysex', (event: { message: { data: number[] } }) => {
        const data = event.message?.data;
        if (!data?.length) return;
        const bytes = Array.from(data);
        this.sysexListeners.forEach((listener) => {
          try {
            listener(bytes);
          } catch (error) {
            console.error('Error in SysEx listener callback:', error);
          }
        });
      });
    }
  }

  removeSysexListener(callback: (data: readonly number[]) => void): void {
    this.sysexListeners.delete(callback);
  }

  // Note helpers for sound pads
  sendNoteOn(note: number, channel: number, velocity = 100): void {
    if (this.output?.state === 'disconnected') {
      this.syncPortsAfterHotplug();
    }
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
    if (this.output?.state === 'disconnected') {
      this.syncPortsAfterHotplug();
    }
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
    if (this.output?.state === 'disconnected') {
      this.syncPortsAfterHotplug();
    }
    if (!this.output) {
      console.warn('No MIDI output connected');
      return;
    }

    // Clamp program to valid range (0-127)
    const clampedProgram = Math.max(0, Math.min(127, program));

    try {
      this.output.sendProgramChange(clampedProgram, { channels: channel });
      console.log(`Sent Program Change: ${clampedProgram} on channel ${channel}`);
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
    this.sysexListeners.clear();
  }

  disconnect(): void {
    this.removeAllListeners();
    this.input = null;
    this.output = null;
    this._midiOutputConnected.value = false;
    this._midiInputConnected.value = false;
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