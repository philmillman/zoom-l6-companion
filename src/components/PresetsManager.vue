<template>
  <section v-if="isConnected" class="presets-section">
    <div class="section-header" @click="toggleSection('presets')">
      <h2 class="section-title">Presets</h2>
      <div class="header-right">
        <div class="preset-status">
          <span class="status-dot" :class="{ active: activePresetId }"></span>
          {{ activePresetName }}
        </div>
        <span class="toggle-icon">{{ expandedSections.presets ? '▼' : '▶' }}</span>
      </div>
    </div>
    
    <div v-if="expandedSections.presets" class="presets-content">
      <!-- Presets List -->
      <div class="presets-list">
        <div 
          v-for="preset in savedPresets" 
          :key="preset.id" 
          class="preset-item"
          :class="{ 
            active: isPresetActive(preset.id),
            modified: isPresetModified(preset.id)
          }"
        >
          <div class="preset-info">
            <div class="preset-name">
              {{ preset.name }}
              <span v-if="isPresetActive(preset.id)" class="active-indicator">●</span>
              <span v-if="isPresetModified(preset.id)" class="modified-indicator">*</span>
            </div>
            <div class="preset-date">Saved: {{ formatDate(preset.lastSaved) }}</div>
          </div>
          <div class="preset-actions">
            <button 
              @click="() => editPreset(preset.id)"
              class="preset-action-button edit-button"
              title="Edit preset"
            >
              ✏️
            </button>
            <button 
              v-if="!isPresetActive(preset.id)"
              @click="() => loadPreset(preset.id)"
              class="preset-action-button load-button"
              title="Load preset"
            >
              📁
            </button>
            <button 
              v-if="isPresetActive(preset.id)"
              @click="saveActivePreset"
              class="preset-action-button save-button"
              :class="{ disabled: !isPresetModified(preset.id) }"
              :disabled="!isPresetModified(preset.id)"
              :title="isPresetModified(preset.id) ? 'Save changes' : 'No changes to save'"
            >
              💾
            </button>
            <button 
              @click="() => downloadPreset(preset.id)"
              class="preset-action-button download-button"
              title="Download preset"
            >
              📥
            </button>
            <button 
              @click="() => confirmDeletePreset(preset.id)"
              class="preset-action-button delete-button"
              title="Delete preset"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
      
      <!-- Preset Controls -->
      <div class="presets-controls">
        <button 
          @click="showNameInput('create')"
          class="preset-button new-button"
        >
          + New Preset
        </button>
        <button 
          @click="triggerFileInput"
          class="preset-button load-button"
        >
          📁 Load file
        </button>
        <input
          ref="fileInput"
          type="file"
          accept=".json"
          @change="handleFileImport"
          style="display: none"
        />
      </div>
    </div>
    
    <!-- Name Input Modal -->
    <div v-if="showNameModal" class="name-modal-overlay" @click="closeNameModal">
      <div class="name-modal" @click.stop>
        <div class="name-modal-header">
          <h3 class="name-modal-title">{{ modalTitle }}</h3>
          <button @click="closeNameModal" class="name-modal-close">×</button>
        </div>
        <div class="name-modal-content">
          <input
            ref="nameInput"
            v-model="presetNameInput"
            type="text"
            class="name-input"
            :placeholder="modalPlaceholder"
            @keyup.enter="confirmNameInput"
            @keyup.escape="closeNameModal"
          />
        </div>
        <div class="name-modal-actions">
          <button @click="closeNameModal" class="name-modal-button cancel-button">
            Cancel
          </button>
          <button @click="confirmNameInput" class="name-modal-button confirm-button">
            {{ modalConfirmText }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, computed, watch, reactive } from 'vue';
import type { ChannelControls, GlobalControls, SoundPad } from '../config/midiConfig';

// Props
interface Props {
  channelControls: ChannelControls[];
  globalControls: GlobalControls;
  soundPads: SoundPad[];
  channelRefs: any[];
  globalControlsRef?: any; // Reference to GlobalControls component
  currentScene?: any; // Current scene state for tracking changes
  isConnected?: boolean; // MIDI connection status
}

const props = defineProps<Props>();

// Emits
interface Emits {
  (e: 'presetLoaded', data: {
    channelControls: ChannelControls[];
    globalControls: GlobalControls;
    soundPads: SoundPad[];
    lfoStates: any[];
  }): void;
}

const emit = defineEmits<Emits>();

