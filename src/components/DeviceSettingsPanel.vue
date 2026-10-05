<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue';
import type { MixerType } from '../config/midiConfig';
import { useDeviceSettings, type DeviceLinkState } from '../composables/useDeviceSettings';
import type { ParamId } from '../midi/sysex/zoomL6/params';
import { midiService } from '../services/midiService';
import { runZoomL6FileTransferHandshake } from '../midi/sysex';
import DeviceNotice from './DeviceNotice.vue';
import DeviceParamField from './DeviceParamField.vue';

interface Props {
  expanded: boolean;
  mixerType: MixerType;
  /**
   * The MIDI channel shared by the app and the mixer (owned by AdvancedSettings). The MIDI Channel
   * field shows it and emits changes up instead of writing the mixer itself.
   */
  midiChannel: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: 'update:midiChannel', channel: number): void;
}>();

const deviceSettings = useDeviceSettings();

// ── link lifecycle: only hold the editor session open while this panel is expanded ─────────
let releaseLink: (() => void) | null = null;

watch(
  () => props.expanded,
  (expanded) => {
    if (expanded) {
      if (!releaseLink) releaseLink = deviceSettings.acquire();
    } else {
      releaseLink?.();
      releaseLink = null;
    }
  },
  { immediate: true },
);

onUnmounted(() => {
  releaseLink?.();
  releaseLink = null;
});

// ── link status line ─────────────────────────────────────────────────────────────
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

