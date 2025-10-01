<script setup lang="ts">
import { ref, reactive } from 'vue';
import MidiConnection from './components/MidiConnection.vue';
import ChannelStrip from './components/ChannelStrip.vue';
import GlobalControls from './components/GlobalControls.vue';
import { channelControls, globalControls } from './config/midiConfig';

// Reactive state
const midiConnected = ref(false);
const appSettings = reactive({
  showAdvanced: false,
  compactMode: false,
});

// Refs to channel components for resetting
type ChannelStripInstance = InstanceType<typeof ChannelStrip> | null;
const channelRefs = ref<ChannelStripInstance[]>([]);

// Event handlers
function onMidiConnectionChanged(connected: boolean) {
  midiConnected.value = connected;
  if (connected) {
    console.log('MIDI connected successfully');
  }
}

function onChannelControlChange(channel: number, control: string, value: number) {
  console.log(`Channel ${channel} - ${control}: ${value}`);
}

function onGlobalControlChange(section: string, control: string, value: number) {
  console.log(`Global ${section} - ${control}: ${value}`);
}

function resetAllChannels() {
  // Call resetToDefaults on each ChannelStrip instance
  channelRefs.value.forEach((instance) => {
    instance?.resetToDefaults?.();
  });
}

function savePreset() {
  console.log('Saving current preset');
  // Implementation for saving presets
}

function loadPreset() {
  console.log('Loading preset');
  // Implementation for loading presets
}
</script>

<template>
  <div id="app">
    <header class="app-header">
      <div class="header-content">
        <h1 class="app-title">
          <span class="zoom-text">ZOOM</span>
          <span class="l6-text">L6</span>
          <span class="companion-text">Companion</span>
        </h1>
        
        <div class="header-controls">
          <button 
            class="header-button"
            :class="{ active: appSettings.compactMode }"
            disabled
            title="Coming soon"
          >
            Compact
          </button>
          
          <button 
            class="header-button"
            :class="{ active: appSettings.showAdvanced }"
            disabled
            title="Coming soon"
          >
            Advanced
          </button>
        </div>
      </div>
    </header>

    <main class="app-main">
      <!-- MIDI Connection -->
      <MidiConnection @connectionChanged="onMidiConnectionChanged" />
      
      <div v-if="midiConnected" class="mixer-container">
        <!-- Channel Strips -->
        <section class="channels-section">
          <div class="section-header">
            <h2 class="section-title">Channel Strips</h2>
            <div class="section-controls">
              <button @click="resetAllChannels" class="section-button reset-button">
                Reset All
              </button>
            </div>
          </div>
          
          <div 
            class="channels-grid" 
            :class="{ 
              compact: appSettings.compactMode,
              advanced: appSettings.showAdvanced 
            }"
          >
            <ChannelStrip
              v-for="channel in channelControls"
              :key="channel.channel"
              :channelData="channel"
              ref="channelRefs"
              @controlChange="onChannelControlChange"
            />
          </div>
        </section>
        
        <!-- Global Controls -->
        <section class="global-section">
          <GlobalControls
            :globalData="globalControls"
            @controlChange="onGlobalControlChange"
          />
        </section>
        
        <!-- Preset Management (if advanced mode is enabled) -->
        <section v-if="appSettings.showAdvanced" class="presets-section">
          <div class="section-header">
            <h2 class="section-title">Presets</h2>
          </div>
          
          <div class="presets-controls">
            <button @click="savePreset" class="preset-button save-button">
              Save Preset
            </button>
            <button @click="loadPreset" class="preset-button load-button">
              Load Preset
            </button>
          </div>
        </section>
      </div>
      
      <!-- Connection prompt -->
      <div v-else class="connection-prompt">
        <div class="prompt-content">
          <h2>Connect Your Zoom L6</h2>
          <p>Please connect your Zoom L6 via USB and select it from the MIDI connection panel above.</p>
          <ul class="setup-steps">
            <li>Connect your Zoom L6 to your computer via USB</li>
            <li>Ensure the device is powered on</li>
            <li>Click "Auto-Connect Zoom" or manually select the device</li>
            <li>Start controlling your mixer!</li>
          </ul>
        </div>
      </div>
    </main>

    <footer class="app-footer">
      <div class="footer-content">
        <p>&copy; 2024 Zoom L6 Companion App | Built with Vue.js & WebMIDI</p>
      </div>
    </footer>
  </div>
