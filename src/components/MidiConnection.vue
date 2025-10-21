<template>
  <div class="midi-connection">
    <div class="connection-header" @click="toggleSection('configuration')">
      <h3 class="connection-title">Configuration</h3>
      <div class="header-right">
        <div class="connection-status" :class="{ connected: isConnected, error: hasError }">
          <span class="status-dot"></span>
          {{ connectionStatus }}
        </div>
        <span class="toggle-icon">{{ expandedSections.configuration ? '▼' : '▶' }}</span>
      </div>
    </div>
    
    <div v-if="expandedSections.configuration && isInitialized" class="connection-content">
      <!-- Input Selection -->
      <div class="device-section">
        <label class="device-label">MIDI Input:</label>
        <select 
          v-model="selectedInput" 
          @change="connectInput"
          class="device-select"
        >
          <option value="">Select Input Device</option>
          <option 
            v-for="input in availableInputs" 
            :key="input.id" 
            :value="input.name"
          >
            {{ input.name }}
          </option>
        </select>
      </div>
      
      <!-- Output Selection -->
      <div class="device-section">
        <label class="device-label">MIDI Output:</label>
        <select 
          v-model="selectedOutput" 
          @change="connectOutput"
          class="device-select"
        >
          <option value="">Select Output Device</option>
          <option 
            v-for="output in availableOutputs" 
            :key="output.id" 
            :value="output.name"
          >
            {{ output.name }}
          </option>
        </select>
      </div>
      
      <!-- Connection Actions -->
      <div class="connection-actions">
        <button 
          @click="refreshDevices"
          class="action-button refresh-button"
          :disabled="isRefreshing"
        >
          {{ isRefreshing ? 'Refreshing...' : 'Refresh Devices' }}
        </button>
        
        <button 
          @click="disconnect"
          class="action-button disconnect-button"
          :disabled="!isConnected"
        >
          Disconnect
        </button>
        
        <button 
          @click="autoConnect"
          class="action-button auto-button"
        >
          Auto-Connect Zoom
        </button>
      </div>
    </div>
    
    <div v-if="expandedSections.configuration && hasError" class="connection-content">
      <div class="error-message">
        <p>WebMIDI is not supported in this browser or failed to initialize.</p>
        <p>Please use a modern browser like Chrome, Edge, or Firefox.</p>
        <button @click="initializeMidi" class="action-button retry-button">
          Retry
        </button>
      </div>
    </div>
    
    <div v-if="expandedSections.configuration && !isInitialized && !hasError" class="connection-content">
      <div class="loading-message">
        <p>Initializing MIDI...</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue';
import { midiService } from '../services/midiService';
import type { Input, Output } from 'webmidi';

interface Emits {
  (e: 'connectionChanged', connected: boolean): void;
}

const emit = defineEmits<Emits>();

const isInitialized = ref(false);
const hasError = ref(false);
const isRefreshing = ref(false);
const selectedInput = ref('');
const selectedOutput = ref('');
const availableInputs = ref<Input[]>([]);
const availableOutputs = ref<Output[]>([]);

// Collapsible section state
const expandedSections = reactive({
  configuration: true,
});

const isConnected = computed(() => {
  return midiService.connectionState.value;
});

const connectionStatus = computed(() => {
  if (hasError.value) return 'Error';
  if (!isInitialized.value) return 'Initializing...';
  if (!isConnected.value) return 'Disconnected';
  
  return `Connected: ${midiService.inputName} → ${midiService.outputName}`;
});

async function initializeMidi() {
  hasError.value = false;
  try {
    const success = await midiService.initialize();
    if (success) {
      isInitialized.value = true;
      refreshDevices();
    } else {
      hasError.value = true;
    }
  } catch (error) {
    console.error('MIDI initialization error:', error);
    hasError.value = true;
  }
}

function refreshDevices() {
  if (!isInitialized.value) return;
  
  isRefreshing.value = true;
  
  try {
    const inputs = midiService.getAvailableInputs();
    const outputs = midiService.getAvailableOutputs();
    
    availableInputs.value = inputs;
    availableOutputs.value = outputs;
  } catch (error) {
    console.error('Error refreshing devices:', error);
  } finally {
    isRefreshing.value = false;
  }
}

function connectInput() {
  if (!selectedInput.value) return;
  
  const success = midiService.connectInput(selectedInput.value);
  if (success) {
    emit('connectionChanged', midiService.connectionState.value);
  } else {
    selectedInput.value = '';
  }
}

function connectOutput() {
  if (!selectedOutput.value) return;
  
  const success = midiService.connectOutput(selectedOutput.value);
  if (success) {
    emit('connectionChanged', midiService.connectionState.value);
  } else {
    selectedOutput.value = '';
  }
}