const linkLabel = computed(() => LINK_LABELS[deviceSettings.link.value]);
const linkTone = computed<'success' | 'warn' | 'error' | 'idle'>(() => {
  switch (deviceSettings.link.value) {
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

const { linkEnabled } = deviceSettings;

const linkMessage = computed<string | null>(() => {
  if (!deviceSettings.linkEnabled.value) {
    return 'Editor link is off. Turn it on above to change device settings.';
  }
  switch (deviceSettings.link.value) {
    case 'no-sysex':
      return 'SysEx permission was not granted. Reload and approve System Exclusive access for this site.';
    case 'no-editor-port':
      return 'No Zoom “Editor” MIDI port found. Connect the mixer over USB.';
    case 'suspended':
      return 'The editor link is suspended (USB file transfer). Reconnect the device to resume.';
    case 'error':
      return deviceSettings.lastError.value ?? 'The editor link hit an error.';
    default:
      return null;
  }
});

const linkOpen = computed(() => deviceSettings.link.value === 'open');

// ── visibility helper: hide entries whose registry model list excludes the current mixer ────
function visible(id: ParamId): boolean {
  const def = deviceSettings.entry(id);
  return !!def && def.models.includes(props.mixerType);
}

// ── group id lists ───────────────────────────────────────────────────────────────
const midiIds = computed<ParamId[]>(() =>
  (['midiOutMode', 'mixerControlViaMidi', 'midiChannel'] as ParamId[]).filter(visible),
);
const powerIds = computed<ParamId[]>(() =>
  (['batteryType', 'autoPowerOff'] as ParamId[]).filter(visible),
);
const recorderIds = computed<ParamId[]>(() => (['recorderMode'] as ParamId[]).filter(visible));
const l6MaxIds = computed<ParamId[]>(() =>
  (['monitorPoint', 'subOutPoint', 'usbMixMinus', 'usbAudioMode'] as ParamId[]).filter(visible),
);

interface AuxRow {
  ch: number;
  aux1Id: ParamId | null;
  aux2Id: ParamId | null;
}

const auxRows = computed<AuxRow[]>(() => {
  const rows: AuxRow[] = [];
  for (let ch = 1; ch <= 8; ch++) {
    const aux1Id = `aux1SendPoint.ch${ch}` as ParamId;
    const aux2Id = `aux2SendPoint.ch${ch}` as ParamId;
    const v1 = visible(aux1Id);
    const v2 = visible(aux2Id);
    if (v1 || v2) rows.push({ ch, aux1Id: v1 ? aux1Id : null, aux2Id: v2 ? aux2Id : null });
  }
  return rows;
});
const auxIds = computed<ParamId[]>(() =>
  auxRows.value.flatMap((row) => [row.aux1Id, row.aux2Id].filter((id): id is ParamId => id !== null)),
);


const showL6MaxGroup = computed(() => l6MaxIds.value.length > 0);
const showAuxGroup = computed(() => auxRows.value.length > 0);

const allVisibleIds = computed<ParamId[]>(() => [
  ...midiIds.value,
  ...powerIds.value,
  ...recorderIds.value,
  ...l6MaxIds.value,
  ...auxIds.value,
]);

function refreshGroup(ids: ParamId[]): void {
  if (ids.length === 0) return;
  void deviceSettings.refresh(ids);
}

// ── refresh everything once per expand → link-open transition ────────────────────
let refreshedForThisOpen = false;

watch(
  () => props.expanded,
  (expanded) => {
    if (!expanded) refreshedForThisOpen = false;
  },
);

watch(
  [() => props.expanded, linkOpen],
  ([expanded, open]) => {
    if (expanded && open && !refreshedForThisOpen) {
      refreshedForThisOpen = true;
      refreshGroup(allVisibleIds.value);
    }
  },
  { immediate: true },
);

// ── USB mass storage (file transfer) ─────────────────────────────────────────────
// Moved here from the old "Non-MIDI" section. It runs its own hardware-proven handshake
// (fileTransferMode.ts) rather than the editor session, so it works even with the link off.
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

onUnmounted(() => {
  window.clearTimeout(massStorageCooldownTimer);
});
</script>

<template>
  <div class="device-settings-panel">
    <!-- Editor link (SysEx session) -->
    <div class="editor-link">
      <div class="editor-link-row">
        <label class="editor-link-toggle">
          <input type="checkbox" v-model="linkEnabled" />
          <span>Editor link</span>
        </label>
        <span class="link-pill" :class="`link-pill--${linkTone}`">
          {{ linkLabel }}
          <template v-if="linkOpen && deviceSettings.firmware.value">
            · fw {{ deviceSettings.firmware.value }}
          </template>
        </span>
      </div>
      <p class="setting-hint">
        Turn off before launching the official ZOOM L6 Editor.
      </p>
    </div>

    <DeviceNotice
      variant="info"
      subtle
      text="Changes apply to the mixer immediately; they are not part of Save."
    />
    <DeviceNotice v-if="linkMessage" subtle variant="warn" :text="linkMessage" />

    <!-- MIDI -->
    <section v-if="midiIds.length" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>MIDI</h4>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="id in midiIds"
          :key="id"
          :param-id="id"
          :model-value="id === 'midiChannel' ? props.midiChannel : undefined"
          @update:model-value="(channel: number) => emit('update:midiChannel', channel)"
        />
      </div>
      <p v-if="midiIds.includes('midiChannel')" class="setting-hint midi-channel-hint">
        MIDI Channel is shared by the app and the mixer: the mixer updates immediately and all app
        controls switch on Save. Cancel puts the mixer's channel back.
      </p>
    </section>

    <!-- Power -->
    <section v-if="powerIds.length" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>Power</h4>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in powerIds"
          :key="id"
          :param-id="id"
        />
      </div>
    </section>

    <!-- Recorder -->
    <section v-if="recorderIds.length" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>Recorder</h4>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in recorderIds"
          :key="id"
          :param-id="id"
        />
      </div>
    </section>

    <!-- System info -->
    <section class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>System info</h4>
      </div>
      <div class="param-list">
        <div class="device-param-field device-param-field--static">
          <div class="device-param-field__label-row">
            <label class="device-param-field__label">Firmware</label>
          </div>
          <div class="device-param-field__control">
            <span class="device-param-field__value">{{ deviceSettings.firmware.value ?? '--' }}</span>
          </div>
        </div>
      </div>
    </section>

    <!-- L6max routing / USB -->
    <section v-if="showL6MaxGroup" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>L6max routing / USB</h4>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in l6MaxIds"
          :key="id"
          :param-id="id"
        />
      </div>
    </section>

    <!-- AUX send points -->
    <section v-if="showAuxGroup" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>AUX send points</h4>
      </div>
      <div class="param-grid param-grid--2col">
        <template v-for="(row, idx) in auxRows" :key="row.ch">
          <DeviceParamField
            v-if="row.aux1Id"
            :param-id="row.aux1Id"
            :label="`AUX1 ch ${row.ch}`"
          />
          <div v-else class="param-grid__spacer"></div>
          <DeviceParamField v-if="row.aux2Id" :param-id="row.aux2Id" :label="`AUX2 ch ${row.ch}`" />
          <div v-else class="param-grid__spacer"></div>
        </template>
      </div>
    </section>


    <!-- USB mass storage -->
    <section class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>USB mass storage</h4>
      </div>
      <p class="mass-storage-intro">
        Toggle USB file transfer (SD card as a drive). The device will disconnect and re-enumerate on USB when you switch modes. If it gets stuck try ejecting the device on the host or disable from the official Zoom L6 app.
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
    </section>
  </div>
</template>

<style scoped>
.device-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.setting-hint {
  color: #888;
  font-size: 12px;
  margin: 0;
  font-style: italic;
}

.midi-channel-hint {
  margin-top: 8px;
}

/* Editor link + mass storage: moved verbatim from AdvancedSettings' old "Non-MIDI" section. */
.editor-link {
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(74, 144, 226, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
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

.mass-storage-intro {
  color: #bbb;
  font-size: 13px;
  line-height: 1.5;
  margin: 0 0 12px 0;
}

.mass-storage-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 12px 0;
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

.device-settings-group {
  margin-bottom: 20px;
}

.device-settings-group__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.device-settings-group__header h4 {
  color: #6aa0f2;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 0;
}

.param-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.param-grid {
  display: grid;
  gap: 8px;
}

.param-grid--2col {
  grid-template-columns: 1fr 1fr;
}

.param-grid__spacer {
  visibility: hidden;
}

.device-param-field--static {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.device-param-field--static .device-param-field__label {
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.device-param-field--static .device-param-field__value {
  color: #999;
  font-size: 13px;
  font-weight: 600;
}

@media (max-width: 480px) {
  .param-grid--2col {
    grid-template-columns: 1fr;
  }

  .param-grid__spacer {
    display: none;
  }

  .device-settings-group__header {
    flex-wrap: wrap;
  }
}
</style>
