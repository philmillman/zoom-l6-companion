<script setup lang="ts">
import { ref, reactive, computed, watch, onUnmounted } from 'vue';
import type { ChannelControls, GlobalControls, SoundPad, MixerType } from '../config/midiConfig';
import { PAD_NOTE_NOT_MAPPED, midiNoteLabel } from '../config/midiConfig';
import { channelControls as defaultChannelControls, globalControls as defaultGlobalControls, soundPads as defaultSoundPads } from '../config/midiConfig';
import { channelControlsL6Max, globalControlsL6Max, soundPadsL6Max } from '../config/midiConfigL6Max';
import DeviceSettingsPanel from './DeviceSettingsPanel.vue';
import DeviceNotice from './DeviceNotice.vue';
import { useDeviceSettings } from '../composables/useDeviceSettings';
import { getParam, type ParamId } from '../midi/sysex/zoomL6/params';

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
  channels: false,
  global: false,
  soundPads: false,
  device: false,
});

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
    if (pad.note >= 0 && pad.note !== PAD_NOTE_NOT_MAPPED) {
      noteCounts.set(pad.note, (noteCounts.get(pad.note) || 0) + 1);
    }
  });
  return Array.from(noteCounts.values()).some(count => count > 1);
});


// ── Sound pads: mixer settings laid out like the official ZOOM L6 Editor ─────────────
// Play mode / level / clock sync are mixer-only settings, written immediately (like the Device
// Settings section). MIDI Note is ONE column kept in sync: it writes the mixer immediately AND
// sets this app's trigger note, which (like everything else here) is persisted on Save. Cancel
// reverts the mixer to the notes it had when the dialog opened; Save also pushes notes changed
// without a mixer write (Reset to Defaults).
const deviceSettings = useDeviceSettings();

type PadField = 'mode' | 'level' | 'note' | 'clockSync';
function padParam(padIndex: number, field: PadField): ParamId {
  return `pad${padIndex + 1}.${field}` as ParamId;
}

function enumLabels(id: ParamId): readonly string[] {
  const enc = getParam(id).encoding;
  return enc.kind === 'enum' ? enc.labels : [];
}

const PAD_MODE_OPTIONS = enumLabels('pad1.mode').map((label, value) => ({ value, label }));
/** Raw level v: 00 = −∞, otherwise v − 49 dB in 1 dB steps (01 = −48 … 31 = 0 … 3B = +10). */
const PAD_LEVEL_OPTIONS = Array.from({ length: 0x3b + 1 }, (_, v) => {
  const db = v - 49;
  const sign = db < 0 ? '−' : db > 0 ? '+' : '';
  return { value: v, label: v === 0 ? '−∞' : `${sign}${Math.abs(db)} dB` };
});
const PAD_NOTE_OPTIONS = [
  { value: PAD_NOTE_NOT_MAPPED, label: midiNoteLabel(PAD_NOTE_NOT_MAPPED) },
  ...Array.from({ length: 128 }, (_, n) => ({ value: n, label: midiNoteLabel(n) })),
];
const PAD_CLOCK_SYNC_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'On' },
];

/** MIDI Clock Sync exists only on the L6max (official L6max editor column). */
const showPadClockSync = computed(() => mixerTypeOverride.value === 'l6max');

/** Raw pad level for 0 dB (see PAD_LEVEL_OPTIONS). */
const PAD_LEVEL_0DB = 0x31;

/**
 * Unread mixer values show the first option, matching the other device settings — except Level,
 * which defaults to 0 dB rather than −∞.
 */
function padDeviceValue(padIndex: number, field: PadField): number {
  return deviceSettings.values[padParam(padIndex, field)] ?? (field === 'level' ? PAD_LEVEL_0DB : 0);
}

function padFieldWritable(padIndex: number, field: PadField): boolean {
  return deviceSettings.isWritable(padParam(padIndex, field));
}

function onPadDeviceChange(padIndex: number, field: PadField, event: Event): void {
  const value = Number((event.target as HTMLSelectElement).value);
  if (Number.isNaN(value)) return;
  deviceSettings.set(padParam(padIndex, field), value);
}

/** App notes when the dialog opened (Cancel restores the mixer to these). */
let originalPadNotes: number[] = props.currentSoundPads.map((pad) => pad.note);
/** What this dialog session has asked the mixer to hold (assumed to match the app at open). */
let mixerPadNotes: number[] = [...originalPadNotes];

function onPadNoteChange(padIndex: number, event: Event): void {
  const note = Number((event.target as HTMLSelectElement).value);
  const pad = editableSoundPads[padIndex];
  if (Number.isNaN(note) || !pad) return;
  pad.note = note;
  mixerPadNotes[padIndex] = note;
  deviceSettings.set(padParam(padIndex, 'note'), note);
}

