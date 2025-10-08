<template>
  <div class="midi-control" :class="[`control-${control.type}`, { active: isActive, compact }]">
    <label class="control-label">{{ control.name }}</label>
    
    <!-- Fader -->
    <div v-if="control.type === 'fader'" class="fader-container" @dblclick.prevent="resetToDefault">
      <input
        type="range"
        :min="control.min"
        :max="control.max"
        :value="currentValue"
        @input="handleInput"
        class="fader"
        orient="vertical"
      />
      <div class="value-display">{{ displayValue }}</div>
    </div>
    
    <!-- Knob -->
    <div v-else-if="control.type === 'knob'" class="knob-container">
      <div
        class="knob"
        @mousedown="startDrag"
        @touchstart="startDrag"
        @dblclick.prevent="resetToDefault"
        :style="{ transform: `rotate(${knobRotation}deg)` }"
      >
        <div class="knob-indicator"></div>
      </div>
      <div class="value-display">
        <span v-if="compact" class="knob-label">{{ control.name }}</span>
        <span v-else>{{ displayValue }}</span>
      </div>
    </div>
    
    <!-- LFO toggle button (bottom-right of container) -->
    <button v-if="control.type === 'knob' && !compact" class="lfo-btn" :class="{ active: lfo.enabled }" @click.stop="openPopover" :title="lfo.enabled ? 'LFO active' : 'Open LFO'" @dblclick.stop.prevent="resetToDefault">
      <span class="lfo-dot" :style="lfoDotStyle"></span>
    </button>
    
    <!-- Centered Dialog Popover -->
    <div v-if="showPopover" class="lfo-overlay" @click="closePopover">
      <div class="lfo-dialog" @click.stop>
        <div class="lfo-dialog-header">
          <div class="lfo-dialog-title">LFO: {{ control.name }}</div>
          <button class="lfo-close" @click="closePopover">×</button>
        </div>
        <LFOControl :config="lfo" @update:config="updateLfoConfig" />
      </div>
    </div>
    
    <!-- Toggle Button -->
    <div v-else-if="control.type === 'toggle'" class="toggle-container">
      <button
        class="toggle-button"
        :class="{ active: currentValue > 63 }"
        @click="toggleValue"
      >
        <span v-if="compact" class="toggle-label">{{ control.name }}</span>
        <span class="toggle-state">{{ currentValue > 63 ? 'ON' : 'OFF' }}</span>
      </button>
    </div>
    
    <!-- Regular Button -->
    <div v-else-if="control.type === 'button'" class="button-container">
      <button
        class="control-button"
        @mousedown="buttonDown"
        @mouseup="buttonUp"
        @touchstart="buttonDown"
        @touchend="buttonUp"
      >
        {{ control.name }}
      </button>
    </div>
    
    <!-- Radio Group -->
    <div v-else-if="control.type === 'radio'" class="radio-container">
      <div class="radio-group">
        <label 
          v-for="option in control.options" 
          :key="option.value"
          class="radio-option"
          :class="{ active: currentValue === option.value }"
        >
          <input
            type="radio"
            :name="`${control.name}-${control.cc}`"
            :value="option.value"
            :checked="currentValue === option.value"
            @change="handleRadioChange(option.value)"
            class="radio-input"
          />
          <span class="radio-label">{{ option.label }}</span>
        </label>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { MIDIControl } from '../config/midiConfig';
import { midiService } from '../services/midiService';
import LFOControl, { type LFOConfig, type LFOShape, type LFOMode } from './LFOControl.vue';

interface Props {
  control: MIDIControl;
  modelValue?: number;
  compact?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: number): void;
  (e: 'change', value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined,
  compact: false
});

const emit = defineEmits<Emits>();

const currentValue = ref(props.modelValue ?? props.control.defaultValue);
const isActive = ref(false);
const isDragging = ref(false);
const dragStartY = ref(0);
const dragStartValue = ref(0);

// Computed properties
const displayValue = computed(() => {
  if (props.control.type === 'toggle') {
    return currentValue.value > 63 ? 'ON' : 'OFF';
  }
  return Math.round(currentValue.value);
});

const knobRotation = computed(() => {
  const range = props.control.max - props.control.min;
  const normalized = (currentValue.value - props.control.min) / range;
  return (normalized * 270) - 135; // -135 to +135 degrees
});

