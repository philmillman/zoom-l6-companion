<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted } from 'vue';
import type { ChannelControls, GlobalControls, SoundPad, MixerType } from '../config/midiConfig';
import { channelControls as defaultChannelControls, globalControls as defaultGlobalControls, soundPads as defaultSoundPads } from '../config/midiConfig';
import { channelControlsL6Max, globalControlsL6Max, soundPadsL6Max } from '../config/midiConfigL6Max';
import { midiService } from '../services/midiService';
import { runZoomL6FileTransferHandshake } from '../midi/sysex';
import DeviceNotice from './DeviceNotice.vue';
import DeviceSettingsPanel from './DeviceSettingsPanel.vue';
import { useDeviceSettings, type DeviceLinkState } from '../composables/useDeviceSettings';

interface Props {
  isVisible: boolean;
  currentChannelControls: ChannelControls[];
  currentGlobalControls: GlobalControls;
  currentSoundPads: SoundPad[];
  currentMixerType: MixerType;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'save', data: { channelControls: ChannelControls[], globalControls: GlobalControls, soundPads: SoundPad[], mixerType: MixerType }): void;
}>();

// Deep clone the configurations for editing (use current values, not defaults)
const editableChannelControls = reactive<ChannelControls[]>(JSON.parse(JSON.stringify(props.currentChannelControls)));
const editableGlobalControls = reactive<GlobalControls>(JSON.parse(JSON.stringify(props.currentGlobalControls)));
const editableSoundPads = reactive<SoundPad[]>(JSON.parse(JSON.stringify(props.currentSoundPads)));

// Mixer type override (can be set regardless of detection)
const mixerTypeOverride = ref<MixerType>(props.currentMixerType);

// Global MIDI channel setting (initialized from first channel control)
const globalMidiChannel = ref(editableChannelControls[0]?.controls.volume.channel || 1);

// Track if using custom settings
const hasCustomSettings = computed(() => {
  try {
    return localStorage.getItem('zoom-l6-channel-controls') !== null;
  } catch {
    return false;
  }
});

// Track which section is expanded
const expandedSections = reactive({
  channels: true,
  global: false,
  soundPads: false,
  nonMidi: false,
  device: false,
});

// ── Editor link (SysEx session) ─────────────────────────────────────────────
const deviceSettings = useDeviceSettings();
const { link: deviceLink, linkEnabled, showExperimental, firmware: deviceFirmware } = deviceSettings;

const LINK_LABELS: Record<DeviceLinkState, string> = {
  'no-sysex': 'SysEx not allowed',
  'no-editor-port': 'No Editor port',
  closed: 'Closed',
  opening: 'Opening…',
  open: 'Open',
  stale: 'Stale',
  suspended: 'Suspended',
  error: 'Error',
};

const linkLabel = computed(() => LINK_LABELS[deviceLink.value]);
const linkTone = computed<'success' | 'warn' | 'error' | 'idle'>(() => {
  switch (deviceLink.value) {
    case 'open':
      return 'success';
    case 'opening':
    case 'stale':
    case 'suspended':
      return 'warn';
    case 'error':
    case 'no-sysex':
    case 'no-editor-port':
      return 'error';
    default:
      return 'idle';
  }
});

const massStorageBusy = ref(false);
const massStorageCooldown = ref(false);
let massStorageCooldownTimer: ReturnType<typeof window.setTimeout> | undefined;

const massStorageNotice = ref('');
const massStorageNoticeVariant = ref<'success' | 'error'>('success');

const massStorageButtonsLocked = computed(
  () => massStorageBusy.value || massStorageCooldown.value,
);

function startMassStorageCooldown() {
  massStorageCooldown.value = true;
  window.clearTimeout(massStorageCooldownTimer);
  massStorageCooldownTimer = window.setTimeout(() => {
    massStorageCooldown.value = false;
    massStorageCooldownTimer = undefined;
  }, 3000);
}

