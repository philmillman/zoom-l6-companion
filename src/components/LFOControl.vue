<template>
  <div class="lfo-control">
    <div class="lfo-row">
      <label>Rate</label>
      <input type="range" min="0.1" max="10" step="0.1" v-model.number="local.rate" @input="emitConfig" />
      <span class="value">{{ local.rate.toFixed(1) }} Hz</span>
    </div>
    <div class="lfo-row">
      <label>Depth</label>
      <input type="range" min="0" max="1" step="0.01" v-model.number="local.depth" @input="emitConfig" />
      <span class="value">{{ Math.round(local.depth * 100) }}%</span>
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
      <button class="toggle" :class="{ active: local.enabled }" @click="toggle">{{ local.enabled ? 'Disable' : 'Enable' }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';

export type LFOShape = 'sine' | 'triangle' | 'square' | 'saw';
export type LFOMode = 'negative' | 'positive' | 'bipolar';

export interface LFOConfig {
  rate: number;   // Hz
  depth: number;  // 0..1
  shape: LFOShape;
  mode: LFOMode;
  enabled: boolean;
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
  enabled: props.config?.enabled ?? false,
});

function emitConfig() {
  emit('update:config', { ...local.value });
}

function toggle() {
  local.value.enabled = !local.value.enabled;
  emitConfig();
}

watch(() => props.config, (cfg) => {
  if (cfg) local.value = { ...cfg };
});
</script>

<style scoped>
.lfo-control {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 220px;
}

.lfo-row {
  display: grid;
  grid-template-columns: 56px 1fr 60px;
  align-items: center;
  gap: 8px;
}

label { color: #bbb; font-size: 12px; }
.value { color: #4a90e2; font-size: 12px; text-align: right; }

select, input[type="range"] { width: 100%; }

.lfo-actions { display: flex; justify-content: flex-end; }
.toggle {
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid #444;
  background: #2a2a2a;
  color: #ddd;
  cursor: pointer;
}
.toggle.active { background: #4a90e2; border-color: #4a90e2; color: white; }
</style>