// LFO state
const showPopover = ref(false);
const lfo = ref<LFOConfig>({ rate: 1, depth: 0.3, shape: 'sine', mode: 'bipolar', enabled: false });
const lfoPhaseVal = ref(0);
const lfoBaseValue = ref(props.control.defaultValue);
let lfoRafId = 0;
let lfoLastTime = performance.now();
let lfoPhase = 0; // 0..1

function openPopover() { showPopover.value = true; }
function closePopover() { showPopover.value = false; }

function updateLfoConfig(cfg: LFOConfig) {
  lfo.value = cfg;
}

const lfoDotStyle = computed(() => ({
  transform: `scale(${lfo.value.enabled ? 1 + 0.2 * Math.abs(lfoPhaseVal.value) : 1})`,
}));

function lfoShapeSample(shape: LFOShape, p: number): number {
  switch (shape) {
    case 'sine':
      return Math.sin(p * Math.PI * 2);
    case 'triangle': {
      const t = (p + 0.25) % 1;
      return 1 - 4 * Math.abs(Math.round(t - 0.25) - (t - 0.25));
    }
    case 'square':
      return p < 0.5 ? 1 : -1;
    case 'saw':
      return 2 * ((p + 0.5) % 1) - 1;
  }
}

function applyLFOMode(value: number, mode: LFOMode): number {
  switch (mode) {
    case 'bipolar':
      return value; // -1 to +1, centered on current value
    case 'positive':
      return (value + 1) / 2; // 0 to +1, only positive modulation
    case 'negative':
      return (value - 1) / 2; // -1 to 0, only negative modulation
  }
}

function lfoLoop() {
  const now = performance.now();
  const dt = (now - lfoLastTime) / 1000;
  lfoLastTime = now;
  if (lfo.value.enabled && lfo.value.rate > 0) {
    lfoPhase = (lfoPhase + dt * lfo.value.rate) % 1;
    const rawValue = lfoShapeSample(lfo.value.shape, lfoPhase);
    const modeValue = applyLFOMode(rawValue, lfo.value.mode);
    lfoPhaseVal.value = modeValue;
    const base = lfoBaseValue.value;
    const depth = lfo.value.depth * (props.control.max - props.control.min);
    const modulated = base + modeValue * depth;
    updateValue(modulated);
  }
  lfoRafId = requestAnimationFrame(lfoLoop);
}

function startLfo() {
  cancelAnimationFrame(lfoRafId);
  lfoLastTime = performance.now();
  lfoRafId = requestAnimationFrame(lfoLoop);
}

function stopLfo() {
  cancelAnimationFrame(lfoRafId);
}

watch(() => lfo.value.enabled, (enabled) => {
  if (enabled) startLfo(); else stopLfo();
}, { immediate: true });

// Update base value when user manually changes the control
watch(() => currentValue.value, (newValue) => {
  if (!lfo.value.enabled) {
    lfoBaseValue.value = newValue;
  }
});

// Update base value when LFO is disabled
watch(() => lfo.value.enabled, (enabled) => {
  if (!enabled) {
    lfoBaseValue.value = currentValue.value;
  }
});

// Methods
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value);
  updateValue(value);
}

function updateValue(value: number, fromMidi = false) {
  const clampedValue = Math.max(props.control.min, Math.min(props.control.max, value));
  currentValue.value = clampedValue;
  emit('update:modelValue', clampedValue);
  emit('change', clampedValue);
  
  // Only send MIDI CC if the update is NOT from MIDI input (to avoid feedback loop)
  if (!fromMidi) {
    midiService.sendControlChange(props.control, clampedValue);
  }
  
  // Visual feedback
  isActive.value = true;
  setTimeout(() => { isActive.value = false; }, 150);
}

function toggleValue() {
  const newValue = currentValue.value > 63 ? 0 : 127;
  updateValue(newValue);
}

function buttonDown() {
  updateValue(127);
}

function buttonUp() {
  updateValue(0);
}

function handleRadioChange(value: number) {
  updateValue(value);
}

function startDrag(event: MouseEvent | TouchEvent) {
  isDragging.value = true;
  const clientYRaw = 'touches' in event ? event.touches?.[0]?.clientY : event.clientY;
  const clientY = clientYRaw ?? 0;
  dragStartY.value = clientY;
  dragStartValue.value = currentValue.value;
  
  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('mouseup', stopDrag);
  document.addEventListener('touchmove', handleDrag);
  document.addEventListener('touchend', stopDrag);
  
  event.preventDefault();
}

