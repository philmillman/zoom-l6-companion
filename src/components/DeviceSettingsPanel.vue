<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue';
import type { MixerType } from '../config/midiConfig';
import { useDeviceSettings, type DeviceLinkState } from '../composables/useDeviceSettings';
import type { ParamId } from '../midi/sysex/zoomL6/params';
import DeviceNotice from './DeviceNotice.vue';
import DeviceParamField from './DeviceParamField.vue';

interface Props {
  expanded: boolean;
  mixerType: MixerType;
}

const props = defineProps<Props>();

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

const linkMessage = computed<string | null>(() => {
  if (!deviceSettings.linkEnabled.value) {
    return 'Editor link (SysEx) is turned off. Enable it in the Non-MIDI section above.';
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
const systemInfoIds = computed<ParamId[]>(() => (['sdInfo'] as ParamId[]).filter(visible));
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

const PAD_NUMBERS = [1, 2, 3, 4] as const;
const PAD_FIELDS = ['mode', 'level', 'note', 'clockSync'] as const;

interface PadGroup {
  pad: number;
  ids: ParamId[];
}

const padGroups = computed<PadGroup[]>(() =>
  PAD_NUMBERS.map((pad) => ({
    pad,
    ids: PAD_FIELDS.map((f) => `pad${pad}.${f}` as ParamId).filter(visible),
  })).filter((group) => group.ids.length > 0),
);
const padIds = computed<ParamId[]>(() => padGroups.value.flatMap((group) => group.ids));
const firstPadFieldId = computed<ParamId | null>(() => padGroups.value[0]?.ids[0] ?? null);

const showL6MaxGroup = computed(() => l6MaxIds.value.length > 0);
const showPadsGroup = computed(() => padGroups.value.length > 0);
const showAuxGroup = computed(() => auxRows.value.length > 0);

const allVisibleIds = computed<ParamId[]>(() => [
  ...midiIds.value,
  ...powerIds.value,
  ...recorderIds.value,
  ...systemInfoIds.value,
  ...l6MaxIds.value,
  ...auxIds.value,
  ...padIds.value,
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
</script>

<template>
  <div class="device-settings-panel">
    <DeviceNotice
      variant="info"
      subtle
      text="Changes apply to the mixer immediately; they are not part of Save."
    />

    <div class="link-status-line">
      Editor link: <strong>{{ linkLabel }}</strong>
      <template v-if="linkOpen && deviceSettings.firmware.value">
        · firmware {{ deviceSettings.firmware.value }}
      </template>
    </div>
    <DeviceNotice v-if="linkMessage" subtle variant="warn" :text="linkMessage" />

    <!-- MIDI -->
    <section v-if="midiIds.length" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>MIDI</h4>
        <button type="button" class="group-refresh-btn" :disabled="!linkOpen" @click="refreshGroup(midiIds)">
          Refresh
        </button>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in midiIds"
          :key="id"
          :param-id="id"
          :show-experimental-hint="idx === 0"
        />
      </div>
    </section>

    <!-- Power -->
    <section v-if="powerIds.length" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>Power</h4>
        <button type="button" class="group-refresh-btn" :disabled="!linkOpen" @click="refreshGroup(powerIds)">
          Refresh
        </button>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in powerIds"
          :key="id"
          :param-id="id"
          :show-experimental-hint="idx === 0"
        />
      </div>
    </section>

    <!-- Recorder -->
    <section v-if="recorderIds.length" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>Recorder</h4>
        <button type="button" class="group-refresh-btn" :disabled="!linkOpen" @click="refreshGroup(recorderIds)">
          Refresh
        </button>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in recorderIds"
          :key="id"
          :param-id="id"
          :show-experimental-hint="idx === 0"
        />
      </div>
    </section>

    <!-- System info -->
    <section class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>System info</h4>
        <button
          type="button"
          class="group-refresh-btn"
          :disabled="!linkOpen"
          @click="refreshGroup(systemInfoIds)"
        >
          Refresh
        </button>
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
        <DeviceParamField v-if="systemInfoIds.includes('sdInfo')" param-id="sdInfo" readonly />
      </div>
    </section>

    <!-- L6max routing / USB -->
    <section v-if="showL6MaxGroup" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>L6max routing / USB</h4>
        <button type="button" class="group-refresh-btn" :disabled="!linkOpen" @click="refreshGroup(l6MaxIds)">
          Refresh
        </button>
      </div>
      <div class="param-list">
        <DeviceParamField
          v-for="(id, idx) in l6MaxIds"
          :key="id"
          :param-id="id"
          :show-experimental-hint="idx === 0"
        />
      </div>
    </section>

    <!-- AUX send points -->
    <section v-if="showAuxGroup" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>AUX send points</h4>
        <button type="button" class="group-refresh-btn" :disabled="!linkOpen" @click="refreshGroup(auxIds)">
          Refresh
        </button>
      </div>
      <div class="param-grid param-grid--2col">
        <template v-for="(row, idx) in auxRows" :key="row.ch">
          <DeviceParamField
            v-if="row.aux1Id"
            :param-id="row.aux1Id"
            :label="`AUX1 ch ${row.ch}`"
            :show-experimental-hint="idx === 0"
          />
          <div v-else class="param-grid__spacer"></div>
          <DeviceParamField v-if="row.aux2Id" :param-id="row.aux2Id" :label="`AUX2 ch ${row.ch}`" />
          <div v-else class="param-grid__spacer"></div>
        </template>
      </div>
    </section>

    <!-- Sound pads -->
    <section v-if="showPadsGroup" class="device-settings-group">
      <div class="device-settings-group__header">
        <h4>Sound pads</h4>
        <button type="button" class="group-refresh-btn" :disabled="!linkOpen" @click="refreshGroup(padIds)">
          Refresh
        </button>
      </div>
      <div v-for="group in padGroups" :key="group.pad">
        <h5 class="pad-heading">Pad {{ group.pad }}</h5>
        <div class="param-list">
          <DeviceParamField
            v-for="id in group.ids"
            :key="id"
            :param-id="id"
            :show-experimental-hint="id === firstPadFieldId"
          />
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.device-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.link-status-line {
  color: #bbb;
  font-size: 13px;
  margin: 4px 0 8px 0;
}

.link-status-line strong {
  color: #6aa0f2;
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

.pad-heading {
  color: #999;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin: 10px 0 6px 0;
}

.group-refresh-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ccc;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  padding: 5px 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.group-refresh-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.group-refresh-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
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