const midiOutputReady = computed(() => midiService.midiOutputConnected.value);
const midiInputReady = computed(() => midiService.midiInputConnected.value);
const sysexReady = computed(() => midiService.sysexEnabled.value);
/** SysEx can use the Editor output even when Mixer Control is selected for CC. */
const massStorageOutReady = computed(
  () => midiOutputReady.value || midiService.hasZoomEditorSysexOutput(),
);
const massStorageHandshakeWaitReady = computed(
  () =>
    sysexReady.value &&
    (midiInputReady.value || midiService.hasZoomEditorSysexInput()),
);

// Check for duplicate CCs
const hasDuplicateCCs = computed(() => {
  const ccCounts = new Map<number, number>();
  
  // Count CC usage
  editableChannelControls.forEach((channel) => {
    [
      channel.controls.volume.cc,
      channel.controls.pan.cc,
      channel.controls.eq.high.cc,
      channel.controls.eq.mid.cc,
      channel.controls.eq.midFreq.cc,
      channel.controls.eq.low.cc,
      channel.controls.aux1.cc,
      channel.controls.aux2.cc,
      channel.controls.efxSend.cc,
      channel.controls.subMix?.cc,
      channel.controls.mute.cc,
      channel.controls.monoX2?.cc,
      channel.controls.usb12?.cc,
      channel.controls.usb34?.cc,
    ].forEach(cc => {
      if (cc !== undefined && cc >= 0) {
        ccCounts.set(cc, (ccCounts.get(cc) || 0) + 1);
      }
    });
  });
  
  // Add global controls
  [editableGlobalControls.efxType.cc, editableGlobalControls.compressor.cc].forEach(cc => {
    if (cc >= 0) {
      ccCounts.set(cc, (ccCounts.get(cc) || 0) + 1);
    }
  });
  
  // Check if any CC is used more than once
  return Array.from(ccCounts.values()).some(count => count > 1);
});

// Check for duplicate notes
const hasDuplicateNotes = computed(() => {
  const noteCounts = new Map<number, number>();
  editableSoundPads.forEach(pad => {
    if (pad.note >= 0) {
      noteCounts.set(pad.note, (noteCounts.get(pad.note) || 0) + 1);
    }
  });
  return Array.from(noteCounts.values()).some(count => count > 1);
});


// Reset to defaults
function resetToDefaults() {
  if (confirm('Are you sure you want to reset all MIDI mappings to their defaults? This will also clear your saved settings.')) {
    // Use defaults based on selected mixer type
    const defaults = mixerTypeOverride.value === 'l6max' 
      ? {
          channelControls: channelControlsL6Max,
          globalControls: globalControlsL6Max,
          soundPads: soundPadsL6Max
        }
      : {
          channelControls: defaultChannelControls,
          globalControls: defaultGlobalControls,
          soundPads: defaultSoundPads
        };
    
    // Deep clone defaults again
    Object.assign(editableChannelControls, JSON.parse(JSON.stringify(defaults.channelControls)));
    Object.assign(editableGlobalControls, JSON.parse(JSON.stringify(defaults.globalControls)));
    Object.assign(editableSoundPads, JSON.parse(JSON.stringify(defaults.soundPads)));
    
    // Reset global MIDI channel
    globalMidiChannel.value = 1;
    
    // Clear localStorage
    try {
      localStorage.removeItem('zoom-l6-channel-controls');
      localStorage.removeItem('zoom-l6-global-controls');
      localStorage.removeItem('zoom-l6-sound-pads');
      localStorage.removeItem('zoom-l6-mixer-type');
      console.log('✅ Cleared saved settings from localStorage');
    } catch (e) {
      console.error('Failed to clear localStorage:', e);
    }
  }
}

