<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue';
import MidiConnection from './components/MidiConnection.vue';
import ChannelStrip from './components/ChannelStrip.vue';
import GlobalControls from './components/GlobalControls.vue';
import SoundPads from './components/SoundPads.vue';
import DebugDrawer from './components/DebugDrawer.vue';
import AdvancedSettings from './components/AdvancedSettings.vue';
import { channelControls as defaultChannelControls, globalControls as defaultGlobalControls, soundPads as defaultSoundPads, detectMixerType, type MixerType } from './config/midiConfig';
import { channelControlsL6Max, globalControlsL6Max, soundPadsL6Max } from './config/midiConfigL6Max';
import type { ChannelControls, GlobalControls as GlobalControlsType, SoundPad } from './config/midiConfig';
import { midiService } from './services/midiService';

// Platform detection
function detectPlatform() {
  const userAgent = navigator.userAgent.toLowerCase();
  const isMac = /macintosh|mac os x/.test(userAgent);
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isSafari = /safari/.test(userAgent) && !/chrome/.test(userAgent);
  
  return {
    isMac,
    isIOS,
    isSafari,
    isSafariMac: isMac && isSafari,
    isIOSDevice: isIOS
  };
}

// Platform-specific prompts
const platformInfo = ref(detectPlatform());
const showPlatformPrompt = ref(false);

// Reactive state
const midiConnected = ref(false);
const mixerType = ref<MixerType>('l6');
const appSettings = reactive({
  showAdvanced: false,
  compactMode: false,
});
const showDebugDrawer = ref(false);
const debugDrawerExpanded = ref(true); // Start with panel open by default
const showAdvancedSettings = ref(false);

// MIDI configuration state (can be overridden by advanced settings)
const channelControls = ref<ChannelControls[]>(JSON.parse(JSON.stringify(defaultChannelControls)));
const globalControls = ref<GlobalControlsType>(JSON.parse(JSON.stringify(defaultGlobalControls)));
const soundPads = ref<SoundPad[]>(JSON.parse(JSON.stringify(defaultSoundPads)));

// Function to load config based on mixer type
function loadConfigForMixerType(type: MixerType) {
  if (type === 'l6max') {
    channelControls.value = JSON.parse(JSON.stringify(channelControlsL6Max));
    globalControls.value = JSON.parse(JSON.stringify(globalControlsL6Max));
    soundPads.value = JSON.parse(JSON.stringify(soundPadsL6Max));
  } else {
    channelControls.value = JSON.parse(JSON.stringify(defaultChannelControls));
    globalControls.value = JSON.parse(JSON.stringify(defaultGlobalControls));
    soundPads.value = JSON.parse(JSON.stringify(defaultSoundPads));
  }
}

// Debug data storage (persists between toggles)
const debugData = reactive({
  errorLogs: [] as any[],
  midiLogs: [] as any[],
  activeTab: 'errors' as 'errors' | 'midi' | 'system',
  systemInfo: {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    screenResolution: `${screen.width}x${screen.height}`,
    viewportSize: '',
    devicePixelRatio: window.devicePixelRatio,
    webMidiSupported: false,
    timestamp: new Date()
  }
});

// Refs to channel components for resetting and LFO control
type ChannelStripInstance = InstanceType<typeof ChannelStrip> | null;
const channelRefs = ref<ChannelStripInstance[]>([]);

// Event handlers
function onMidiConnectionChanged(connected: boolean) {
  midiConnected.value = connected;
  if (connected) {
    console.log('MIDI connected successfully');
    
    // Check if there's a saved mixer type override first
    const savedMixerType = localStorage.getItem('zoom-l6-mixer-type') as MixerType | null;
    
    if (!savedMixerType || (savedMixerType !== 'l6' && savedMixerType !== 'l6max')) {
      // No override found, detect from device name
      const deviceName = midiService.inputName || midiService.outputName || '';
      const detectedType = detectMixerType(deviceName);
      if (detectedType !== mixerType.value) {
        mixerType.value = detectedType;
        loadConfigForMixerType(detectedType);
        console.log(`Mixer type detected: ${detectedType}`);
      }
    } else {
      // Use saved override
      if (savedMixerType !== mixerType.value) {
        mixerType.value = savedMixerType;
        loadConfigForMixerType(savedMixerType);
        console.log(`Mixer type using saved override: ${savedMixerType}`);
      }
    }
    
    // Add global MIDI listener when connected
    if (globalMidiListener) {
      midiService.addControlChangeListener(globalMidiListener);
    }
  } else {
    console.log('MIDI disconnected');
    // Remove global MIDI listener when disconnected
    if (globalMidiListener) {
      midiService.removeControlChangeListener(globalMidiListener);
    }
  }
}