function handleDrag(event: MouseEvent | TouchEvent) {
  if (!isDragging.value) return;
  
  const clientYRaw = 'touches' in event ? event.touches?.[0]?.clientY : event.clientY;
  const clientY = clientYRaw ?? dragStartY.value;
  const deltaY = dragStartY.value - clientY; // Inverted for natural feel
  const sensitivity = 0.5;
  const deltaValue = deltaY * sensitivity;
  const newValue = dragStartValue.value + deltaValue;
  
  updateValue(newValue);
}

function stopDrag() {
  isDragging.value = false;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('mouseup', stopDrag);
  document.removeEventListener('touchmove', handleDrag);
  document.removeEventListener('touchend', stopDrag);
}

// Reset to default (double-click / double-tap)
function resetToDefault() {
  const value = props.control.defaultValue;
  updateValue(value);
  // When LFO is disabled, also update base value
  if (!lfo.value.enabled) {
    lfoBaseValue.value = value;
  }
}

// Watch for external value changes (e.g., resets)
watch(
  () => props.modelValue,
  (newValue) => {
    if (newValue !== undefined) {
      currentValue.value = newValue;
    }
  },
  { immediate: true }
);

// MIDI input listener reference for cleanup
let midiListener: ((cc: number, value: number, channel: number) => void) | null = null;

onMounted(() => {
  // Listen for MIDI input to update control
  midiListener = (cc, value, channel) => {
    if (cc === props.control.cc && channel === props.control.channel) {
      console.log(`Updating control ${props.control.name} from MIDI: CC${cc} = ${value}`);
      
      // Validate the MIDI value
      if (value === undefined || value === null || isNaN(value)) {
        console.warn(`Invalid MIDI value received for ${props.control.name}: ${value}`);
        return;
      }
      
      // Ensure value is in valid range
      const validValue = Math.max(0, Math.min(127, Math.round(value)));
      console.log(`Validated MIDI value: ${value} -> ${validValue}`);
      
      // Use updateValue with fromMidi=true to avoid feedback loop
      updateValue(validValue, true);
    }
  };
  
  midiService.addControlChangeListener(midiListener);
});

// Method to disable LFO
function disableLfo() {
  lfo.value.enabled = false;
  stopLfo();
}

// Expose methods and state for external access
defineExpose({
  disableLfo,
  lfo
});

onUnmounted(() => {
  stopDrag();
  // Clean up MIDI listener
  if (midiListener) {
    midiService.removeControlChangeListener(midiListener);
    midiListener = null;
  }
});
</script>

<style scoped>
.midi-control {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  background: #2a2a2a;
  transition: all 0.2s ease;
  min-width: 60px;
  position: relative;
}

.midi-control.compact {
  padding: 4px;
  min-width: 40px;
}

.midi-control.active {
  background: #3a3a3a;
  box-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
}

.control-label {
  font-size: 10px;
  color: #ccc;
  margin-bottom: 8px;
  text-align: center;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.midi-control.compact .control-label {
  display: none;
}

.knob-label {
  font-size: 9px;
  color: #4a90e2;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  text-align: center;
}

/* Fader Styles */
.fader-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 150px;
}

.fader {
  writing-mode: bt-lr; /* IE */
  -webkit-appearance: slider-vertical; /* WebKit */
  appearance: slider-vertical; /* Standard */
  width: 20px;
  height: 120px;
  background: #1a1a1a;
  border-radius: 10px;
  outline: none;
}

.fader::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 24px;
  height: 20px;
  background: #4a90e2;
  border-radius: 4px;
  cursor: pointer;
}

.fader::-moz-range-thumb {
  width: 24px;
  height: 20px;
  background: #4a90e2;
  border-radius: 4px;
  cursor: pointer;
  border: none;
}

/* Knob Styles */
.knob-container {
  display: flex;
  flex-direction: column;
  align-items: center;
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
}

