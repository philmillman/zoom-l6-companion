<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from 'vue';
import { midiService } from '../services/midiService';
import { sceneControls, type SceneControl } from '../config/midiConfig';
import { sceneControlsL6Max } from '../config/midiConfigL6Max';

interface Props {
  mixerType?: 'l6' | 'l6max';
}

const props = withDefaults(defineProps<Props>(), {
  mixerType: 'l6'
});

// Emits
const emit = defineEmits<{
  sceneChanged: [scene: SceneControl];
}>();

// Use appropriate scene controls based on mixer type
const activeSceneControls = computed(() => {
  return props.mixerType === 'l6max' ? sceneControlsL6Max : sceneControls;
});

// Reactive state
const currentScene = ref<SceneControl | null>(null);
const isConnected = ref(false);

// Scene selection
function selectScene(scene: SceneControl) {
  if (!isConnected.value) {
    console.warn('MIDI not connected, cannot send scene change');
    return;
  }

  try {
    // Send Program Change message
    midiService.sendProgramChange(scene.program, scene.channel);
    
    // Update current scene
    currentScene.value = scene;
    
    // Emit scene change event
    emit('sceneChanged', scene);
    
    console.log(`Scene changed to: ${scene.name} (Program ${scene.program})`);
  } catch (error) {
    console.error('Failed to send scene change:', error);
  }
}

// MIDI Program Change listener
function handleProgramChange(program: number, channel: number) {
  // Find the scene that matches this program change
  const scene = activeSceneControls.value.find(s => s.program === program && s.channel === channel);
  if (scene) {
    currentScene.value = scene;
    emit('sceneChanged', scene);
    console.log(`Scene received: ${scene.name} (Program ${program})`);
  }
}

// Watch MIDI connection state
function updateConnectionState() {
  isConnected.value = midiService.isConnected;
}

// Lifecycle
onMounted(() => {
  // Set up MIDI Program Change listener
  midiService.addProgramChangeListener(handleProgramChange);
  
  // Watch connection state
  updateConnectionState();
  
  // Set initial scene to first one
  if (activeSceneControls.value.length > 0) {
    currentScene.value = activeSceneControls.value[0]!;
  }
});

onUnmounted(() => {
  // Clean up listener
  midiService.removeProgramChangeListener(handleProgramChange);
});
</script>

<template>
  <div class="scene-controls">
    <div class="section-title">Scenes</div>
    <div class="scene-buttons">
      <button
        v-for="scene in activeSceneControls"
        :key="scene.id"
        class="scene-button"
        :class="{ 
          active: currentScene?.id === scene.id,
          disabled: !isConnected 
        }"
        @click="selectScene(scene)"
        :disabled="!isConnected"
        :title="`${scene.name} (PC ${scene.program})`"
      >
        {{ scene.id }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.scene-controls {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.section-title {
  font-size: 14px;
  color: #4a90e2;
  text-align: center;
  margin-bottom: 16px;
  text-transform: uppercase;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.scene-buttons {
  display: flex;
  gap: 8px;
  justify-content: center;
  width: 100%;
}

.scene-button {
  width: 40px;
  height: 40px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scene-button:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
}

.scene-button.active {
  background: rgba(74, 144, 226, 0.3);
  border-color: #4a90e2;
  color: #4a90e2;
}

.scene-button.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .section-title {
    font-size: 12px;
  }
  
  .scene-button {
    width: 32px;
    height: 32px;
    font-size: 14px;
  }
}
</style>