// Preset management
interface Preset {
  id: string;
  name: string;
  lastSaved: Date;
  data: {
    channelControls: ChannelControls[];
    globalControls: GlobalControls;
    soundPads: SoundPad[];
    lfoStates: any[]; // Will store LFO states from all channels
    channelValues: any[]; // Will store actual current values from channels
    globalValues: any; // Will store actual current values from global controls
  };
}

const savedPresets = ref<Preset[]>([]);

// Active preset tracking
const activePresetId = ref<string | null>(null);
const isModified = ref(false);

// Modal state
const showNameModal = ref(false);
const presetNameInput = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
const modalMode = ref<'create' | 'edit'>('create');
const editingPresetId = ref<string | null>(null);

// File input ref
const fileInput = ref<HTMLInputElement | null>(null);

// Collapsible sections state
const expandedSections = reactive({
  presets: false,
});

// Computed properties for modal
const modalTitle = computed(() => modalMode.value === 'create' ? 'Create New Preset' : 'Edit Preset Name');
const modalPlaceholder = computed(() => modalMode.value === 'create' ? 'Enter preset name...' : 'Enter new preset name...');
const modalConfirmText = computed(() => modalMode.value === 'create' ? 'Create' : 'Save');

// Computed property for active preset
const activePresetName = computed(() => {
  if (!activePresetId.value) return 'No preset loaded';
  const preset = savedPresets.value.find(p => p.id === activePresetId.value);
  return preset ? preset.name : 'No preset loaded';
});

// Computed properties for preset state
const isPresetActive = (presetId: string) => activePresetId.value === presetId;
const isPresetModified = (presetId: string) => activePresetId.value === presetId && isModified.value;

// Modal functions
function showNameInput(mode: 'create' | 'edit', presetId?: string) {
  modalMode.value = mode;
  editingPresetId.value = presetId || null;
  presetNameInput.value = '';
  showNameModal.value = true;
  
  // Focus the input after the modal is rendered
  nextTick(() => {
    nameInput.value?.focus();
  });
}

function closeNameModal() {
  showNameModal.value = false;
  presetNameInput.value = '';
  editingPresetId.value = null;
}

function confirmNameInput() {
  const name = presetNameInput.value.trim();
  if (!name) return;
  
  if (modalMode.value === 'create') {
    createNewPreset(name);
  } else if (modalMode.value === 'edit' && editingPresetId.value) {
    editPreset(editingPresetId.value, name);
  }
  
  closeNameModal();
}

// Preset management functions
function createNewPreset(name: string) {
  const presetData = captureCurrentState();
  const newPreset: Preset = {
    id: Date.now().toString(),
    name: name,
    lastSaved: new Date(),
    data: presetData
  };
  
  savedPresets.value.push(newPreset);
  savePresetsToStorage();
  console.log('✅ Preset created:', newPreset.name);
}

function captureCurrentState() {
  // Capture LFO states from all channels
  const lfoStates = props.channelRefs.map((channelStrip, index) => {
    if (channelStrip && channelStrip.getLfoStates) {
      return channelStrip.getLfoStates();
    }
    return null;
  });
  
  // Capture values from channel strips - use static values when LFO is active
  const channelValues = props.channelRefs.map((channelStrip, index) => {
    if (channelStrip && channelStrip.values) {
      // Get the current values object
      const currentValues = JSON.parse(JSON.stringify(channelStrip.values));
      
      // If there are LFO states, we need to get static values for controls with active LFOs
      if (lfoStates[index]) {
        const lfoStatesForChannel = lfoStates[index];
        const staticValues = { ...currentValues };
        
        // Get all control refs for this channel
        const controlRefs = channelStrip.getAllControlRefs ? channelStrip.getAllControlRefs() : [];
        
        // For each control ref, check if it has an active LFO and use static value
        controlRefs.forEach((controlRef: any, controlIndex: number) => {
          if (controlRef && lfoStatesForChannel[controlIndex]) {
            const lfoState = lfoStatesForChannel[controlIndex];
            // If LFO is active or paused, use the static value
            if (lfoState && (lfoState.state === 'active' || lfoState.state === 'paused') && lfoState.staticValue !== undefined) {
              // Find the corresponding property in the values object
              const controlName = controlRef.control?.name;
              if (controlName && staticValues.hasOwnProperty(controlName)) {
                staticValues[controlName] = lfoState.staticValue;
              }
            }
          }
        });
        
        return staticValues;
      }
      
      return currentValues;
    }
    return null;
  });
  
  // Capture global control values
  const globalValues = props.globalControlsRef && props.globalControlsRef.values 
    ? JSON.parse(JSON.stringify(props.globalControlsRef.values))
    : null;
  
  return {
    channelControls: JSON.parse(JSON.stringify(props.channelControls)),
    globalControls: JSON.parse(JSON.stringify(props.globalControls)),
    soundPads: JSON.parse(JSON.stringify(props.soundPads)),
    lfoStates: lfoStates,
    channelValues: channelValues,
    globalValues: globalValues,
    currentScene: props.currentScene ? JSON.parse(JSON.stringify(props.currentScene)) : null
  };
}