</template>

<style>
/* Global Styles */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #0f0f0f;
  color: #fff;
  line-height: 1.6;
  overflow-x: auto;
}

#app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

/* Header Styles */
.app-header {
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border-bottom: 2px solid #333;
  padding: 16px 0;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);
}

.header-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.app-title {
  font-size: 28px;
  font-weight: bold;
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-text {
  color: #4a90e2;
  text-shadow: 0 0 10px rgba(74, 144, 226, 0.5);
}

.l6-text {
  color: #fff;
  background: linear-gradient(45deg, #4a90e2, #6aa0f2);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.companion-text {
  color: #888;
  font-size: 20px;
  font-weight: 300;
}

.header-controls {
  display: flex;
  gap: 12px;
}

.header-button {
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: #ccc;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.header-button:hover {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.3);
  color: #fff;
}

.header-button.active {
  background: #4a90e2;
  border-color: #4a90e2;
  color: #fff;
}

/* Main Content */
.app-main {
  flex: 1;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  width: 100%;
}

.mixer-container {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

/* Section Styles */
.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.section-title {
  color: #4a90e2;
  font-size: 20px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.section-controls {
  display: flex;
  gap: 8px;
}

.section-button {
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ccc;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
}

.section-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.reset-button:hover {
  background: #f44336;
  border-color: #f44336;
}

/* Channel Grid */
.channels-grid {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  padding: 16px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.channels-grid.compact {
  gap: 8px;
}

/* Global Section */
.global-section {
  margin-top: 24px;
}

/* Presets Section */
.presets-section {
  margin-top: 24px;
  padding: 20px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
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

.save-button {
  background: #4caf50;
  color: white;
}

.save-button:hover {
  background: #45a049;
  transform: translateY(-2px);
}

.load-button {
  background: #2196f3;
  color: white;
}

.load-button:hover {
  background: #1976d2;
  transform: translateY(-2px);
}

/* Connection Prompt */
.connection-prompt {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
  padding: 40px;
}

.prompt-content {
  text-align: center;
  max-width: 500px;
  padding: 40px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.prompt-content h2 {
  color: #4a90e2;
  margin-bottom: 16px;
  font-size: 24px;
}

.prompt-content p {
  color: #ccc;
  margin-bottom: 24px;
  font-size: 16px;
}

.setup-steps {
  text-align: left;
  color: #aaa;
  font-size: 14px;
}

.setup-steps li {
  margin-bottom: 8px;
  padding-left: 8px;
}

/* Footer */
.app-footer {
  background: #1a1a1a;
  border-top: 1px solid #333;
  padding: 16px 0;
  margin-top: auto;
}

.footer-content {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 20px;
  text-align: center;
  color: #666;
  font-size: 12px;
}

/* Responsive Design */
@media (max-width: 1200px) {
  .app-main {
    padding: 16px;
  }
  
  .channels-grid {
    gap: 8px;
  }
}

@media (max-width: 768px) {
  .header-content {
    flex-direction: column;
    gap: 16px;
    text-align: center;
  }
  
  .app-title {
    font-size: 24px;
  }
  
  .companion-text {
    font-size: 16px;
  }
  
  .channels-grid {
    justify-content: center;
    padding: 12px;
  }
  
  .presets-controls {
    flex-direction: column;
    align-items: center;
  }
  
  .prompt-content {
    padding: 24px;
  }
  
  .prompt-content h2 {
    font-size: 20px;
  }
}

@media (max-width: 480px) {
  .app-main {
    padding: 12px;
  }
  
  .app-title {
    font-size: 20px;
  }
  
  .section-title {
    font-size: 16px;
  }
  
  .channels-grid {
    gap: 4px;
  }
}
</style>
