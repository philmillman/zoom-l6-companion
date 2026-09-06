<template>
  <div class="param-knob" :class="{ compact, disabled: !isInteractive }">
    <label v-if="!compact" class="param-knob-label">{{ def.label }}</label>
    <div
      ref="knobEl"
      class="knob"
      :class="{ active: isDragging }"
      tabindex="0"
      role="slider"
      :aria-label="def.label"
      :aria-valuemin="def.range.min"
      :aria-valuemax="def.range.max"
      :aria-valuenow="displayNumber ?? undefined"
      :aria-disabled="!isInteractive"
      :style="{ transform: `rotate(${knobRotation}deg)` }"
      @pointerdown="startDrag"
      @pointermove="onPointerMove"
      @pointerup="stopDrag"
      @pointercancel="stopDrag"
      @dblclick.prevent="resetToMidpoint"
      @wheel.prevent="onWheel"
      @keydown="onKeydown"
    >
      <div class="knob-indicator"></div>
      <span
        v-if="statusDotVisible"
        class="status-dot"
        :class="statusDotClass"
        :title="statusTitle"
      ></span>
    </div>
    <div class="param-knob-footer">
      <span v-if="compact" class="param-knob-inline-label">{{ def.label }}</span>
      <span v-else class="param-knob-value">{{ displayText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { getParam, type ParamId } from '../midi/sysex/zoomL6/params';
import { useDeviceSettings } from '../composables/useDeviceSettings';

interface Props {
  paramId: ParamId;
  compact?: boolean;
  disabled?: boolean;
  /** Display-only hook for a future LFO pass: overrides the readout/rotation without writing. */
  modulatedValue?: number;
}

const props = withDefaults(defineProps<Props>(), {
  compact: false,
  disabled: false,
  modulatedValue: undefined,
});

const deviceSettings = useDeviceSettings();
const def = computed(() => getParam(props.paramId));

const rawValue = computed<number | undefined>(() => deviceSettings.values[props.paramId]);
const status = computed(() => deviceSettings.status[props.paramId] ?? 'idle');
const errorText = computed(() => deviceSettings.errors[props.paramId] ?? null);

const midpoint = computed(() => {
  const { min, max, step } = def.value.range;
  return snapToStep((min + max) / 2, step);
});

/** The value driving rotation/readout: modulated override > device value > midpoint (for display). */
const displayNumber = computed<number | undefined>(() => {
  if (props.modulatedValue !== undefined) return props.modulatedValue;
  return rawValue.value;
});

const isLoading = computed(() => rawValue.value === undefined || status.value === 'reading');

// Draggable only when the caller hasn't disabled it AND the editor link can actually accept a
// write for this parameter. Without the isWritable check the knob would optimistically move on a
// closed/stale/suspended link and then snap back once the write fails, fighting the user.
const isInteractive = computed(() => !props.disabled && deviceSettings.isWritable(props.paramId));

const displayText = computed(() => {
  if (isLoading.value && props.modulatedValue === undefined) return '--';
  const value = displayNumber.value;
  if (value === undefined) return '--';
  const special = def.value.specialValues?.[value];
  if (special) return special;
  const rounded = Math.round(value);
  return def.value.range.unit ? `${rounded} ${def.value.range.unit}` : `${rounded}`;
});

const knobRotation = computed(() => {
  const { min, max } = def.value.range;
  const range = max - min || 1;
  const value = displayNumber.value ?? midpoint.value;
  const normalized = (value - min) / range;
  return normalized * 270 - 135; // -135 to +135 degrees
});

const statusDotVisible = computed(() => status.value === 'reading' || status.value === 'writing' || status.value === 'error');
const statusDotClass = computed(() => ({
  reading: status.value === 'reading',
  writing: status.value === 'writing',
  error: status.value === 'error',
}));
const statusTitle = computed(() => (status.value === 'error' ? errorText.value ?? 'Error' : undefined));

function snapToStep(value: number, step?: number): number {
  const s = step ?? 1;
  return Math.round(value / s) * s;
}

function clamp(value: number): number {
  const { min, max } = def.value.range;
  return Math.min(max, Math.max(min, value));
}

function commit(value: number): void {
  const snapped = clamp(snapToStep(value, def.value.range.step));
  deviceSettings.set(props.paramId, snapped);
}

// ── drag ──────────────────────────────────────────────────────────────────────
const knobEl = ref<HTMLElement | null>(null);
const isDragging = ref(false);
let dragStartY = 0;
let dragStartValue = 0;

function sensitivityFor(fine: boolean): number {
  const { min, max, step } = def.value.range;
  const base = Math.max(step ?? 1, (max - min) / 200);
  return fine ? base / 10 : base;
}

function startDrag(event: PointerEvent): void {
  if (!isInteractive.value) return;
  isDragging.value = true;
  dragStartY = event.clientY;
  dragStartValue = rawValue.value ?? midpoint.value;
  knobEl.value?.setPointerCapture(event.pointerId);
  knobEl.value?.focus();
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!isDragging.value) return;
  const deltaY = dragStartY - event.clientY; // up = increase
  const sensitivity = sensitivityFor(event.shiftKey);
  commit(dragStartValue + deltaY * sensitivity);
}

function stopDrag(event: PointerEvent): void {
  if (!isDragging.value) return;
  isDragging.value = false;
  try {
    knobEl.value?.releasePointerCapture(event.pointerId);
  } catch {
    /* pointer may already be released */
  }
}

// ── double-click reset ──────────────────────────────────────────────────────────
// There is no known device default for these parameters yet, so double-click resets
// to the midpoint of the documented range instead.
function resetToMidpoint(): void {
  if (!isInteractive.value) return;
  commit(midpoint.value);
}

// ── wheel (optional convenience) ────────────────────────────────────────────────
function onWheel(event: WheelEvent): void {
  if (!isInteractive.value) return;
  const step = def.value.range.step ?? 1;
  const amount = (event.shiftKey ? step * 10 : step) * (event.deltaY > 0 ? -1 : 1);
  commit((rawValue.value ?? midpoint.value) + amount);
}

// ── keyboard ─────────────────────────────────────────────────────────────────────
function onKeydown(event: KeyboardEvent): void {
  if (!isInteractive.value) return;
  const step = def.value.range.step ?? 1;
  const base = rawValue.value ?? midpoint.value;
  switch (event.key) {
    case 'ArrowUp':
    case 'ArrowRight':
      event.preventDefault();
      commit(base + step);
      break;
    case 'ArrowDown':
    case 'ArrowLeft':
      event.preventDefault();
      commit(base - step);
      break;
    case 'PageUp':
      event.preventDefault();
      commit(base + step * 10);
      break;
    case 'PageDown':
      event.preventDefault();
      commit(base - step * 10);
      break;
    default:
      break;
  }
}

onUnmounted(() => {
  isDragging.value = false;
});
</script>

<style scoped>
.param-knob {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  min-width: 60px;
}

.param-knob.compact {
  padding: 4px;
  min-width: 40px;
}

.param-knob.disabled {
  opacity: 0.5;
  pointer-events: none;
}

.param-knob-label {
  font-size: 10px;
  color: #ccc;
  margin-bottom: 8px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.knob {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  background: linear-gradient(145deg, #3a3a3a, #1a1a1a);
  border: 2px solid #4a4a4a;
  cursor: pointer;
  position: relative;
  transition: transform 0.1s ease;
  touch-action: none;
}

.knob:hover {
  border-color: #4a90e2;
}

.knob:focus-visible {
  outline: 2px solid #4a90e2;
  outline-offset: 2px;
}

.knob.active {
  border-color: #4a90e2;
  box-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
}

.param-knob.compact .knob {
  width: 40px;
  height: 40px;
}

.knob-indicator {
  position: absolute;
  top: 5px;
  left: 50%;
  width: 2px;
  height: 15px;
  background: #4a90e2;
  transform: translateX(-50%);
  border-radius: 1px;
}

.status-dot {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid #1a1a1a;
  background: #888;
}

.status-dot.reading {
  background: #999;
  animation: param-knob-pulse 1.1s ease-in-out infinite;
}

.status-dot.writing {
  background: #4a90e2;
  box-shadow: 0 0 4px rgba(74, 144, 226, 0.8);
}

.status-dot.error {
  background: #f44336;
  box-shadow: 0 0 4px rgba(244, 67, 54, 0.8);
}

@keyframes param-knob-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 1; }
}

.param-knob-footer {
  margin-top: 8px;
  min-height: 12px;
  text-align: center;
}

.param-knob-value {
  font-size: 10px;
  color: #4a90e2;
  font-weight: bold;
}

.param-knob-inline-label {
  font-size: 9px;
  color: #4a90e2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

@media (max-width: 768px) {
  .param-knob {
    min-width: 44px;
  }

  .knob {
    width: 44px;
    height: 44px;
  }

  .param-knob.compact .knob {
    width: 40px;
    height: 40px;
  }
}
</style>
