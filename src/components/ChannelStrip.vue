<template>
  <div class="channel-strip" :class="{ compact: compactMode }">
    <div class="channel-header">
      <h3 class="channel-title">CH {{ channelData.channel }}</h3>
    </div>
    
    <!-- Compact Mode: All controls in single row -->
    <div v-if="compactMode" class="compact-controls">
      <MidiControl
        :control="createCompactControl(channelData.controls.eq.high, 'hi')"
        v-model="values.eqHigh"
        @change="onControlChange('eqHigh', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.eq.mid, 'mid')"
        v-model="values.eqMid"
        @change="onControlChange('eqMid', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.eq.midFreq, 'freq')"
        v-model="values.eqMidFreq"
        @change="onControlChange('eqMidFreq', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.eq.low, 'lo')"
        v-model="values.eqLow"
        @change="onControlChange('eqLow', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.aux1, 'aux1')"
        v-model="values.aux1"
        @change="onControlChange('aux1', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.aux2, 'aux2')"
        v-model="values.aux2"
        @change="onControlChange('aux2', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.efxSend, 'efx')"
        v-model="values.efxSend"
        @change="onControlChange('efxSend', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.pan, 'pan')"
        v-model="values.pan"
        @change="onControlChange('pan', $event)"
        :compact="true"
      />
      <MidiControl
        :control="createCompactControl(channelData.controls.volume, 'vol')"
        v-model="values.volume"
        @change="onControlChange('volume', $event)"
        :compact="true"
      />
      <div class="compact-control-slot">
        <MidiControl
          v-if="channelData.controls.monoX2"
          :control="createCompactControl(channelData.controls.monoX2, 'mono')"
          v-model="values.monoX2"
          @change="onControlChange('monoX2', $event)"
          :compact="true"
        />
        <MidiControl
          v-else-if="channelData.controls.usb12"
          :control="createCompactControl(channelData.controls.usb12, 'usb12')"
          v-model="values.usb12"
          @change="onControlChange('usb12', $event)"
          :compact="true"
        />
        <MidiControl
          v-else-if="channelData.controls.usb34"
          :control="createCompactControl(channelData.controls.usb34, 'usb34')"
          v-model="values.usb34"
          @change="onControlChange('usb34', $event)"
          :compact="true"
        />
      </div>
      <MidiControl
        :control="createCompactControl(channelData.controls.mute, 'mute')"
        v-model="values.mute"
        @change="onControlChange('mute', $event)"
        :compact="true"
      />
    </div>
    
    <!-- Normal Mode: Grouped sections -->
    <div v-else class="controls-section">
      <!-- EQ Section -->
      <div class="eq-section">
        <div class="section-title">EQ</div>
        <div class="eq-controls">
          <MidiControl
            :control="channelData.controls.eq.high"
            v-model="values.eqHigh"
            @change="onControlChange('eqHigh', $event)"
            ref="eqHighRef"
          />
          <MidiControl
            :control="channelData.controls.eq.mid"
            v-model="values.eqMid"
            @change="onControlChange('eqMid', $event)"
            ref="eqMidRef"
          />
          <MidiControl
            :control="channelData.controls.eq.midFreq"
            v-model="values.eqMidFreq"
            @change="onControlChange('eqMidFreq', $event)"
            ref="eqMidFreqRef"
          />
          <MidiControl
            :control="channelData.controls.eq.low"
            v-model="values.eqLow"
            @change="onControlChange('eqLow', $event)"
            ref="eqLowRef"
          />
        </div>
      </div>
      
      <!-- Sends -->
      <div class="aux-section">
        <div class="section-title">Sends</div>
        <div class="aux-controls">
          <MidiControl
            :control="channelData.controls.aux1"
            v-model="values.aux1"
            @change="onControlChange('aux1', $event)"
            ref="aux1Ref"
          />
          <MidiControl
            :control="channelData.controls.aux2"
            v-model="values.aux2"
            @change="onControlChange('aux2', $event)"
            ref="aux2Ref"
          />
          <MidiControl
            :control="channelData.controls.efxSend"
            v-model="values.efxSend"
            @change="onControlChange('efxSend', $event)"
            ref="efxSendRef"
          />
        </div>
      </div>
      
      <!-- Main (Pan, Level, Buttons) -->
      <div class="main-section">
        <div class="section-title">Main</div>
        <div class="main-controls">
          <MidiControl
            :control="channelData.controls.pan"
            v-model="values.pan"
            @change="onControlChange('pan', $event)"
            ref="panRef"
          />
          <MidiControl
            :control="channelData.controls.volume"
            v-model="values.volume"
            @change="onControlChange('volume', $event)"
            ref="volumeRef"
          />
          <MidiControl
            v-if="channelData.controls.monoX2"
            :control="channelData.controls.monoX2"
            v-model="values.monoX2"
            @change="onControlChange('monoX2', $event)"
            ref="monoX2Ref"
          />
          <MidiControl
            v-else-if="channelData.controls.usb12"
            :control="channelData.controls.usb12"
            v-model="values.usb12"
            @change="onControlChange('usb12', $event)"
            ref="usb12Ref"
          />
          <MidiControl
            v-else-if="channelData.controls.usb34"
            :control="channelData.controls.usb34"
            v-model="values.usb34"
            @change="onControlChange('usb34', $event)"
            ref="usb34Ref"
          />
          <MidiControl
            :control="channelData.controls.mute"
            v-model="values.mute"
            @change="onControlChange('mute', $event)"
            ref="muteRef"
          />
        </div>
      </div>
      
      <!-- Reset Section -->
      <div class="reset-section">
        <button 
          @click="resetToDefaults"
          class="reset-button"
          title="Reset channel to defaults"
        >
          Reset
        </button>
        <button 
          @click="pauseResumeAllLfos"
          class="lfo-control-button"
          :class="{ 
            disabled: !hasActiveOrPausedLfos,
            pause: hasActiveLfos,
            resume: hasPausedLfos
          }"
          :disabled="!hasActiveOrPausedLfos"
          :title="hasActiveLfos ? 'Pause all LFOs on this channel' : hasPausedLfos ? 'Resume all LFOs on this channel' : 'No active or paused LFOs on this channel'"
        >
          {{ lfoButtonText }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed } from 'vue';