function compareStates(currentState: any, storedState: any): boolean {
  // Deep comparison of the states
  return JSON.stringify(currentState) === JSON.stringify(storedState);
}

function checkForModifications() {
  if (!activePresetId.value) {
    isModified.value = false;
    return;
  }
  
  const activePreset = savedPresets.value.find(p => p.id === activePresetId.value);
  if (!activePreset) {
    isModified.value = false;
    return;
  }
  
  // Check if any LFOs are currently active
  const hasActiveLfos = props.channelRefs.some(channelStrip => {
    if (!channelStrip) return false;
    
    // Try computed properties first
    const hasActive = channelStrip.hasActiveLfos && channelStrip.hasActiveLfos.value;
    const hasActiveOrPaused = channelStrip.hasActiveOrPausedLfos && channelStrip.hasActiveOrPausedLfos.value;
    
    // Fallback to direct LFO state checking if computed properties fail
    let directCheck = false;
    if (channelStrip.getLfoStates) {
      const lfoStates = channelStrip.getLfoStates();
      directCheck = lfoStates.some((lfoState: any) => 
        lfoState && (lfoState.state === 'active' || lfoState.state === 'paused')
      );
    }
    
    return hasActive || hasActiveOrPaused || directCheck;
  });
  
  // If LFOs are active, only check for LFO setting changes, not value changes
  if (hasActiveLfos) {
    // Only compare LFO states and other non-value settings
    const currentLfoStates = props.channelRefs.map((channelStrip, index) => {
      if (channelStrip && channelStrip.getLfoStates) {
        return channelStrip.getLfoStates();
      }
      return null;
    });
    
    const storedLfoStates = activePreset.data.lfoStates;
    const lfoStatesEqual = JSON.stringify(currentLfoStates) === JSON.stringify(storedLfoStates);
    
    // Also check other non-value settings
    const otherSettingsEqual = 
      JSON.stringify(props.channelControls) === JSON.stringify(activePreset.data.channelControls) &&
      JSON.stringify(props.globalControls) === JSON.stringify(activePreset.data.globalControls) &&
      JSON.stringify(props.soundPads) === JSON.stringify(activePreset.data.soundPads);
    
    isModified.value = !lfoStatesEqual || !otherSettingsEqual;
  } else {
    // No active LFOs, do full comparison including values
    const currentState = captureCurrentState();
    const isEqual = compareStates(currentState, activePreset.data);
    isModified.value = !isEqual;
  }
  
  // Debug logging removed - LFO system is now working correctly
}

function editPreset(presetId: string, newName?: string) {
  const preset = savedPresets.value.find(p => p.id === presetId);
  if (!preset) return;
  
  if (newName) {
    // Called from modal confirmation
    if (newName.trim() !== '' && newName.trim() !== preset.name) {
      preset.name = newName.trim();
      savePresetsToStorage();
      console.log('✅ Preset renamed to:', preset.name);
    }
  } else {
    // Called from edit button - show modal
    presetNameInput.value = preset.name;
    showNameInput('edit', presetId);
  }
}

function loadPreset(presetId: string) {
  const preset = savedPresets.value.find(p => p.id === presetId);
  if (!preset) return;
  
  // Set as active preset
  activePresetId.value = presetId;
  isModified.value = false;
  
  // Restore actual values to channel strips
  if (preset.data.channelValues) {
    nextTick(() => {
      preset.data.channelValues.forEach((channelValue, index) => {
        const channelStrip = props.channelRefs[index];
        if (channelStrip && channelStrip.values && channelValue) {
          // Update the values object with the stored values
          Object.assign(channelStrip.values, channelValue);
        }
      });
    });
  }
  
  // Restore global control values
  if (preset.data.globalValues && props.globalControlsRef && props.globalControlsRef.values) {
    nextTick(() => {
      Object.assign(props.globalControlsRef.values, preset.data.globalValues);
    });
  }
  
  // Emit the preset data to the parent component
  emit('presetLoaded', preset.data);
  
  console.log('✅ Preset loaded:', preset.name);
}

