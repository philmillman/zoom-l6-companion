<template>
  <div class="channel-strip">
    <div class="channel-header">
      <h3 class="channel-title">CH {{ channelData.channel }}</h3>
    </div>
    
    <div class="controls-section">
      <!-- EQ Section -->
      <div class="eq-section">
        <div class="section-title">EQ</div>
        <div class="eq-controls">
          <MidiControl
            :control="channelData.controls.eq.high"
            v-model="values.eqHigh"
            @change="onControlChange('eqHigh', $event)"
          />
          <MidiControl
            :control="channelData.controls.eq.mid"
            v-model="values.eqMid"
            @change="onControlChange('eqMid', $event)"
          />
          <MidiControl
            :control="channelData.controls.eq.midFreq"
            v-model="values.eqMidFreq"
            @change="onControlChange('eqMidFreq', $event)"
          />
          <MidiControl
            :control="channelData.controls.eq.low"
            v-model="values.eqLow"
            @change="onControlChange('eqLow', $event)"
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
          />
          <MidiControl
            :control="channelData.controls.aux2"
            v-model="values.aux2"
            @change="onControlChange('aux2', $event)"
          />
          <MidiControl
            :control="channelData.controls.efxSend"
            v-model="values.efxSend"
            @change="onControlChange('efxSend', $event)"
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
          />
          <MidiControl
            :control="channelData.controls.volume"
            v-model="values.volume"
            @change="onControlChange('volume', $event)"
          />
          <MidiControl
            :control="channelData.controls.mute"
            v-model="values.mute"
            @change="onControlChange('mute', $event)"
          />
        </div>
        <div class="button-controls">
          <MidiControl
            v-if="channelData.controls.monoX2"
            :control="channelData.controls.monoX2"
            v-model="values.monoX2"
            @change="onControlChange('monoX2', $event)"
          />
          <MidiControl
            v-if="channelData.controls.usb12"
            :control="channelData.controls.usb12"
            v-model="values.usb12"
            @change="onControlChange('usb12', $event)"
          />
          <MidiControl
            v-if="channelData.controls.usb34"
            :control="channelData.controls.usb34"
            v-model="values.usb34"
            @change="onControlChange('usb34', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import MidiControl from './MidiControl.vue';
import type { ChannelControls } from '../config/midiConfig';

interface Props {
  channelData: ChannelControls;
}

interface Emits {
  (e: 'controlChange', channel: number, control: string, value: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

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
}

// Expose methods
defineExpose({
  resetToDefaults,
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
  justify-content: center;
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
}

.main-controls {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.button-controls {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-top: 8px;
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

/* Responsive Design */
@media (max-width: 768px) {
  .channel-strip {
    min-width: 100px;
    padding: 8px;
    margin: 4px;
  }
  
  .eq-controls,
  .aux-controls {
    gap: 2px;
  }
  
  .button-section {
    gap: 4px;
  }
}

@media (max-width: 480px) {
  .channel-strip {
    min-width: 80px;
    padding: 6px;
  }
  
  .channel-title {
    font-size: 12px;
  }
  
  .section-title {
    font-size: 9px;
  }
}
</style>