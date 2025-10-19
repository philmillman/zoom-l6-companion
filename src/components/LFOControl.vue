<template>
  <div class="lfo-control">
    <div class="knobs-container">
      <!-- Rate Knob -->
      <div class="knob-wrapper">
        <div class="knob" 
             @mousedown="startDrag($event, 'rate')" 
             @touchstart="startDrag($event, 'rate')">
          <svg viewBox="0 0 100 100" class="knob-svg">
            <!-- Track -->
            <circle cx="50" cy="50" r="40" class="knob-track" />
            <!-- Arc -->
            <circle cx="50" cy="50" r="40" 
                    class="knob-arc"
                    :stroke-dasharray="arcDashArray"
                    :stroke-dashoffset="getRateArcOffset()" />
            <!-- Center -->
            <circle cx="50" cy="50" r="32" class="knob-center" />
            <!-- Indicator -->
            <line :x1="50" :y1="50" 
                  :x2="50 + 28 * Math.sin(getRateAngle())" 
                  :y2="50 - 28 * Math.cos(getRateAngle())"
                  class="knob-indicator" />
          </svg>
        </div>
        <label class="knob-label">Rate</label>
        <span class="knob-value">{{ local.rate.toFixed(1) }} Hz</span>
      </div>

      <!-- Depth Knob -->
      <div class="knob-wrapper">
        <div class="knob" 
             @mousedown="startDrag($event, 'depth')" 
             @touchstart="startDrag($event, 'depth')">
          <svg viewBox="0 0 100 100" class="knob-svg">
            <!-- Track -->
            <circle cx="50" cy="50" r="40" class="knob-track" />
            <!-- Arc -->
            <circle cx="50" cy="50" r="40" 
                    class="knob-arc"
                    :stroke-dasharray="arcDashArray"
                    :stroke-dashoffset="getDepthArcOffset()" />
            <!-- Center -->
            <circle cx="50" cy="50" r="32" class="knob-center" />
            <!-- Indicator -->
            <line :x1="50" :y1="50" 
                  :x2="50 + 28 * Math.sin(getDepthAngle())" 
                  :y2="50 - 28 * Math.cos(getDepthAngle())"
                  class="knob-indicator" />
          </svg>
        </div>
        <label class="knob-label">Depth</label>
        <span class="knob-value">{{ Math.round(local.depth * 100) }}%</span>
      </div>
    </div>

    <div class="lfo-row">
      <label>Shape</label>
      <select v-model="local.shape" @change="emitConfig">
        <option value="sine">Sine</option>
        <option value="triangle">Triangle</option>
        <option value="square">Square</option>
        <option value="saw">Saw</option>
      </select>
    </div>
    <div class="lfo-row">
      <label>Mode</label>
      <select v-model="local.mode" @change="emitConfig">
        <option value="bipolar">Bipolar</option>
        <option value="positive">Positive</option>
        <option value="negative">Negative</option>
      </select>
    </div>
    <div class="lfo-actions">
      <button class="toggle enable-btn" :class="getEnableButtonClass()" @click="toggleEnable">{{ getEnableButtonText() }}</button>
      <button class="toggle pause-btn" :class="getPauseButtonClass()" @click="togglePause" :disabled="isPauseButtonDisabled">{{ getPauseButtonText() }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

export type LFOShape = 'sine' | 'triangle' | 'square' | 'saw';
export type LFOMode = 'negative' | 'positive' | 'bipolar';
export type LFOState = 'disabled' | 'active' | 'paused';

export interface LFOConfig {
  rate: number;   // Hz
  depth: number;  // 0..1
  shape: LFOShape;
  mode: LFOMode;
  state: LFOState;
}

interface Emits {
  (e: 'update:config', config: LFOConfig): void;
}

interface Props {
  config?: LFOConfig;
}

const emit = defineEmits<Emits>();
const props = defineProps<Props>();

const local = ref<LFOConfig>({
  rate: props.config?.rate ?? 1,
  depth: props.config?.depth ?? 0.3,
  shape: props.config?.shape ?? 'sine',
  mode: props.config?.mode ?? 'bipolar',
  state: props.config?.state ?? 'disabled',
});

// Knob drag state
const dragState = ref<{
  active: boolean;
  param: 'rate' | 'depth' | null;
  startY: number;
  startValue: number;
}>({
  active: false,
  param: null,
  startY: 0,
  startValue: 0,
});

// Knob visual constants
const minAngle = -135 * (Math.PI / 180); // -135 degrees
const maxAngle = 135 * (Math.PI / 180);  // 135 degrees
const arcRadius = 40;
const arcCircumference = 2 * Math.PI * arcRadius;
const arcDashArray = arcCircumference;

function emitConfig() {
  emit('update:config', { ...local.value });
}

function toggleEnable() {
  if (local.value.state === 'disabled') {
    local.value.state = 'active';
  } else {
    local.value.state = 'disabled';
  }
  emitConfig();
}

function togglePause() {
  if (local.value.state === 'active') {
    local.value.state = 'paused';
  } else if (local.value.state === 'paused') {
    local.value.state = 'active';
  }
  emitConfig();
}

function getEnableButtonText(): string {
  return local.value.state === 'disabled' ? 'Enable' : 'Disable';
}

function getPauseButtonText(): string {
  return local.value.state === 'active' ? 'Pause' : 'Resume';
}

function getEnableButtonClass(): string {
  return local.value.state !== 'disabled' ? 'active' : '';
}

function getPauseButtonClass(): string {
  return local.value.state === 'paused' ? 'paused' : '';
}

const isPauseButtonDisabled = ref(false);

// Update disabled state when local state changes
watch(() => local.value.state, (newState) => {
  isPauseButtonDisabled.value = newState === 'disabled';
}, { immediate: true });

// Knob angle calculations
function getRateAngle(): number {
  const normalized = (local.value.rate - 0.1) / (10 - 0.1);
  return minAngle + normalized * (maxAngle - minAngle);
}

function getDepthAngle(): number {
  const normalized = local.value.depth;
  return minAngle + normalized * (maxAngle - minAngle);
}

function getRateArcOffset(): number {
  const angle = getRateAngle();
  const normalizedAngle = (angle - minAngle) / (maxAngle - minAngle);
  return arcCircumference * (1 - normalizedAngle * 0.75);
}

function getDepthArcOffset(): number {
  const angle = getDepthAngle();
  const normalizedAngle = (angle - minAngle) / (maxAngle - minAngle);
  return arcCircumference * (1 - normalizedAngle * 0.75);
}

// Drag handlers
function startDrag(e: MouseEvent | TouchEvent, param: 'rate' | 'depth') {
  e.preventDefault();
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY;
  if (clientY === undefined) return;
  
  dragState.value = {
    active: true,
    param,
    startY: clientY,
    startValue: param === 'rate' ? local.value.rate : local.value.depth,
  };

  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchmove', onDrag);
  document.addEventListener('touchend', stopDrag);
}

function onDrag(e: MouseEvent | TouchEvent) {
  if (!dragState.value.active || !dragState.value.param) return;
  
  e.preventDefault();
  const clientY = e instanceof MouseEvent ? e.clientY : e.touches[0]?.clientY;
  if (clientY === undefined) return;
  const deltaY = dragState.value.startY - clientY; // Inverted: up = increase
  const sensitivity = 0.5;
  
  if (dragState.value.param === 'rate') {
    const range = 10 - 0.1;
    const delta = (deltaY * sensitivity * range) / 100;
    let newValue = dragState.value.startValue + delta;
    newValue = Math.max(0.1, Math.min(10, newValue));
    local.value.rate = Math.round(newValue * 10) / 10;
  } else if (dragState.value.param === 'depth') {
    const delta = (deltaY * sensitivity) / 100;
    let newValue = dragState.value.startValue + delta;
    newValue = Math.max(0, Math.min(1, newValue));
    local.value.depth = Math.round(newValue * 100) / 100;
  }
  
  emitConfig();
}

function stopDrag() {
  dragState.value.active = false;
  dragState.value.param = null;
  
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('touchmove', onDrag);
  document.removeEventListener('touchend', stopDrag);
}

watch(() => props.config, (cfg) => {
  if (cfg) local.value = { ...cfg };
});

onUnmounted(() => {
  stopDrag();
});
</script>

<style scoped>
.lfo-control {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 220px;
}

/* Knobs Container */
.knobs-container {
  display: flex;
  justify-content: space-around;
  gap: 20px;
  padding: 10px 0;
}

.knob-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  flex: 1;
}