import MidiControl from './MidiControl.vue';
import type { ChannelControls } from '../config/midiConfig';

interface Props {
  channelData: ChannelControls;
  compactMode?: boolean;
}

interface Emits {
  (e: 'controlChange', channel: number, control: string, value: number): void;
}

const props = withDefaults(defineProps<Props>(), {
  compactMode: false
});
const emit = defineEmits<Emits>();

// Individual refs for each control type
const eqHighRef = ref<any>(null);
const eqMidRef = ref<any>(null);
const eqMidFreqRef = ref<any>(null);
const eqLowRef = ref<any>(null);
const aux1Ref = ref<any>(null);
const aux2Ref = ref<any>(null);
const efxSendRef = ref<any>(null);
const panRef = ref<any>(null);
const volumeRef = ref<any>(null);
const muteRef = ref<any>(null);
const monoX2Ref = ref<any>(null);
const usb12Ref = ref<any>(null);
const usb34Ref = ref<any>(null);

// Reactive values for all controls
const values = reactive({
  volume: props.channelData.controls.volume.defaultValue,
  pan: props.channelData.controls.pan.defaultValue,
  eqHigh: props.channelData.controls.eq.high.defaultValue,
  eqMid: props.channelData.controls.eq.mid.defaultValue,
  eqMidFreq: props.channelData.controls.eq.midFreq.defaultValue,
  eqLow: props.channelData.controls.eq.low.defaultValue,
  aux1: props.channelData.controls.aux1.defaultValue,
  aux2: props.channelData.controls.aux2.defaultValue,
  efxSend: props.channelData.controls.efxSend.defaultValue,
  mute: props.channelData.controls.mute.defaultValue,
  monoX2: props.channelData.controls.monoX2?.defaultValue ?? 0,
  usb12: props.channelData.controls.usb12?.defaultValue ?? 0,
  usb34: props.channelData.controls.usb34?.defaultValue ?? 0,
});

function onControlChange(controlName: string, value: number) {
  emit('controlChange', props.channelData.channel, controlName, value);
}

// Create compact control with short label
function createCompactControl(control: any, shortLabel: string) {
  return {
    ...control,
    name: shortLabel
  };
}

// Method to reset all controls to defaults
function resetToDefaults() {
  values.volume = props.channelData.controls.volume.defaultValue;
  values.pan = props.channelData.controls.pan.defaultValue;
  values.eqHigh = props.channelData.controls.eq.high.defaultValue;
  values.eqMid = props.channelData.controls.eq.mid.defaultValue;
  values.eqMidFreq = props.channelData.controls.eq.midFreq.defaultValue;
  values.eqLow = props.channelData.controls.eq.low.defaultValue;
  values.aux1 = props.channelData.controls.aux1.defaultValue;
  values.aux2 = props.channelData.controls.aux2.defaultValue;
  values.efxSend = props.channelData.controls.efxSend.defaultValue;
  values.mute = props.channelData.controls.mute.defaultValue;
  if (props.channelData.controls.monoX2) {
    values.monoX2 = props.channelData.controls.monoX2.defaultValue;
  }
  if (props.channelData.controls.usb12) {
    values.usb12 = props.channelData.controls.usb12.defaultValue;
  }
  if (props.channelData.controls.usb34) {
    values.usb34 = props.channelData.controls.usb34.defaultValue;
  }
  
  // Also disable all LFOs when resetting
  const allRefs = [
    eqHighRef.value, eqMidRef.value, eqMidFreqRef.value, eqLowRef.value,
    aux1Ref.value, aux2Ref.value, efxSendRef.value,
    panRef.value, volumeRef.value, muteRef.value,
    monoX2Ref.value, usb12Ref.value, usb34Ref.value
  ];
  
  allRefs.forEach((controlRef) => {
    if (controlRef && controlRef.disableLfo) {
      controlRef.disableLfo();
    }
  });
}