function onChannelControlChange(channel: number, control: string, value: number) {
  console.log(`Channel ${channel} - ${control}: ${value}`);
}

function onGlobalControlChange(section: string, control: string, value: number) {
  console.log(`Global ${section} - ${control}: ${value}`);
}

function onSceneChanged(scene: any) {
  console.log(`Scene changed to: ${scene.name} (Program ${scene.program})`);
  // Additional scene change handling can be added here if needed
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

// Computed property to check if there are any active LFOs globally
const hasGlobalActiveLfos = computed(() => {
  return channelRefs.value.some((channelStrip) => {
    return channelStrip && channelStrip.hasActiveLfos;
  });
});

const hasGlobalPausedLfos = computed(() => {
  return channelRefs.value.some((channelStrip) => {
    return channelStrip && channelStrip.hasActiveOrPausedLfos && !channelStrip.hasActiveLfos;
  });
});

const hasGlobalActiveOrPausedLfos = computed(() => {
  return channelRefs.value.some((channelStrip) => {
    return channelStrip && channelStrip.hasActiveOrPausedLfos;
  });
});

const globalLfoButtonText = computed(() => {
  if (!hasGlobalActiveOrPausedLfos.value) return 'No LFOs';
  if (hasGlobalActiveLfos.value) return 'Pause LFOs';
  return 'Resume LFOs';
});

function pauseResumeAllGlobalLfos() {
  // If there are any active LFOs globally, pause ALL active ones across all channels
  // Otherwise, resume ALL paused ones across all channels
  // This ensures consistent behavior and prevents mixed-state issues
  if (hasGlobalActiveLfos.value) {
    // Pause all active LFOs
    channelRefs.value.forEach((channelStrip) => {
      if (channelStrip) {
        channelStrip.pauseAllLfos?.();
      }
    });
  } else {
    // Resume all paused LFOs
    channelRefs.value.forEach((channelStrip) => {
      if (channelStrip) {
        channelStrip.resumeAllLfos?.();
      }
    });
  }
}

async function toggleDebugDrawer() {
  if (!showDebugDrawer.value) {
    // Show the debugger and restore its previous state
    showDebugDrawer.value = true;
    // Wait for the component to be mounted, then restore the panel state
    await nextTick();
    // Trigger reactivity by setting the value again
    const currentState = debugDrawerExpanded.value;
    debugDrawerExpanded.value = !currentState;
    await nextTick();
    debugDrawerExpanded.value = currentState;
  } else {
    // Hide the entire debugger (state is preserved)
    showDebugDrawer.value = false;
  }
}

function onDebugDrawerToggle() {
  debugDrawerExpanded.value = !debugDrawerExpanded.value;
}

function toggleAdvancedSettings() {
  showAdvancedSettings.value = !showAdvancedSettings.value;
}

function handleAdvancedSettingsSave(data: { channelControls: ChannelControls[], globalControls: GlobalControlsType, soundPads: SoundPad[], mixerType: MixerType }) {
  // Update the mixer type if provided
  if (data.mixerType && data.mixerType !== mixerType.value) {
    mixerType.value = data.mixerType;
    console.log(`Mixer type updated to: ${data.mixerType}`);
  }
  
  // Update the configuration (these may be custom or defaults for the selected mixer type)
  channelControls.value = data.channelControls;
  globalControls.value = data.globalControls;
  soundPads.value = data.soundPads;
  
  // Save to localStorage for persistence
  try {
    localStorage.setItem('zoom-l6-channel-controls', JSON.stringify(data.channelControls));
    localStorage.setItem('zoom-l6-global-controls', JSON.stringify(data.globalControls));
    localStorage.setItem('zoom-l6-sound-pads', JSON.stringify(data.soundPads));
    if (data.mixerType) {
      localStorage.setItem('zoom-l6-mixer-type', data.mixerType);
    }
    console.log('✅ Advanced settings saved to localStorage');
    alert('✅ Settings saved successfully!');
  } catch (e) {
    console.error('❌ Failed to save settings to localStorage:', e);
    alert('❌ Failed to save settings. Please check browser storage permissions.');
  }
}

// Global MIDI input handler for debugging and monitoring
let globalMidiListener: ((cc: number, value: number, channel: number) => void) | null = null;

onMounted(() => {
  // Set up global MIDI input monitoring
  globalMidiListener = (cc, value, channel) => {
    console.log(`[App] Global MIDI received: CC${cc} = ${value} on channel ${channel}`);
  };
  
  // Check for platform-specific prompts
  if (platformInfo.value.isSafariMac || platformInfo.value.isIOSDevice) {
    showPlatformPrompt.value = true;
  }
  
  // Load saved settings from localStorage if available
  try {
    // Load mixer type override first
    const savedMixerType = localStorage.getItem('zoom-l6-mixer-type') as MixerType | null;
    if (savedMixerType && (savedMixerType === 'l6' || savedMixerType === 'l6max')) {
      mixerType.value = savedMixerType;
      loadConfigForMixerType(savedMixerType);
      console.log(`Loaded mixer type from localStorage: ${savedMixerType}`);
    }
    
    const savedChannelControls = localStorage.getItem('zoom-l6-channel-controls');
    const savedGlobalControls = localStorage.getItem('zoom-l6-global-controls');
    const savedSoundPads = localStorage.getItem('zoom-l6-sound-pads');
    
    if (savedChannelControls) {
      channelControls.value = JSON.parse(savedChannelControls);
      console.log('Loaded channel controls from localStorage');
    }
    if (savedGlobalControls) {
      globalControls.value = JSON.parse(savedGlobalControls);
      console.log('Loaded global controls from localStorage');
    }
    if (savedSoundPads) {
      soundPads.value = JSON.parse(savedSoundPads);
      console.log('Loaded sound pads from localStorage');
    }
  } catch (e) {
    console.error('Failed to load settings from localStorage:', e);
  }
  
  // The listener will be added when MIDI connects via onMidiConnectionChanged
});

onUnmounted(() => {
  if (globalMidiListener) {
    midiService.removeControlChangeListener(globalMidiListener);
    globalMidiListener = null;
  }
});
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
            @click="appSettings.compactMode = !appSettings.compactMode"
            class="header-button"
            :class="{ active: appSettings.compactMode }"
          >
            Compact
          </button>
          
          <button 
            @click="toggleAdvancedSettings"
            class="header-button"
            :class="{ active: showAdvancedSettings }"
            title="Advanced MIDI Settings"
          >
            Advanced
          </button>
          
          <button 
            @click="toggleDebugDrawer"
            class="header-button debug-button"
            :class="{ active: showDebugDrawer }"
            title="Toggle Debug Console"
          >
            Debug
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
              <button 
                @click="pauseResumeAllGlobalLfos" 
                class="section-button lfo-control-button"
                :class="{ 
                  disabled: !hasGlobalActiveOrPausedLfos,
                  pause: hasGlobalActiveLfos,
                  resume: hasGlobalPausedLfos
                }"
                :disabled="!hasGlobalActiveOrPausedLfos"
                :title="hasGlobalActiveLfos ? 'Pause all LFOs globally' : hasGlobalPausedLfos ? 'Resume all LFOs globally' : 'No active or paused LFOs'"
              >
                {{ globalLfoButtonText }}
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
              :compactMode="appSettings.compactMode"
              :mixerType="mixerType"
              ref="channelRefs"
              @controlChange="onChannelControlChange"
            />
          </div>
        </section>
        
        <!-- Global Controls -->
        <section class="global-section">
          <GlobalControls
            :globalData="globalControls"
            :mixerType="mixerType"
            @controlChange="onGlobalControlChange"
            @sceneChanged="onSceneChanged"
          />
        </section>
        
        <!-- Sound Pads -->
        <section class="soundpads-section">
          <SoundPads :soundPads="soundPads" />
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
          <h2>Connect Your Zoom L6 or L6Max</h2>
          <p>Please connect your Zoom L6 or L6Max via USB and select it from the MIDI connection panel above.</p>
          <ul class="setup-steps">
            <li>Connect your Zoom L6 or L6Max to your device via USB</li>
            <li>Ensure the device is powered on</li>
            <li>Click "Auto-Connect Zoom" or manually select the device. If there are multiple L6 or L6Max devices, it's usually the 2nd one or the one labeled "Mixer Control".</li>
            <li>Start controlling your mixer!</li>
            <li>Note: You may need to bridge the MIDI in and out ports (plug a cable between the two) on the Zoom L6 or L6Max to get MIDI to work in both directions.</li>
            <li>The app uses the default Zoom L6 or L6Max MIDI mappings on first run. You can customize the mappings in the Advanced Settings.</li>
          </ul>
        </div>
      </div>
    </main>

    <!-- Platform-specific prompts -->
    <div v-if="showPlatformPrompt" class="platform-prompt-overlay">
      <div class="platform-prompt">
        <!-- Safari macOS prompt -->
        <div v-if="platformInfo.isSafariMac" class="platform-notice safari-mac">
          <div class="notice-header">
            <h3>🔌 Jazz Plugin Required for Safari</h3>
            <button @click="showPlatformPrompt = false" class="close-button">×</button>
          </div>
          <div class="notice-content">
            <p>Safari requires the Jazz Plugin to access MIDI devices. Please install it to use this app:</p>
            <ol>
              <li>Download the Jazz Plugin from <a href="https://jazz-soft.net/download/Jazz-Plugin/" target="_blank">jazz-soft.net</a></li>
              <li>Run the installer and follow the setup instructions</li>
              <li>Restart Safari after installation</li>
              <li>Reload this page</li>
            </ol>
            <div class="notice-actions">
              <a href="https://jazz-soft.net/download/Jazz-Plugin/" target="_blank" class="download-button">
                Download Jazz Plugin
              </a>
              <button @click="showPlatformPrompt = false" class="skip-button">
                Skip for now
              </button>
            </div>
          </div>
        </div>

        <!-- iOS prompt -->
        <div v-if="platformInfo.isIOSDevice" class="platform-notice ios">
          <div class="notice-header">
            <h3>📱 iOS WebMIDI Limitation</h3>
            <button @click="showPlatformPrompt = false" class="close-button">×</button>
          </div>
          <div class="notice-content">
            <p>Unfortunately, Apple does not support the Web MIDI API on iOS devices. This web app cannot directly control your Zoom L6 from iOS.</p>
            <div class="ios-info">
              <p><strong>Good news:</strong> We're working on a native iOS app that will provide full Zoom L6 control!</p>
              <p>For now, you can use this app on:</p>
              <ul>
                <li>macOS (Safari with Jazz Plugin, or Chrome/Firefox)</li>
                <li>Windows (Chrome, Firefox, Edge)</li>
                <li>Linux (Chrome, Firefox)</li>
              </ul>
            </div>
            <div class="notice-actions">
              <button @click="showPlatformPrompt = false" class="continue-button">
                Continue anyway
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <footer class="app-footer">
      <div class="footer-content">
        <p>Built by <a href="https://github.com/philmillman" target="_blank">philmillman</a> | Not affiliated with Zoom Corp</p>
      </div>
    </footer>

    <!-- Debug Drawer -->
    <DebugDrawer 
      v-if="showDebugDrawer"
      :isVisible="debugDrawerExpanded"
      :debugData="debugData"
      @toggle="onDebugDrawerToggle"
    />
    
        <!-- Advanced Settings Dialog -->
    <AdvancedSettings 
      :isVisible="showAdvancedSettings"
      :currentChannelControls="channelControls"
      :currentGlobalControls="globalControls"
      :currentSoundPads="soundPads"
      :currentMixerType="mixerType"
      @close="showAdvancedSettings = false"
      @save="handleAdvancedSettingsSave"
    />
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