.knob:hover {
  border-color: #4a90e2;
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

/* LFO button */
.lfo-btn {
  position: absolute;
  right: 4px;
  bottom: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #222;
  border: 1px solid #555;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.lfo-btn.active { border-color: #4a90e2; box-shadow: 0 0 6px rgba(74,144,226,0.6); }
.lfo-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #4a90e2;
  transition: transform 0.05s linear;
}

/* Centered dialog popover */
.lfo-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.lfo-dialog {
  background: #1f1f1f;
  border: 1px solid #444;
  border-radius: 10px;
  padding: 12px;
  min-width: 300px;
  max-width: 90vw;
}
.lfo-dialog-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.lfo-dialog-title { color: #4a90e2; font-weight: 700; font-size: 14px; }
.lfo-close { background: transparent; color: #bbb; border: none; font-size: 18px; cursor: pointer; }

/* Toggle Button Styles */
.toggle-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.toggle-button {
  width: 50px;
  height: 30px;
  background: #1a1a1a;
  border: 2px solid #4a4a4a;
  border-radius: 15px;
  color: #ccc;
  font-size: 10px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
}

.toggle-label {
  font-size: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  line-height: 1;
}

.toggle-state {
  font-size: 9px;
  font-weight: bold;
  line-height: 1;
}

.toggle-button.active {
  background: #4a90e2;
  border-color: #4a90e2;
  color: white;
}

.toggle-button:hover {
  border-color: #6aa0f2;
}

/* Regular Button Styles */
.button-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.control-button {
  padding: 8px 16px;
  background: #1a1a1a;
  border: 2px solid #4a4a4a;
  border-radius: 6px;
  color: #ccc;
  font-size: 10px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.1s ease;
}

.control-button:active {
  background: #4a90e2;
  border-color: #4a90e2;
  color: white;
}

/* Value Display */
.value-display {
  margin-top: 8px;
  font-size: 10px;
  color: #4a90e2;
  font-weight: bold;
  text-align: center;
  min-height: 12px;
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .midi-control {
    min-width: 50px;
    padding: 6px;
  }
  
  .midi-control.compact {
    min-width: 30px;
    padding: 2px;
  }
  
  .knob {
    width: 40px;
    height: 40px;
  }
  
  .compact .knob {
    width: 30px;
    height: 30px;
  }
  
  .fader-container {
    height: 120px;
  }
  
  .fader {
    height: 100px;
  }
  
  .control-label {
    font-size: 9px;
  }
  
  .compact .control-label {
    font-size: 8px;
  }
  
  .value-display {
    font-size: 9px;
  }
  
  .compact .value-display {
    font-size: 8px;
  }
  
  .compact .knob-label {
    font-size: 8px;
  }
  
  .toggle-button {
    width: 45px;
    height: 28px;
    font-size: 9px;
  }
  
  .compact .toggle-button {
    width: 40px;
    height: 25px;
    font-size: 8px;
  }
  
  .compact .toggle-label {
    font-size: 7px;
  }
  
  .compact .toggle-state {
    font-size: 8px;
  }
  
  .control-button {
    padding: 6px 12px;
    font-size: 9px;
  }
  
  .compact .control-button {
    padding: 4px 8px;
    font-size: 8px;
  }
}

/* Radio Group Styles */
.radio-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.radio-group {
  display: flex;
  flex-direction: row;
  gap: 4px;
  width: 100%;
  flex-wrap: wrap;
  justify-content: center;
}

.radio-option {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  background: #1a1a1a;
  border: 2px solid #4a4a4a;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 60px;
  text-align: center;
  position: relative;
}

.radio-option:hover {
  background: #2a2a2a;
  border-color: #6aa0f2;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
}

.radio-option.active {
  background: #4a90e2;
  border-color: #4a90e2;
  color: white;
  box-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
  transform: translateY(-1px);
}

.radio-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.radio-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #ccc;
  transition: color 0.2s ease;
}

.radio-option.active .radio-label {
  color: white;
}

/* Compact mode for radio groups */
.midi-control.compact .radio-group {
  gap: 2px;
}

.midi-control.compact .radio-option {
  padding: 4px 8px;
  font-size: 9px;
  min-width: 45px;
}

.midi-control.compact .radio-label {
  font-size: 8px;
}

/* Mobile optimizations for radio groups */
@media (max-width: 768px) {
  .radio-group {
    gap: 3px;
    flex-wrap: wrap;
  }
  
  .radio-option {
    padding: 6px 8px;
    font-size: 10px;
    min-width: 50px;
  }
  
  .radio-label {
    font-size: 9px;
  }
}

@media (max-width: 480px) {
  .radio-group {
    gap: 2px;
    flex-wrap: wrap;
  }
  
  .radio-option {
    padding: 4px 6px;
    font-size: 9px;
    min-width: 40px;
  }
  
  .radio-label {
    font-size: 8px;
  }
  
  .compact .toggle-button {
    width: 35px;
    height: 22px;
  }
  
  .compact .toggle-label {
    font-size: 6px;
  }
  
  .compact .toggle-state {
    font-size: 7px;
  }
  
  .compact .knob-label {
    font-size: 7px;
  }
}
</style>