function disconnect() {
  midiService.disconnect();
  selectedInput.value = '';
  selectedOutput.value = '';
  emit('connectionChanged', false);
}

function autoConnect() {
  // Priority 1: Look for "mixer control port" devices
  const mixerInput = availableInputs.value.find(device => 
    device.name.toLowerCase().includes('mixer control port')
  );
  
  const mixerOutput = availableOutputs.value.find(device => 
    device.name.toLowerCase().includes('mixer control port')
  );
  
  // Priority 2: Look for Zoom/L6 devices
  const zoomInput = availableInputs.value.find(device => 
    device.name.toLowerCase().includes('zoom') || 
    device.name.toLowerCase().includes('l6')
  );
  
  const zoomOutput = availableOutputs.value.find(device => 
    device.name.toLowerCase().includes('zoom') || 
    device.name.toLowerCase().includes('l6')
  );
  
  // Connect input (prioritize mixer control port)
  const targetInput = mixerInput || zoomInput;
  if (targetInput) {
    selectedInput.value = targetInput.name;
    connectInput();
  }
  
  // Connect output (prioritize mixer control port)
  const targetOutput = mixerOutput || zoomOutput;
  if (targetOutput) {
    selectedOutput.value = targetOutput.name;
    connectOutput();
  }
  
  // Fallback: connect to first available devices
  if (!targetInput && availableInputs.value.length > 0) {
    const firstIn = availableInputs.value[0];
    if (firstIn) {
      selectedInput.value = firstIn.name;
      connectInput();
    }
  }
  
  if (!targetOutput && availableOutputs.value.length > 0) {
    const firstOut = availableOutputs.value[0];
    if (firstOut) {
      selectedOutput.value = firstOut.name;
      connectOutput();
    }
  }
}

// Toggle section expansion
function toggleSection(section: keyof typeof expandedSections) {
  expandedSections[section] = !expandedSections[section];
}

onMounted(() => {
  initializeMidi();
  
  // Set up device state change callback
  midiService.setDeviceStateChangeCallback(() => {
    refreshDevices();
  });
});
</script>

<style scoped>
.midi-connection {
  background: #1a1a1a;
  border: 2px solid #333;
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.connection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding: 16px 20px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  border-bottom: 1px solid #333;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.connection-header:hover {
  background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toggle-icon {
  color: #4a90e2;
  font-size: 14px;
  font-weight: bold;
}

.connection-title {
  color: #4a90e2;
  font-size: 16px;
  font-weight: bold;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.connection-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #888;
  transition: color 0.3s ease;
}

.connection-status.connected {
  color: #4caf50;
}

.connection-status.error {
  color: #f44336;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #888;
  transition: background 0.3s ease;
}

.connected .status-dot {
  background: #4caf50;
  box-shadow: 0 0 6px rgba(76, 175, 80, 0.6);
}

.error .status-dot {
  background: #f44336;
  box-shadow: 0 0 6px rgba(244, 67, 54, 0.6);
}

.connection-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.device-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.device-label {
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.device-select {
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  padding: 8px 12px;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.device-select:focus {
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

.device-select option {
  background: #2a2a2a;
  color: #fff;
}

.connection-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.action-button {
  flex: 1;
  min-width: 120px;
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.refresh-button {
  background: #4a90e2;
  color: white;
}

.refresh-button:hover:not(:disabled) {
  background: #3a80d2;
  transform: translateY(-1px);
}

.disconnect-button {
  background: #f44336;
  color: white;
}

.disconnect-button:hover:not(:disabled) {
  background: #e33326;
  transform: translateY(-1px);
}

.auto-button {
  background: #4caf50;
  color: white;
}

.auto-button:hover {
  background: #3c9f40;
  transform: translateY(-1px);
}

.retry-button {
  background: #ff9800;
  color: white;
}

.retry-button:hover {
  background: #ef8900;
  transform: translateY(-1px);
}


.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.error-message,
.loading-message {
  text-align: center;
  color: #ccc;
}

.error-message p {
  margin-bottom: 8px;
  color: #f44336;
}

.loading-message p {
  color: #4a90e2;
  font-weight: 500;
}

/* Responsive Design */
@media (max-width: 768px) {
  .connection-header {
    flex-direction: column;
    gap: 8px;
    text-align: center;
  }
  
  .connection-actions {
    flex-direction: column;
  }
  
  .action-button {
    min-width: auto;
  }
}

@media (max-width: 480px) {
  .midi-connection {
    padding: 12px;
  }
  
  .connection-title {
    font-size: 14px;
  }
}
</style>