// MIDI channel: one control (Device Settings ▸ MIDI) shared by the app and the mixer, same model as
// the pad notes — the mixer is written immediately, all app controls take the channel on Save.
/** App channel when the dialog opened (Cancel restores the mixer to it). */
let originalMidiChannel = globalMidiChannel.value;
/** Channel this dialog session has asked the mixer to use (assumed to match the app at open). */
let mixerMidiChannel = originalMidiChannel;

function onMidiChannelChange(channel: number): void {
  globalMidiChannel.value = channel;
  mixerMidiChannel = channel;
  deviceSettings.set('midiChannel', channel);
}

/**
 * Brings the mixer to the given pad notes and MIDI channel, writing only what differs from what it
 * was last told and waiting for each write to finish.
 */
async function syncMixer(target: { padNotes: number[]; midiChannel: number }): Promise<void> {
  const changedPads = target.padNotes
    .map((note, padIndex) => (note !== mixerPadNotes[padIndex] ? padIndex : -1))
    .filter((padIndex) => padIndex >= 0);
  const channelChanged = target.midiChannel !== mixerMidiChannel;
  if (changedPads.length === 0 && !channelChanged) return;
  // Hold the editor link for the duration so the writes aren't cut off when the dialog closes.
  const release = deviceSettings.acquire();
  try {
    if (channelChanged) {
      await deviceSettings.setNow('midiChannel', target.midiChannel);
      mixerMidiChannel = target.midiChannel;
    }
    for (const padIndex of changedPads) {
      const note = target.padNotes[padIndex]!;
      await deviceSettings.setNow(padParam(padIndex, 'note'), note);
      mixerPadNotes[padIndex] = note;
    }
  } finally {
    release();
  }
}

const padLinkWritable = computed(() => deviceSettings.isWritable('pad1.mode'));

const padDeviceError = computed<string | null>(() => {
  const fields: PadField[] = ['mode', 'level', 'note', 'clockSync'];
  for (let padIndex = 0; padIndex < editableSoundPads.length; padIndex++) {
    for (const field of fields) {
      const error = deviceSettings.errors[padParam(padIndex, field)];
      if (error) return `Pad ${padIndex + 1}: ${error}`;
    }
  }
  return null;
});

