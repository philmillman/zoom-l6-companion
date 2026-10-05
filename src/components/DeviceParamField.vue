<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { getParam } from '../midi/sysex/zoomL6/params';
import type { ParamId } from '../midi/sysex/zoomL6/params';
import { useDeviceSettings } from '../composables/useDeviceSettings';

interface Props {
  paramId: ParamId;
  label?: string;
  readonly?: boolean;
  /**
   * Controlled mode: when set, the parent owns the value (e.g. a setting shared by the app and the
   * mixer). The field shows this value and emits `update:modelValue` instead of writing the mixer
   * itself, and it stays editable even when the editor link is closed.
   */
  modelValue?: number;
}

const props = withDefaults(defineProps<Props>(), {
  label: undefined,
  readonly: false,
  modelValue: undefined,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: number): void;
}>();

const deviceSettings = useDeviceSettings();
const def = computed(() => getParam(props.paramId));

const displayLabel = computed(() => props.label ?? def.value.label);
const controlled = computed(() => props.modelValue !== undefined);
const value = computed<number | undefined>(() =>
  controlled.value ? props.modelValue : deviceSettings.values[props.paramId],
);
const paramStatus = computed(() => deviceSettings.status[props.paramId] ?? 'idle');
const errorText = computed(() => deviceSettings.errors[props.paramId] ?? null);

const isReadOnly = computed(() => props.readonly || def.value.readOnly === true);
const isTextOnly = computed(() => isReadOnly.value || def.value.encoding.kind === 'ascii');
const disabled = computed(
  () => isReadOnly.value || (!controlled.value && !deviceSettings.isWritable(props.paramId)),
);

/** Writes the mixer, or hands the value to the parent in controlled mode. */
function commit(next: number): void {
  if (controlled.value) {
    emit('update:modelValue', next);
  } else {
    deviceSettings.set(props.paramId, next);
  }
}


const statusTitle = computed(() => {
  if (paramStatus.value === 'error') return errorText.value ?? 'Error';
  return paramStatus.value;
});

// ── enum control ─────────────────────────────────────────────────────────────
function onEnumChange(event: Event): void {
  const raw = Number((event.target as HTMLSelectElement).value);
  if (Number.isNaN(raw)) return;
  commit(raw);
}

// ── bool control ─────────────────────────────────────────────────────────────
function toggleBool(): void {
  if (disabled.value) return;
  commit(value.value === 1 ? 0 : 1);
}

// ── numeric control (with optional specialValues combo) ─────────────────────
const hasSpecialValues = computed(
  () => def.value.specialValues !== undefined && Object.keys(def.value.specialValues).length > 0,
);
const specialOptions = computed(() => {
  const special = def.value.specialValues;
  if (!special) return [];
  return Object.entries(special).map(([k, optLabel]) => ({ value: Number(k), label: optLabel }));
});
const isCurrentValueSpecial = computed(
  () => value.value !== undefined && !!def.value.specialValues && Object.prototype.hasOwnProperty.call(def.value.specialValues, value.value),
);
/** True while the user has picked "Custom value…" but has not typed a number yet. */
const manualEntry = ref(false);
watch(isCurrentValueSpecial, (isSpecial) => {
  if (isSpecial) manualEntry.value = false;
});

const specialSelectValue = computed<number | '__custom'>(() => {
  if (!manualEntry.value && isCurrentValueSpecial.value && value.value !== undefined) return value.value;
  return '__custom';
});

function onSpecialSelectChange(event: Event): void {
  const raw = (event.target as HTMLSelectElement).value;
  if (raw === '__custom') {
    manualEntry.value = true;
    return;
  }
  manualEntry.value = false;
  const num = Number(raw);
  if (!Number.isNaN(num)) commit(num);
}

function clampToRange(n: number): number {
  const { min, max } = def.value.range;
  return Math.min(max, Math.max(min, n));
}

function onNumberChange(event: Event): void {
  const raw = Number((event.target as HTMLInputElement).value);
  if (Number.isNaN(raw)) return;
  commit(clampToRange(raw));
}

const showNumberInput = computed(() => !hasSpecialValues.value || specialSelectValue.value === '__custom');
</script>