.knob {
  width: 80px;
  height: 80px;
  cursor: pointer;
  user-select: none;
  -webkit-user-select: none;
  touch-action: none;
}

.knob:active {
  cursor: grabbing;
}

.knob-svg {
  width: 100%;
  height: 100%;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}

/* Knob SVG Elements */
.knob-track {
  fill: none;
  stroke: #333;
  stroke-width: 4;
}

.knob-arc {
  fill: none;
  stroke: #4a90e2;
  stroke-width: 4;
  stroke-linecap: round;
  transform: rotate(-225deg);
  transform-origin: 50% 50%;
  transition: stroke-dashoffset 0.05s ease-out;
}

.knob-center {
  fill: #2a2a2a;
  stroke: #444;
  stroke-width: 2;
}

.knob-indicator {
  stroke: #fff;
  stroke-width: 3;
  stroke-linecap: round;
}

.knob-label {
  color: #bbb;
  font-size: 12px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.knob-value {
  color: #4a90e2;
  font-size: 13px;
  font-weight: 600;
  min-height: 18px;
}

/* Select rows */
.lfo-row {
  display: grid;
  grid-template-columns: 56px 1fr;
  align-items: center;
  gap: 8px;
}

.lfo-row label {
  color: #bbb;
  font-size: 12px;
}

select {
  width: 100%;
  padding: 6px 8px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #ddd;
  font-size: 12px;
  cursor: pointer;
}

select:focus {
  outline: none;
  border-color: #4a90e2;
}

/* Actions */
.lfo-actions {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 4px;
}

.toggle {
  padding: 8px 16px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #ddd;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.toggle:hover {
  background: #333;
  border-color: #555;
}

.toggle.active {
  background: #4a90e2;
  border-color: #4a90e2;
  color: white;
}

.toggle.active:hover {
  background: #5a9ff2;
  border-color: #5a9ff2;
}

.toggle.paused {
  background: #f5a623;
  border-color: #f5a623;
  color: white;
}

.toggle.paused:hover {
  background: #f7b84d;
  border-color: #f7b84d;
}

.toggle:disabled {
  background: #1a1a1a;
  border-color: #333;
  color: #666;
  cursor: not-allowed;
}

.toggle:disabled:hover {
  background: #1a1a1a;
  border-color: #333;
}
</style>