function saveActivePreset() {
  if (!activePresetId.value) return;
  
  const preset = savedPresets.value.find(p => p.id === activePresetId.value);
  if (!preset) return;
  
  // Update the preset with current state
  const currentState = captureCurrentState();
  preset.data = currentState;
  preset.lastSaved = new Date();
  
  savePresetsToStorage();
  isModified.value = false;
  
  console.log('✅ Preset saved:', preset.name);
}

function confirmDeletePreset(presetId: string) {
  const preset = savedPresets.value.find(p => p.id === presetId);
  if (!preset) return;
  
  if (confirm(`Are you sure you want to delete preset "${preset.name}"?`)) {
    deletePreset(presetId);
  }
}

function deletePreset(presetId: string) {
  const index = savedPresets.value.findIndex(p => p.id === presetId);
  if (index !== -1) {
    const deletedPreset = savedPresets.value.splice(index, 1)[0];
    savePresetsToStorage();
    console.log('✅ Preset deleted:', deletedPreset?.name);
  }
}

function savePresetsToStorage() {
  try {
    localStorage.setItem('zoom-l6-presets', JSON.stringify(savedPresets.value));
  } catch (e) {
    console.error('❌ Failed to save presets to localStorage:', e);
  }
}

function loadPresetsFromStorage() {
  try {
    const stored = localStorage.getItem('zoom-l6-presets');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Convert lastSaved strings back to Date objects
      parsed.forEach((preset: any) => {
        preset.lastSaved = new Date(preset.lastSaved);
      });
      savedPresets.value = parsed;
    }
  } catch (e) {
    console.error('Failed to load presets from localStorage:', e);
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Download preset as JSON file
function downloadPreset(presetId: string) {
  const preset = savedPresets.value.find(p => p.id === presetId);
  if (!preset) return;
  
  try {
    // Create a clean copy of the preset data
    const presetData = {
      id: preset.id,
      name: preset.name,
      lastSaved: preset.lastSaved,
      data: preset.data
    };
    
    // Convert to JSON string
    const jsonString = JSON.stringify(presetData, null, 2);
    
    // Create blob and download
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${preset.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_preset.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    console.log('✅ Preset downloaded:', preset.name);
  } catch (error) {
    console.error('❌ Failed to download preset:', error);
    alert('Failed to download preset. Please try again.');
  }
}

// Trigger file input
function triggerFileInput() {
  fileInput.value?.click();
}

// Handle file import
function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const content = e.target?.result as string;
      const presetData = JSON.parse(content);
      
      // Validate the preset data structure
      if (!presetData.id || !presetData.name || !presetData.data) {
        throw new Error('Invalid preset file format');
      }
      
      // Generate new ID to avoid conflicts
      const newId = Date.now().toString();
      const importedPreset: Preset = {
        id: newId,
        name: `${presetData.name} (Imported)`,
        lastSaved: new Date(),
        data: presetData.data
      };
      
      // Add to presets list
      savedPresets.value.push(importedPreset);
      savePresetsToStorage();
      
      console.log('✅ Preset imported:', importedPreset.name);
      alert(`Preset "${importedPreset.name}" imported successfully!`);
      
      // Clear file input
      target.value = '';
    } catch (error) {
      console.error('❌ Failed to import preset:', error);
      alert('Failed to import preset. Please check that the file is a valid preset file.');
    }
  };
  
  reader.readAsText(file);
}

// Toggle section expansion
function toggleSection(section: keyof typeof expandedSections) {
  expandedSections[section] = !expandedSections[section];
}

onMounted(() => {
  loadPresetsFromStorage();
});

// Watch for changes in props to check for modifications
watch(
  () => [props.channelControls, props.globalControls, props.soundPads],
  () => {
    checkForModifications();
  },
  { deep: true }
);

// Watch for changes in channel values
watch(
  () => props.channelRefs.map(ref => ref?.values),
  () => {
    checkForModifications();
  },
  { deep: true }
);

// Watch for changes in global control values
watch(
  () => props.globalControlsRef?.values,
  () => {
    checkForModifications();
  },
  { deep: true }
);

// Watch for scene changes
watch(
  () => props.currentScene,
  () => {
    checkForModifications();
  },
  { deep: true }
);
</script>