// Helper function to get all control refs
function getAllControlRefs() {
  return [
    eqHighRef.value, eqMidRef.value, eqMidFreqRef.value, eqLowRef.value,
    aux1Ref.value, aux2Ref.value, efxSendRef.value,
    panRef.value, volumeRef.value, muteRef.value,
    monoX2Ref.value, usb12Ref.value, usb34Ref.value
  ];
}

// Computed property to check if there are any active or paused LFOs on this channel
const hasActiveLfos = computed(() => {
  return getAllControlRefs().some((controlRef) => {
    return controlRef && controlRef.lfo && controlRef.lfo.state === 'active';
  });
});

const hasPausedLfos = computed(() => {
  return getAllControlRefs().some((controlRef) => {
    return controlRef && controlRef.lfo && controlRef.lfo.state === 'paused';
  });
});

const hasActiveOrPausedLfos = computed(() => {
  return hasActiveLfos.value || hasPausedLfos.value;
});

const lfoButtonText = computed(() => {
  if (!hasActiveOrPausedLfos.value) return 'No LFOs';
  if (hasActiveLfos.value) return 'Pause LFOs';
  return 'Resume LFOs';
});

// Method to pause/resume all LFOs on this channel
function pauseResumeAllLfos() {
  const allRefs = getAllControlRefs();
  
  // If there are any active LFOs, pause all active ones
  // Otherwise, resume all paused ones
  if (hasActiveLfos.value) {
    // Pause all active LFOs
    allRefs.forEach((controlRef) => {
      if (controlRef && controlRef.pauseLfo) {
        controlRef.pauseLfo();
      }
    });
  } else {
    // Resume all paused LFOs
    allRefs.forEach((controlRef) => {
      if (controlRef && controlRef.resumeLfo) {
        controlRef.resumeLfo();
      }
    });
  }
}

// Separate methods for explicit pause/resume (used by global controls)
function pauseAllLfos() {
  const allRefs = getAllControlRefs();
  allRefs.forEach((controlRef) => {
    if (controlRef && controlRef.pauseLfo) {
      controlRef.pauseLfo();
    }
  });
}

function resumeAllLfos() {
  const allRefs = getAllControlRefs();
  allRefs.forEach((controlRef) => {
    if (controlRef && controlRef.resumeLfo) {
      controlRef.resumeLfo();
    }
  });
}

// LFO state management for presets
function getLfoStates() {
  const allRefs = getAllControlRefs();
  return allRefs.map((controlRef) => {
    if (controlRef && controlRef.getLfoState) {
      return controlRef.getLfoState();
    }
    return null;
  });
}

function setLfoStates(lfoStates: any[]) {
  const allRefs = getAllControlRefs();
  lfoStates.forEach((lfoState, index) => {
    const controlRef = allRefs[index];
    if (controlRef && controlRef.setLfoState && lfoState) {
      controlRef.setLfoState(lfoState);
    }
  });
}

// Expose methods
defineExpose({
  resetToDefaults,
  pauseResumeAllLfos,
  pauseAllLfos,
  resumeAllLfos,
  hasActiveLfos,
  hasActiveOrPausedLfos,
  getLfoStates,
  setLfoStates,
  values
});
</script>