// Save changes
function saveChanges() {
  // Warn about duplicates
  if (hasDuplicateCCs.value || hasDuplicateNotes.value) {
    const warnings = [];
    if (hasDuplicateCCs.value) warnings.push('duplicate CC assignments');
    if (hasDuplicateNotes.value) warnings.push('duplicate note assignments');
    
    if (!confirm(`Warning: You have ${warnings.join(' and ')}. This may cause unexpected behavior. Save anyway?`)) {
      return;
    }
  }
  
  // Apply global MIDI channel to all controls before saving
  editableChannelControls.forEach(channel => {
    Object.values(channel.controls).forEach(control => {
      if (typeof control === 'object' && 'channel' in control) {
        control.channel = globalMidiChannel.value;
      } else if (control && typeof control === 'object' && 'high' in control) {
        // Handle EQ object
        Object.values(control).forEach(eqControl => {
          if (eqControl && typeof eqControl === 'object' && 'channel' in eqControl) {
            eqControl.channel = globalMidiChannel.value;
          }
        });
      }
    });
  });
  
  editableGlobalControls.efxType.channel = globalMidiChannel.value;
  editableGlobalControls.compressor.channel = globalMidiChannel.value;
  
  editableSoundPads.forEach(pad => {
    pad.channel = globalMidiChannel.value;
  });
  
  emit('save', {
    channelControls: JSON.parse(JSON.stringify(editableChannelControls)),
    globalControls: JSON.parse(JSON.stringify(editableGlobalControls)),
    soundPads: JSON.parse(JSON.stringify(editableSoundPads)),
    mixerType: mixerTypeOverride.value,
  });
  emit('close');
}

// Close without saving
function cancel() {
  if (confirm('Are you sure? Any unsaved changes will be lost.')) {
    emit('close');
  }
}

function toggleSection(section: keyof typeof expandedSections) {
  expandedSections[section] = !expandedSections[section];
}

async function applyMassStorage(enable: boolean) {
  massStorageNotice.value = '';
  if (!massStorageOutReady.value) {
    massStorageNoticeVariant.value = 'error';
    massStorageNotice.value =
      'No MIDI output available for SysEx. Connect Mixer Control or ensure a Zoom “Editor” output appears in the device list.';
    return;
  }
  if (!sysexReady.value) {
    massStorageNoticeVariant.value = 'error';
    massStorageNotice.value =
      'System Exclusive is not enabled. Reload the app and allow SysEx when the browser prompts.';
    return;
  }
  startMassStorageCooldown();
  massStorageBusy.value = true;
  try {
    // The handshake sends its own identity/editor-open/heartbeat sequence: the session's
    // heartbeat must not run alongside it. USB re-enumeration follows, so it stays suspended
    // until the device reconnects.
    await deviceSettings.suspend();
    const useInboundWait = massStorageHandshakeWaitReady.value;
    await runZoomL6FileTransferHandshake((msg) => midiService.sendSysexRaw(msg), enable, {
      waitForInboundSysex: useInboundWait
        ? (timeoutMs: number) => midiService.waitForSysexOnce(timeoutMs)
        : undefined,
    });
    massStorageNoticeVariant.value = 'success';
    massStorageNotice.value = enable
      ? 'Command sent. The L6 should appear as a USB drive (SD card access) in the host file manager.'
      : 'Command sent. The L6 USB storage will disconnect.';
  } catch (e) {
    massStorageNoticeVariant.value = 'error';
    massStorageNotice.value = e instanceof Error ? e.message : String(e);
    // The handshake failed, so no USB re-enumeration will fire the reconnect watcher that
    // normally clears the suspension. Resume the editor link here or it stays wedged shut.
    await deviceSettings.resume();
  } finally {
    massStorageBusy.value = false;
  }
}

// Watch for mixer type changes to update defaults if needed
watch(mixerTypeOverride, (newType) => {
  // Optionally reload defaults when mixer type changes
  // User can manually change this or use reset to defaults
});

// Watch for dialog open to reload current settings
onUnmounted(() => {
  window.clearTimeout(massStorageCooldownTimer);
});

watch(() => props.isVisible, (visible) => {
  if (visible) {
    // Reload settings from current props when dialog opens
    Object.assign(editableChannelControls, JSON.parse(JSON.stringify(props.currentChannelControls)));
    Object.assign(editableGlobalControls, JSON.parse(JSON.stringify(props.currentGlobalControls)));
    Object.assign(editableSoundPads, JSON.parse(JSON.stringify(props.currentSoundPads)));
    mixerTypeOverride.value = props.currentMixerType;
    
    // Update MIDI channel from current settings
    globalMidiChannel.value = editableChannelControls[0]?.controls.volume.channel || 1;

    massStorageNotice.value = '';
    window.clearTimeout(massStorageCooldownTimer);
    massStorageCooldown.value = false;
    massStorageCooldownTimer = undefined;
  } else {
    window.clearTimeout(massStorageCooldownTimer);
    massStorageCooldown.value = false;
    massStorageCooldownTimer = undefined;
  }
});
</script>

