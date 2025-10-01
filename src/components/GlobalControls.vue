<template>
  <div class="global-controls">
    <div class="global-header">
      <h2 class="global-title">Global</h2>
    </div>
    
    <div class="controls-container">
      <div class="control-section">
        <div class="section-title">Effects</div>
        <div class="effect-controls">
          <MidiControl
            :control="globalData.efxType"
            v-model="values.efxType"
            @change="onControlChange('global', 'efxType', $event)"
          />
          <MidiControl
            :control="globalData.compressor"
            v-model="values.compressor"
            @change="onControlChange('global', 'compressor', $event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive } from 'vue';
import MidiControl from './MidiControl.vue';
import type { GlobalControls } from '../config/midiConfig';

interface Props {
  globalData: GlobalControls;
}

interface Emits {
  (e: 'controlChange', section: string, control: string, value: number): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// Reactive values for simplified global controls
const values = reactive({
  efxType: props.globalData.efxType.defaultValue,
  compressor: props.globalData.compressor.defaultValue,
});

function onControlChange(section: string, control: string, value: number) {
  emit('controlChange', section, control, value);
}

// Method to reset all controls to defaults
function resetToDefaults() {
  values.efxType = props.globalData.efxType.defaultValue;
  values.compressor = props.globalData.compressor.defaultValue;
}

// Expose methods
defineExpose({
  resetToDefaults,
  values
});
</script>

<style scoped>
.global-controls {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 16px;
  margin: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.global-header {
  text-align: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 2px solid #333;
}

.global-title {
  color: #4a90e2;
  font-size: 18px;
  font-weight: bold;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1.5px;
}

.controls-container {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 20px;
  align-items: start;
}

.control-section {
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.section-title {
  font-size: 14px;
  color: #4a90e2;
  text-align: center;
  margin-bottom: 16px;
  text-transform: uppercase;
  letter-spacing: 1px;
  font-weight: 600;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(74, 144, 226, 0.3);
}

.master-controls,
.effect-controls {
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

/* Section-specific styling */
.master-section {
  border-color: rgba(74, 144, 226, 0.3);
}

.reverb-section {
  border-color: rgba(156, 39, 176, 0.3);
}

.delay-section {
  border-color: rgba(255, 193, 7, 0.3);
}

.compressor-section {
  border-color: rgba(244, 67, 54, 0.3);
}

.reverb-section .section-title {
  color: #9c27b0;
  border-bottom-color: rgba(156, 39, 176, 0.3);
}

.delay-section .section-title {
  color: #ffc107;
  border-bottom-color: rgba(255, 193, 7, 0.3);
}

.compressor-section .section-title {
  color: #f44336;
  border-bottom-color: rgba(244, 67, 54, 0.3);
}

/* Responsive Design */
@media (max-width: 1024px) {
  .controls-container {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 16px;
  }
}

@media (max-width: 768px) {
  .controls-container {
    grid-template-columns: 1fr;
    gap: 12px;
  }
  
  .control-section {
    padding: 12px;
  }
  
  .master-controls,
  .effect-controls {
    gap: 8px;
  }
}

@media (max-width: 480px) {
  .global-controls {
    padding: 12px;
    margin: 4px;
  }
  
  .global-title {
    font-size: 16px;
  }
  
  .section-title {
    font-size: 12px;
  }
  
  .master-controls,
  .effect-controls {
    flex-direction: column;
    align-items: center;
  }
}
</style>