<template>
  <div class="device-param-field" :class="{ 'device-param-field--disabled': disabled }">
    <div class="device-param-field__label-row">
      <label class="device-param-field__label" :title="def.description">
        {{ displayLabel }}
        <span
          v-if="!def.verified"
          class="experimental-badge"
          title="Not yet verified against real hardware"
        >experimental</span>
      </label>
      <span
        class="status-dot"
        :class="`status-dot--${paramStatus}`"
        :title="statusTitle"
      ></span>
    </div>

    <div class="device-param-field__control">
      <!-- read-only / ascii -->
      <span v-if="isTextOnly" class="device-param-field__value">{{ value ?? '--' }}</span>

      <!-- enum -->
      <select
        v-else-if="def.encoding.kind === 'enum'"
        class="setting-select device-param-field__select"
        :disabled="disabled"
        :value="value ?? 0"
        @change="onEnumChange"
      >
        <option v-for="(optLabel, idx) in def.encoding.labels" :key="idx" :value="idx">
          {{ optLabel }}
        </option>
      </select>

      <!-- bool -->
      <button
        v-else-if="def.encoding.kind === 'bool'"
        type="button"
        class="toggle-button"
        :class="{ active: value === 1 }"
        :disabled="disabled"
        @click="toggleBool"
      >
        <span class="toggle-state">{{ value === 1 ? 'ON' : 'OFF' }}</span>
      </button>

      <!-- numeric with discrete choices (e.g. MIDI channel 1-16) -->
      <select
        v-else-if="def.choices"
        class="setting-select device-param-field__select"
        :disabled="disabled"
        :value="value ?? def.choices[0]?.value"
        @change="onEnumChange"
      >
        <option v-for="choice in def.choices" :key="choice.value" :value="choice.value">
          {{ choice.label }}
        </option>
      </select>

      <!-- numeric (u7 / u14le / u28le), optionally combined with specialValues -->
      <div v-else class="device-param-field__numeric">
        <select
          v-if="hasSpecialValues"
          class="setting-select device-param-field__select"
          :disabled="disabled"
          :value="specialSelectValue"
          @change="onSpecialSelectChange"
        >
          <option v-for="opt in specialOptions" :key="opt.value" :value="opt.value">
            {{ opt.label }}
          </option>
          <option value="__custom">Custom value…</option>
        </select>
        <input
          v-if="showNumberInput"
          type="number"
          class="cc-input device-param-field__number"
          :disabled="disabled"
          :min="def.range.min"
          :max="def.range.max"
          :step="def.range.step ?? 1"
          :value="value ?? ''"
          @change="onNumberChange"
        />
        <span v-if="def.range.unit" class="device-param-field__unit">{{ def.range.unit }}</span>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* Shared control look: copied from AdvancedSettings.vue (its styles are scoped, so they don't
   reach into this child component). Keep in sync with .setting-select / .cc-input there. */
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

.setting-hint {
  color: #888;
  font-size: 12px;
  margin: 0;
  font-style: italic;
}

.device-param-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 6px 12px;
  padding: 8px 10px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.device-param-field--disabled {
  opacity: 0.75;
}

.device-param-field__label-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.device-param-field__label {
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.experimental-badge {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 5px;
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #ff9800;
  border: 1px solid #ff9800;
  border-radius: 3px;
  vertical-align: middle;
  white-space: nowrap;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
  flex-shrink: 0;
}

.status-dot--reading,
.status-dot--writing {
  background: #4a90e2;
  box-shadow: 0 0 4px rgba(74, 144, 226, 0.8);
}

.status-dot--ok {
  background: #4caf50;
}

.status-dot--error {
  background: #f44336;
  box-shadow: 0 0 4px rgba(244, 67, 54, 0.7);
}

.device-param-field__control {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.device-param-field__value {
  color: #999;
  font-size: 13px;
  font-weight: 600;
}


.device-param-field__numeric {
  display: flex;
  align-items: center;
  gap: 6px;
}

.device-param-field__number {
  width: 80px;
}

.device-param-field__unit {
  color: #888;
  font-size: 11px;
  font-weight: 600;
}

.device-param-field .toggle-button {
  width: 50px;
  height: 28px;
  background: #1a1a1a;
  border: 2px solid #4a4a4a;
  border-radius: 14px;
  color: #ccc;
  font-size: 9px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.device-param-field .toggle-button.active {
  background: #4a90e2;
  border-color: #4a90e2;
  color: white;
}

.device-param-field .toggle-button:hover:not(:disabled) {
  border-color: #6aa0f2;
}

.device-param-field .toggle-button:disabled,
.device-param-field__select:disabled,
.device-param-field__number:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 480px) {
  .device-param-field {
    flex-direction: column;
    align-items: stretch;
  }

  .device-param-field__control {
    margin-left: 0;
    width: 100%;
    justify-content: space-between;
  }

  .device-param-field__select {
    flex: 1;
    min-width: 0;
  }
}
</style>