// Hold the editor link open while the Sound Pads section is showing, so mixer writes go out.
let releasePadLink: (() => void) | null = null;
watch(
  () => props.isVisible && expandedSections.soundPads,
  (active) => {
    if (active && !releasePadLink) {
      releasePadLink = deviceSettings.acquire();
    } else if (!active && releasePadLink) {
      releasePadLink();
      releasePadLink = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  releasePadLink?.();
  releasePadLink = null;
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
async function saveChanges() {
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
  // Notes/channel changed without a mixer write (e.g. Reset to Defaults) reach the mixer on Save.
  await syncMixer({
    padNotes: editableSoundPads.map((pad) => pad.note),
    midiChannel: globalMidiChannel.value,
  });
  emit('close');
}

// Close without saving
async function cancel() {
  if (confirm('Are you sure? Any unsaved changes will be lost.')) {
    // Pad notes / MIDI channel were already sent to the mixer; put them back the way they were.
    await syncMixer({ padNotes: originalPadNotes, midiChannel: originalMidiChannel });
    emit('close');
  }
}

function toggleSection(section: keyof typeof expandedSections) {
  expandedSections[section] = !expandedSections[section];
}

// Watch for mixer type changes to update defaults if needed
watch(mixerTypeOverride, (newType) => {
  // Optionally reload defaults when mixer type changes
  // User can manually change this or use reset to defaults
});

// Watch for dialog open to reload current settings
watch(() => props.isVisible, (visible) => {
  if (visible) {
    // Reload settings from current props when dialog opens
    Object.assign(editableChannelControls, JSON.parse(JSON.stringify(props.currentChannelControls)));
    Object.assign(editableGlobalControls, JSON.parse(JSON.stringify(props.currentGlobalControls)));
    Object.assign(editableSoundPads, JSON.parse(JSON.stringify(props.currentSoundPads)));
    mixerTypeOverride.value = props.currentMixerType;
    
    // Update MIDI channel from current settings
    globalMidiChannel.value = editableChannelControls[0]?.controls.volume.channel || 1;

    // Snapshot pad notes + MIDI channel for Cancel's mixer revert / Save's mixer sync
    originalPadNotes = props.currentSoundPads.map((pad) => pad.note);
    mixerPadNotes = [...originalPadNotes];
    originalMidiChannel = globalMidiChannel.value;
    mixerMidiChannel = originalMidiChannel;
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
          

          <!-- Device Settings (SysEx, mass storage, editor link) -->
          <div class="settings-section">
            <div class="section-header" @click="toggleSection('device')">
              <h3>Device Settings</h3>
              <span class="toggle-icon">{{ expandedSections.device ? '▼' : '▶' }}</span>
            </div>

            <div v-if="expandedSections.device" class="section-content">
              <DeviceSettingsPanel
                :expanded="expandedSections.device"
                :mixerType="mixerTypeOverride"
                :midiChannel="globalMidiChannel"
                @update:midiChannel="onMidiChannelChange"
              />
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
              <p class="setting-hint pad-settings-hint">
                {{ showPadClockSync ? 'Play mode, level and MIDI clock sync' : 'Play mode and level' }} apply to the mixer immediately.
                MIDI Note updates the mixer immediately and this app's pad on Save; Cancel puts the mixer's notes back.
              </p>
              <DeviceNotice
                v-if="!padLinkWritable"
                subtle
                variant="warn"
                text="Editor link isn't open, so pad settings can't be sent to the mixer. Check Device Settings."
              />
              <div class="pad-settings" :class="{ 'pad-settings--clock': showPadClockSync }">
                <div v-for="(pad, padIndex) in editableSoundPads" :key="pad.id" class="pad-settings-row">
                  <div class="pad-settings-badge" :title="pad.name">{{ pad.id }}</div>

                  <div class="control-row">
                    <label :for="`pad-${pad.id}-mode`">Play mode</label>
                    <select
                      :id="`pad-${pad.id}-mode`"
                      class="setting-select"
                      :disabled="!padFieldWritable(padIndex, 'mode')"
                      :value="padDeviceValue(padIndex, 'mode')"
                      @change="onPadDeviceChange(padIndex, 'mode', $event)"
                    >
                      <option v-for="opt in PAD_MODE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>

                  <div class="control-row">
                    <label :for="`pad-${pad.id}-level`">Level</label>
                    <select
                      :id="`pad-${pad.id}-level`"
                      class="setting-select"
                      :disabled="!padFieldWritable(padIndex, 'level')"
                      :value="padDeviceValue(padIndex, 'level')"
                      @change="onPadDeviceChange(padIndex, 'level', $event)"
                    >
                      <option v-for="opt in PAD_LEVEL_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>

                  <div class="control-row">
                    <label :for="`pad-${pad.id}-note`">MIDI Note</label>
                    <select
                      :id="`pad-${pad.id}-note`"
                      class="setting-select"
                      :value="pad.note"
                      @change="onPadNoteChange(padIndex, $event)"
                    >
                      <option v-for="opt in PAD_NOTE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>

                  <div v-if="showPadClockSync" class="control-row">
                    <label :for="`pad-${pad.id}-clock`">MIDI Clock Sync</label>
                    <select
                      :id="`pad-${pad.id}-clock`"
                      class="setting-select"
                      :disabled="!padFieldWritable(padIndex, 'clockSync')"
                      :value="padDeviceValue(padIndex, 'clockSync')"
                      @change="onPadDeviceChange(padIndex, 'clockSync', $event)"
                    >
                      <option v-for="opt in PAD_CLOCK_SYNC_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                    </select>
                  </div>
                </div>
              </div>
              <DeviceNotice v-if="padDeviceError" subtle variant="error" :text="padDeviceError" />
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
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 10px 16px;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
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
  border-color: #4a90e2;
  background-color: rgba(0, 0, 0, 0.7);
  box-shadow: 0 0 0 3px rgba(74, 144, 226, 0.2);
}

.setting-select:hover {
  border-color: rgba(255, 255, 255, 0.3);
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

/* Sound pads: one row per pad, laid out like the official ZOOM L6 Editor. Controls reuse the
   existing .setting-select / .control-row styles; rows match the Device Settings rows. */
.pad-settings-hint {
  margin-bottom: 12px;
}

.pad-settings {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0;
}

.pad-settings-row {
  display: grid;
  grid-template-columns: 48px repeat(3, minmax(0, 1fr));
  align-items: end;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.pad-settings--clock .pad-settings-row {
  grid-template-columns: 48px repeat(4, minmax(0, 1fr));
}

.pad-settings-row .setting-select {
  min-width: 0;
  width: 100%;
}

.pad-settings-row .setting-select:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Echoes the main-view pad buttons (SoundPads.vue). */
.pad-settings-badge {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 10px;
  color: #fff;
  font-size: 20px;
  font-weight: 700;
}

@media (max-width: 600px) {
  .pad-settings-row,
  .pad-settings--clock .pad-settings-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .pad-settings-badge {
    grid-column: 1 / -1;
  }
}

@media (max-width: 480px) {
  .pad-settings-row,
  .pad-settings--clock .pad-settings-row {
    grid-template-columns: minmax(0, 1fr);
  }
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