<style scoped>
.channel-strip {
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 12px;
  margin: 8px;
  min-width: 120px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.channel-header {
  text-align: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.channel-title {
  color: #4a90e2;
  font-size: 14px;
  font-weight: bold;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.controls-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.control-group {
  display: flex;
  justify-content: left;
}

.section-title {
  font-size: 10px;
  color: #888;
  text-align: center;
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-weight: 600;
}

.eq-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 8px;
  min-width: 25%; /* Based on 4 EQ controls */
}

.eq-controls {
  display: flex;
  justify-content: space-between;
  gap: 4px;
}

.aux-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 8px;
  min-width: 25%; /* Match EQ section width */
}

.aux-controls {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.main-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 8px;
  min-width: 25%; /* Match EQ section width */
}

.main-controls {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}


.button-section {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.fader-section {
  display: flex;
  justify-content: center;
  margin-top: auto;
  padding-top: 16px;
}

/* Compact Mode */
.channel-strip.compact {
  min-width: auto;
  width: 100%;
}

.compact-controls {
  display: flex;
  gap: 4px;
  justify-content: space-between;
  align-items: center;
  flex-wrap: nowrap;
}

.compact-controls > * {
  flex-shrink: 0;
  flex-grow: 0;
  width: 40px;
  min-width: 40px;
  max-width: 40px;
}

.compact-control-slot {
  min-height: 40px;
  width: 40px;
  min-width: 40px;
  max-width: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  flex-grow: 0;
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .channel-strip {
    min-width: 100px;
    padding: 8px;
    margin: 0;
    width: 100%;
  }
  
  .channel-strip.compact {
    padding: 6px;
    margin: 4px;
    width: calc(100% - 8px);
  }
  
  .eq-controls,
  .aux-controls {
    gap: 2px;
  }
  
  .button-section {
    gap: 4px;
  }
  
  .compact-controls {
    gap: 2px;
    flex-wrap: nowrap;
  }
  
  .compact-controls > * {
    width: 35px;
    min-width: 35px;
    max-width: 35px;
  }
  
  .compact-control-slot {
    min-height: 35px;
    width: 35px;
    min-width: 35px;
    max-width: 35px;
  }
  
  .section-title {
    font-size: 9px;
  }
}

@media (max-width: 480px) {
  .channel-strip {
    min-width: 80px;
    padding: 3px;
    margin: 0;
    width: 100%;
  }
  
  .channel-strip.compact {
    padding: 2px;
    margin: 2px;
    width: calc(100% - 4px);
  }
  
  .channel-title {
    font-size: 12px;
  }
  
  .section-title {
    font-size: 8px;
  }
  
  .compact-controls {
    gap: 6px;
    justify-content: center;
    flex-wrap: nowrap;
  }
  
  .compact-controls > * {
    width: 30px;
    min-width: 30px;
    max-width: 30px;
  }
  
  .compact-control-slot {
    min-height: 30px;
    width: 30px;
    min-width: 30px;
    max-width: 30px;
  }
  
  /* Stack sections vertically on very small screens */
  .controls-section {
    flex-direction: column;
    gap: 4px;
  }
  
  .eq-section,
  .aux-section,
  .main-section {
    padding: 3px;
  }
  
  .eq-controls,
  .aux-controls,
  .main-controls {
    gap: 2px;
  }
  
}

/* Reset Section */
.reset-section {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid #333;
}

.reset-button {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #ccc;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  min-width: 0;
}

.reset-button:hover {
  background: #f44336;
  border-color: #f44336;
  color: white;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(244, 67, 54, 0.3);
}

.reset-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(244, 67, 54, 0.3);
}

.lfo-control-button {
  padding: 6px 12px;
  background: #ff9800;
  border: 1px solid #f57c00;
  border-radius: 6px;
  color: white;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s ease;
  flex: 1;
  min-width: 0;
}

.lfo-control-button.pause {
  background: #4a90e2;
  border-color: #3a7bc8;
}

.lfo-control-button.resume {
  background: #f5a623;
  border-color: #e09512;
}

.lfo-control-button:hover {
  background: #fb8c00;
  border-color: #ef6c00;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(255, 152, 0, 0.3);
}

.lfo-control-button.pause:hover {
  background: #5a9ff2;
  border-color: #4a8dd8;
  box-shadow: 0 2px 8px rgba(74, 144, 226, 0.3);
}

.lfo-control-button.resume:hover {
  background: #f7b84d;
  border-color: #f0a733;
  box-shadow: 0 2px 8px rgba(245, 166, 35, 0.3);
}

.lfo-control-button:active {
  transform: translateY(0);
  box-shadow: 0 1px 4px rgba(255, 152, 0, 0.3);
}

.lfo-control-button.disabled,
.lfo-control-button:disabled {
  background: #666;
  border-color: #555;
  color: #999;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.lfo-control-button.disabled:hover,
.lfo-control-button:disabled:hover {
  background: #666;
  border-color: #555;
  transform: none;
  box-shadow: none;
}

/* Mobile optimizations for reset and LFO disable buttons */
@media (max-width: 768px) {
  .reset-section {
    margin-top: 8px;
    padding-top: 6px;
    gap: 6px;
  }
  
  .reset-button,
  .lfo-control-button {
    padding: 4px 10px;
    font-size: 9px;
  }
}

@media (max-width: 480px) {
  .reset-section {
    margin-top: 6px;
    padding-top: 4px;
    gap: 4px;
  }
  
  .reset-button,
  .lfo-control-button {
    padding: 3px 8px;
    font-size: 8px;
  }
}
</style>