<template>
  <Teleport to="body">
    <div v-if="isVisible" class="advanced-settings-overlay" @click.self="cancel">
      <div class="advanced-settings-dialog">
        <div class="dialog-header">
          <h2>Advanced Settings</h2>
          <button class="close-button" @click="cancel" title="Close">×</button>
        </div>
        
        <div class="dialog-content">
          <p class="warning-text">
            ⚠️ Changing these settings may cause conflicts. Only modify if you know what you're doing.
          </p>
          
          <p v-if="hasCustomSettings" class="info-text">
            💾 Custom settings loaded from browser storage
          </p>
          
          <!-- Mixer Type Override -->
          <div class="global-setting">
            <label for="mixer-type">Mixer Type Override</label>
            <select 
              id="mixer-type"
              v-model="mixerTypeOverride"
              class="setting-select"
            >
              <option value="l6">L6 (8 channels, 3 scenes)</option>
              <option value="l6max">L6Max (8 channels: 4 mono + 4 stereo, 4 scenes, subMix sends)</option>
            </select>
            <p class="setting-hint">Override the auto-detected mixer type. Changing this will affect available controls.</p>
          </div>
          
          <!-- Global MIDI Channel Setting -->
          <div class="global-setting">
            <label for="midi-channel">MIDI Channel (applies to all controls)</label>
            <select 
              id="midi-channel"
              v-model.number="globalMidiChannel"
              class="setting-select"
            >
              <option v-for="ch in 16" :key="ch" :value="ch">Channel {{ ch }}</option>
            </select>
          </div>

          <!-- Non-MIDI (SysEx device features) -->
          <div class="settings-section">
            <div class="section-header" @click="toggleSection('nonMidi')">
              <h3>Non-MIDI</h3>
              <span class="toggle-icon">{{ expandedSections.nonMidi ? '▼' : '▶' }}</span>
            </div>

            <div v-if="expandedSections.nonMidi" class="section-content">
              <!-- Editor link (SysEx session) -->
              <div class="editor-link">
                <div class="editor-link-row">
                  <label class="editor-link-toggle">
                    <input type="checkbox" v-model="linkEnabled" />
                    <span>Editor link (SysEx)</span>
                  </label>
                  <span class="link-pill" :class="`link-pill--${linkTone}`">
                    {{ linkLabel }}
                    <template v-if="deviceLink === 'open' && deviceFirmware">
                      · fw {{ deviceFirmware }}
                    </template>
                  </span>
                </div>
                <p class="setting-hint">
                  Turn off before launching the official ZOOM L6 Editor.
                </p>
                <label class="editor-link-toggle editor-link-toggle--secondary">
                  <input type="checkbox" v-model="showExperimental" />
                  <span>Show experimental (unverified) device settings</span>
                </label>
              </div>

              <p class="non-midi-intro">
                Toggle USB file transfer (SD card as a drive) with SysEx over the same MIDI port as mixer control. The device will disconnect and re-enumerate on USB when you switch modes. If it gets stuck try ejecting the device on the host or disable from the official Zoom L6 app.
              </p>
              <DeviceNotice v-if="!sysexReady" subtle variant="warn">
                SysEx permission was not granted. Reload and approve System Exclusive access for this site.
              </DeviceNotice>
              <DeviceNotice v-else-if="!massStorageOutReady" subtle variant="info">
                Connect a MIDI output (Mixer Control) or ensure a Zoom Editor output appears in the list.
              </DeviceNotice>
              <DeviceNotice
                v-else-if="!massStorageHandshakeWaitReady"
                subtle
                variant="warn"
              >
                SysEx replies won’t be waited on: allow SysEx and connect a MIDI input or ensure an Editor
                input exists. Commands still send with fixed delays.
              </DeviceNotice>
              <div class="mass-storage-actions">
                <button
                  type="button"
                  class="mass-storage-button mass-storage-button--on"
                  :disabled="massStorageButtonsLocked || !massStorageOutReady || !sysexReady"
                  @click="applyMassStorage(true)"
                >
                  {{ massStorageBusy ? 'Sending…' : massStorageCooldown ? 'Wait…' : 'Enable mass storage' }}
                </button>
                <button
                  type="button"
                  class="mass-storage-button mass-storage-button--off"
                  :disabled="massStorageButtonsLocked || !massStorageOutReady || !sysexReady"
                  @click="applyMassStorage(false)"
                >
                  {{ massStorageBusy ? 'Sending…' : massStorageCooldown ? 'Wait…' : 'Disable mass storage' }}
                </button>
              </div>
              <DeviceNotice
                v-if="massStorageNotice"
                :variant="massStorageNoticeVariant"
                :text="massStorageNotice"
              />
            </div>
          </div>

          <!-- Device settings (SysEx) -->
          <div class="settings-section">
            <div class="section-header" @click="toggleSection('device')">
              <h3>Device settings (SysEx)</h3>
              <span class="toggle-icon">{{ expandedSections.device ? '▼' : '▶' }}</span>
            </div>

            <div v-if="expandedSections.device" class="section-content">
              <DeviceSettingsPanel :expanded="expandedSections.device" :mixerType="mixerTypeOverride" />
            </div>
          </div>

          <!-- Channel Controls Section -->
          <div class="settings-section">
            <div class="section-header" @click="toggleSection('channels')">
              <h3>Channel Controls</h3>
              <span class="toggle-icon">{{ expandedSections.channels ? '▼' : '▶' }}</span>
            </div>
            
            <div v-if="expandedSections.channels" class="section-content">
              <div v-for="channel in editableChannelControls" :key="channel.channel" class="channel-group">
                <h4>Channel {{ channel.channel }}</h4>
                
                <div class="controls-grid">
                  <!-- Volume -->
                  <div class="control-row">
                    <label>Volume (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.volume.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- Pan -->
                  <div class="control-row">
                    <label>Pan (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.pan.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- EQ High -->
                  <div class="control-row">
                    <label>EQ High (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.eq.high.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- EQ Mid -->
                  <div class="control-row">
                    <label>EQ Mid (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.eq.mid.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- EQ Mid Freq -->
                  <div class="control-row">
                    <label>EQ Mid Freq (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.eq.midFreq.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- EQ Low -->
                  <div class="control-row">
                    <label>EQ Low (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.eq.low.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- AUX1 -->
                  <div class="control-row">
                    <label>AUX1 (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.aux1.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- AUX2 -->
                  <div class="control-row">
                    <label>AUX2 (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.aux2.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- EFX Send -->
                  <div class="control-row">
                    <label>EFX Send (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.efxSend.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- SUB MIX (if exists) -->
                  <div v-if="channel.controls.subMix" class="control-row">
                    <label>SUB MIX (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.subMix.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- Mute -->
                  <div class="control-row">
                    <label>Mute (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.mute.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- MONO x2 (if exists) -->
                  <div v-if="channel.controls.monoX2" class="control-row">
                    <label>MONO x2 (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.monoX2.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- USB 1/2 (if exists) -->
                  <div v-if="channel.controls.usb12" class="control-row">
                    <label>USB 1/2 (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.usb12.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- USB 3/4 (if exists) -->
                  <div v-if="channel.controls.usb34" class="control-row">
                    <label>USB 3/4 (CC)</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.usb34.cc"
                      min="0" 
                      max="127"
                      class="cc-input"
                    />
                  </div>
                  
                  <!-- MIDI Channel -->
                  <div class="control-row highlight">
                    <label>MIDI Channel</label>
                    <input 
                      type="number" 
                      v-model.number="channel.controls.volume.channel"
                      min="1" 
                      max="16"
                      class="cc-input"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- Global Controls Section -->
          <div class="settings-section">
            <div class="section-header" @click="toggleSection('global')">
              <h3>Global Controls</h3>
              <span class="toggle-icon">{{ expandedSections.global ? '▼' : '▶' }}</span>
            </div>
            
            <div v-if="expandedSections.global" class="section-content">
              <div class="controls-grid">
                <!-- EFX Type -->
                <div class="control-row">
                  <label>EFX Type (CC)</label>
                  <input 
                    type="number" 
                    v-model.number="editableGlobalControls.efxType.cc"
                    min="0" 
                    max="127"
                    class="cc-input"
                  />
                </div>
                
                <!-- Compressor -->
                <div class="control-row">
                  <label>Compressor (CC)</label>
                  <input 
                    type="number" 
                    v-model.number="editableGlobalControls.compressor.cc"
                    min="0" 
                  max="127"
                  class="cc-input"
                />
              </div>
            </div>
          </div>
        </div>
          
          <!-- Sound Pads Section -->
          <div class="settings-section">
            <div class="section-header" @click="toggleSection('soundPads')">
              <h3>Sound Pads</h3>
              <span class="toggle-icon">{{ expandedSections.soundPads ? '▼' : '▶' }}</span>
            </div>
            
            <div v-if="expandedSections.soundPads" class="section-content">
              <div class="controls-grid">
                <div v-for="pad in editableSoundPads" :key="pad.id" class="control-row">
                  <label>{{ pad.name }} (Note)</label>
                  <input 
                    type="number" 
                    v-model.number="pad.note"
                    min="0" 
                    max="127"
                    class="cc-input"
                  />
                  <span class="note-name">{{ getMidiNoteName(pad.note) }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div class="dialog-footer">
          <button class="reset-button" @click="resetToDefaults">
            Reset to Defaults
          </button>
          <div class="action-buttons">
            <button class="cancel-button" @click="cancel">Cancel</button>
            <button class="save-button" @click="saveChanges">Save Changes</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script lang="ts">
// Helper function to get MIDI note name
function getMidiNoteName(note: number): string {
  if (note < 0 || note > 127) return 'Invalid';
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  const noteName = noteNames[note % 12];
  return `${noteName}${octave}`;
}

export { getMidiNoteName };
</script>

<style scoped>
.advanced-settings-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 20px;
  overflow-y: auto;
}

.advanced-settings-dialog {
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 2px solid #4a90e2;
  border-radius: 12px;
  max-width: 900px;
  width: 100%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 50px rgba(74, 144, 226, 0.3);
}

.dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-bottom: 2px solid #333;
  background: rgba(74, 144, 226, 0.1);
}

.dialog-header h2 {
  color: #4a90e2;
  font-size: 24px;
  font-weight: 600;
  margin: 0;
}

.close-button {
  background: none;
  border: none;
  color: #ccc;
  font-size: 32px;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.2s;
}

.close-button:hover {
  color: #fff;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.warning-text {
  background: rgba(255, 152, 0, 0.1);
  border: 1px solid rgba(255, 152, 0, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  color: #ff9800;
  font-size: 14px;
}

.info-text {
  background: rgba(76, 175, 80, 0.1);
  border: 1px solid rgba(76, 175, 80, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  color: #4caf50;
  font-size: 14px;
}

.global-setting {
  background: rgba(74, 144, 226, 0.15);
  border: 2px solid rgba(74, 144, 226, 0.4);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.global-setting label {
  color: #4a90e2;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.setting-select {
  background: rgba(0, 0, 0, 0.5);
  border: 2px solid #4a90e2;
  border-radius: 6px;
  padding: 10px 16px;
  color: #fff;
  font-size: 16px;
  font-weight: 700;
  min-width: 150px;
  cursor: pointer;
  transition: all 0.2s;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3e%3cpath fill='%234a90e2' d='M6 9L1 4h10z'/%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 12px center;
  padding-right: 40px;
}

.setting-select:focus {
  outline: none;
  border-color: #6aa0f2;
  background-color: rgba(0, 0, 0, 0.7);
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.2);
}

.setting-select:hover {
  border-color: #6aa0f2;
}

.setting-select option {
  background: #1a1a1a;
  color: #fff;
  padding: 8px;
}

.setting-hint {
  color: #888;
  font-size: 12px;
  margin: 0;
  font-style: italic;
}

.settings-section {
  margin-bottom: 24px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.03);
  overflow: hidden;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(74, 144, 226, 0.1);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.section-header:hover {
  background: rgba(74, 144, 226, 0.15);
}

.section-header h3 {
  color: #4a90e2;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.toggle-icon {
  color: #4a90e2;
  font-size: 14px;
}

.section-content {
  padding: 16px;
}

.channel-group {
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.channel-group h4 {
  color: #6aa0f2;
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
}

.control-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.control-row.highlight {
  background: rgba(74, 144, 226, 0.1);
  padding: 8px;
  border-radius: 4px;
  border: 1px solid rgba(74, 144, 226, 0.3);
}

.control-row label {
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
}

.cc-input {
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  padding: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  transition: all 0.2s;
}

.cc-input:focus {
  outline: none;
  border-color: #4a90e2;
  background: rgba(0, 0, 0, 0.7);
}

.cc-input:hover {
  border-color: rgba(255, 255, 255, 0.3);
}

.note-name {
  color: #4a90e2;
  font-size: 12px;
  font-weight: 600;
}

.non-midi-intro {
  color: #bbb;
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 16px 0;
}

.non-midi-intro a {
  color: #6aa0f2;
}

.editor-link {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(74, 144, 226, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-link-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.editor-link-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  color: #ccc;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.editor-link-toggle input {
  width: 18px;
  height: 18px;
  accent-color: #4a90e2;
  cursor: pointer;
}

.editor-link-toggle--secondary {
  font-weight: 500;
  color: #bbb;
}

.link-pill {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: #ccc;
  white-space: nowrap;
}

.link-pill--success {
  border-color: rgba(76, 175, 80, 0.5);
  background: rgba(76, 175, 80, 0.15);
  color: #a5d6a7;
}

.link-pill--warn {
  border-color: rgba(255, 152, 0, 0.5);
  background: rgba(255, 152, 0, 0.12);
  color: #ffcc80;
}

.link-pill--error {
  border-color: rgba(244, 67, 54, 0.5);
  background: rgba(244, 67, 54, 0.12);
  color: #ffcdd2;
}

.mass-storage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-bottom: 12px;
}

.mass-storage-button {
  padding: 10px 18px;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.mass-storage-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.mass-storage-button--on {
  background: #2e7d32;
  color: #fff;
}

.mass-storage-button--on:not(:disabled):hover {
  background: #1b5e20;
}

.mass-storage-button--off {
  background: rgba(255, 255, 255, 0.12);
  color: #e0e0e0;
  border: 1px solid rgba(255, 255, 255, 0.25);
}

.mass-storage-button--off:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.18);
}

.dialog-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  border-top: 2px solid #333;
  background: rgba(0, 0, 0, 0.3);
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.reset-button,
.cancel-button,
.save-button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-button {
  background: #f44336;
  color: white;
}

.reset-button:hover {
  background: #d32f2f;
  transform: translateY(-2px);
}

.cancel-button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ccc;
}

.cancel-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.save-button {
  background: #4caf50;
  color: white;
}

.save-button:hover {
  background: #45a049;
  transform: translateY(-2px);
}

/* Scrollbar styling */
.dialog-content::-webkit-scrollbar {
  width: 8px;
}

.dialog-content::-webkit-scrollbar-track {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

.dialog-content::-webkit-scrollbar-thumb {
  background: rgba(74, 144, 226, 0.5);
  border-radius: 4px;
}

.dialog-content::-webkit-scrollbar-thumb:hover {
  background: rgba(74, 144, 226, 0.7);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .advanced-settings-dialog {
    max-width: 100%;
    margin: 10px;
  }
  
  .controls-grid {
    grid-template-columns: 1fr;
  }
  
  .dialog-footer {
    flex-direction: column;
    gap: 12px;
  }
  
  .action-buttons {
    width: 100%;
  }
  
  .reset-button,
  .cancel-button,
  .save-button {
    width: 100%;
  }
}
</style>