.debug-button.active {
  background: #ff9800;
  border-color: #ff9800;
  color: #fff;
}

.debug-button:hover {
  background: rgba(255, 152, 0, 0.2);
  border-color: rgba(255, 152, 0, 0.3);
  color: #ff9800;
}


/* Main Content */
.app-main {
  flex: 1;
  max-width: 1400px;
  margin: 0 auto;
  padding: 20px;
  width: 100%;
}

@media (max-width: 480px) {
  .app-main {
    padding: 4px;
  }
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

.lfo-control-button {
  background: #ff9800;
  color: white;
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
  border-color: #fb8c00;
}

.lfo-control-button.pause:hover {
  background: #5a9ff2;
  border-color: #4a8dd8;
}

.lfo-control-button.resume:hover {
  background: #f7b84d;
  border-color: #f0a733;
}

.lfo-control-button.disabled,
.lfo-control-button:disabled {
  background: #666;
  border-color: #555;
  color: #999;
  cursor: not-allowed;
}

.lfo-control-button.disabled:hover,
.lfo-control-button:disabled:hover {
  background: #666;
  border-color: #555;
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
  padding-left: 0;
  margin-left: 0;
  list-style-position: inside;
}

.setup-steps li {
  margin-bottom: 8px;
  padding-left: 0;
  list-style-type: none;
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

/* Mobile-first responsive design */
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
    gap: 6px;
  }
  
  .channels-grid.compact {
    gap: 4px;
    padding: 8px;
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
  
  .section-title {
    font-size: 16px;
  }
  
  .section-controls {
    flex-direction: row;
    gap: 6px;
  }
  
  .reset-button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .app-main {
    padding: 0px;
  }
  
  .app-title {
    font-size: 18px;
  }
  
  .companion-text {
    font-size: 14px;
  }
  
  .section-title {
    font-size: 14px;
  }
  
  .channels-grid {
    gap: 1px;
    padding: 2px;
  }
  
  .channels-grid.compact {
    gap: 0px;
    padding: 1px;
  }
  
  .header-controls {
    flex-direction: column;
    width: 100%;
  }
  
  .header-button {
    width: 100%;
    margin-bottom: 4px;
  }
  
  .prompt-content {
    padding: 12px;
  }
  
  .prompt-content h2 {
    font-size: 18px;
  }
  
  .setup-steps {
    font-size: 12px;
  }
  
  .mixer-container {
    gap: 8px;
  }
  
  .section-header {
    margin-bottom: 8px;
    padding-bottom: 4px;
  }
}

/* Platform Prompt Styles */
.platform-prompt-overlay {
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

.platform-prompt {
  max-width: 500px;
  width: 100%;
}

.platform-notice {
  background: #1a1a1a;
  border-radius: 12px;
  border: 1px solid #333;
  overflow: hidden;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.notice-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 24px;
  background: linear-gradient(135deg, #2a2a2a 0%, #1a1a1a 100%);
  border-bottom: 1px solid #333;
}

.notice-header h3 {
  color: #4a90e2;
  font-size: 18px;
  font-weight: 600;
  margin: 0;
}

.close-button {
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

.close-button:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.notice-content {
  padding: 24px;
}

.notice-content p {
  color: #ccc;
  margin-bottom: 16px;
  line-height: 1.5;
}

.notice-content ol {
  color: #aaa;
  margin: 16px 0;
  padding-left: 20px;
}

.notice-content li {
  margin-bottom: 8px;
  line-height: 1.4;
}

.notice-content a {
  color: #4a90e2;
  text-decoration: none;
}

.notice-content a:hover {
  text-decoration: underline;
}

.ios-info {
  background: rgba(255, 255, 255, 0.05);
  padding: 16px;
  border-radius: 8px;
  margin: 16px 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.ios-info p {
  margin-bottom: 12px;
}

.ios-info ul {
  color: #aaa;
  margin: 12px 0;
  padding-left: 20px;
}

.ios-info li {
  margin-bottom: 6px;
}

.notice-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: center;
}

.download-button,
.skip-button,
.continue-button {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  display: inline-block;
  text-align: center;
}

.download-button {
  background: #4a90e2 !important;
  color: white !important;
}

.download-button:hover {
  background: #3a7bc8 !important;
  color: white !important;
  transform: translateY(-2px);
}

.skip-button {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.skip-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.continue-button {
  background: #4caf50;
  color: white;
}

.continue-button:hover {
  background: #45a049;
  transform: translateY(-2px);
}

/* Safari Mac specific styling */
.platform-notice.safari-mac .notice-header {
  background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
}

.platform-notice.safari-mac .notice-header h3 {
  color: white;
}

/* iOS specific styling */
.platform-notice.ios .notice-header {
  background: linear-gradient(135deg, #4a90e2 0%, #3a7bc8 100%);
}

.platform-notice.ios .notice-header h3 {
  color: white;
}

/* Mobile responsive */
@media (max-width: 480px) {
  .platform-prompt-overlay {
    padding: 10px;
  }
  
  .notice-header {
    padding: 16px 20px;
  }
  
  .notice-header h3 {
    font-size: 16px;
  }
  
  .notice-content {
    padding: 20px;
  }
  
  .notice-actions {
    flex-direction: column;
  }
  
  .download-button,
  .skip-button,
  .continue-button {
    width: 100%;
  }
}
</style>
