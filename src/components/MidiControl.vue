<template>
  <div class="midi-control" :class="[`control-${control.type}`, { active: isActive }]">
    <label class="control-label">{{ control.name }}</label>
    
    <!-- Fader -->
    <div v-if="control.type === 'fader'" class="fader-container">
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
        :style="{ transform: `rotate(${knobRotation}deg)` }"
      >
        <div class="knob-indicator"></div>
      </div>
      <div class="value-display">{{ displayValue }}</div>
    </div>
    
    <!-- Toggle Button -->
    <div v-else-if="control.type === 'toggle'" class="toggle-container">
      <button
        class="toggle-button"
        :class="{ active: currentValue > 63 }"
        @click="toggleValue"
      >
        {{ currentValue > 63 ? 'ON' : 'OFF' }}
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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import type { MIDIControl } from '../config/midiConfig';
import { midiService } from '../services/midiService';

interface Props {
  control: MIDIControl;
  modelValue?: number;
}

interface Emits {
  (e: 'update:modelValue', value: number): void;
  (e: 'change', value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: undefined
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

// Methods
function handleInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = parseInt(target.value);
  updateValue(value);
}

function updateValue(value: number) {
  const clampedValue = Math.max(props.control.min, Math.min(props.control.max, value));
  currentValue.value = clampedValue;
  emit('update:modelValue', clampedValue);
  emit('change', clampedValue);
  
  // Send MIDI CC
  midiService.sendControlChange(props.control, clampedValue);
  
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

onMounted(() => {
  // Listen for MIDI input to update control
  midiService.addControlChangeListener((cc, value, channel) => {
    if (cc === props.control.cc && channel === props.control.channel) {
      currentValue.value = value;
      emit('update:modelValue', value);
    }
  });
});

onUnmounted(() => {
  stopDrag();
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

/* Responsive */
@media (max-width: 768px) {
  .midi-control {
    min-width: 50px;
    padding: 6px;
  }
  
  .knob {
    width: 40px;
    height: 40px;
  }
  
  .fader-container {
    height: 120px;
  }
  
  .fader {
    height: 100px;
  }
}
</style>