<style scoped>
/* Presets Section */
.presets-section {
  margin: 24px 0;
  background: #1a1a1a;
  border-radius: 12px;
  border: 2px solid #333;
  padding: 16px;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.section-header {
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

.section-header:hover {
  background: linear-gradient(135deg, #3a3a3a 0%, #2a2a2a 100%);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.preset-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #888;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #666;
  transition: background 0.2s;
}

.status-dot.active {
  background: #4caf50;
}

.toggle-icon {
  color: #4a90e2;
  font-size: 14px;
  font-weight: bold;
}

.section-title {
  color: #4a90e2;
  font-size: 16px;
  font-weight: bold;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.presets-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.presets-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preset-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: all 0.2s ease;
}

.preset-item:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.2);
}

.preset-item.active {
  background: rgba(74, 144, 226, 0.1);
  border-color: rgba(74, 144, 226, 0.3);
}

.preset-item.modified {
  border-color: #ff9800;
  box-shadow: 0 0 0 1px rgba(255, 152, 0, 0.3);
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.preset-name {
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.active-indicator {
  color: #4a90e2;
  font-size: 12px;
}

.modified-indicator {
  color: #ff9800;
  font-size: 14px;
  font-weight: bold;
}

.preset-date {
  color: #888;
  font-size: 12px;
}

.preset-actions {
  display: flex;
  gap: 8px;
}

.preset-action-button {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.edit-button {
  background: #4a90e2;
  color: white;
}

.edit-button:hover {
  background: #3a80d2;
  transform: translateY(-1px);
}

.load-button {
  background: #4caf50;
  color: white;
}

.load-button:hover {
  background: #45a049;
  transform: translateY(-1px);
}

.delete-button {
  background: #f44336;
  color: white;
}

.delete-button:hover {
  background: #e33326;
  transform: translateY(-1px);
}

.download-button {
  background: #4caf50;
  color: white;
}

.download-button:hover {
  background: #45a049;
  transform: translateY(-1px);
}

.save-button {
  background: #ff9800;
  color: white;
}

.save-button:hover {
  background: #ef8900;
  transform: translateY(-1px);
}

.save-button.disabled,
.save-button:disabled {
  background: #666;
  border-color: #555;
  color: #999;
  cursor: not-allowed;
  transform: none;
}

.save-button.disabled:hover,
.save-button:disabled:hover {
  background: #666;
  border-color: #555;
  transform: none;
}

.presets-controls {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.preset-button {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.new-button {
  background: #4a90e2;
  color: white;
}

.new-button:hover {
  background: #3a80d2;
  transform: translateY(-2px);
}

.load-button {
  background: #9c27b0;
  color: white;
}

.load-button:hover {
  background: #8e24aa;
  transform: translateY(-2px);
}

/* Mobile responsive */
@media (max-width: 768px) {
  .presets-controls {
    flex-direction: column;
    align-items: center;
  }
  
  .preset-item {
    flex-direction: column;
    gap: 12px;
    text-align: center;
  }
  
  .preset-actions {
    justify-content: center;
  }
}

/* Name Input Modal */
.name-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  padding: 20px;
}

.name-modal {
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid #333;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  max-width: 400px;
  width: 100%;
}

.name-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  border-bottom: 1px solid #333;
}

.name-modal-title {
  color: #4a90e2;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.name-modal-close {
  background: none;
  border: none;
  color: #888;
  font-size: 24px;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s ease;
}

.name-modal-close:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.name-modal-content {
  padding: 24px;
}

.name-input {
  width: 100%;
  padding: 12px 16px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 6px;
  color: #fff;
  font-size: 14px;
  outline: none;
  transition: border-color 0.2s ease;
}

.name-input:focus {
  border-color: #4a90e2;
  box-shadow: 0 0 0 2px rgba(74, 144, 226, 0.2);
}

.name-input::placeholder {
  color: #888;
}

.name-modal-actions {
  display: flex;
  gap: 12px;
  padding: 20px 24px;
  background: rgba(255, 255, 255, 0.05);
  justify-content: flex-end;
}

.name-modal-button {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.cancel-button {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.cancel-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.confirm-button {
  background: #4a90e2;
  color: white;
}

.confirm-button:hover {
  background: #3a80d2;
  transform: translateY(-1px);
}

/* Mobile responsive for modal */
@media (max-width: 480px) {
  .name-modal-overlay {
    padding: 10px;
  }
  
  .name-modal-header {
    padding: 16px 20px;
  }
  
  .name-modal-title {
    font-size: 16px;
  }
  
  .name-modal-content {
    padding: 20px;
  }
  
  .name-modal-actions {
    flex-direction: column;
    padding: 16px 20px;
  }
  
  .name-modal-button {
    width: 100%;
  }
}
</style>
