<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue';
import { midiService } from '../services/midiService';

// Props
interface Props {
  isVisible?: boolean;
  debugData?: {
    errorLogs: any[];
    midiLogs: any[];
    activeTab: 'errors' | 'midi' | 'system';
    systemInfo: any;
  };
}

const props = withDefaults(defineProps<Props>(), {
  isVisible: false,
  debugData: () => ({
    errorLogs: [],
    midiLogs: [],
    activeTab: 'errors',
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
  })
});

// Emits
const emit = defineEmits<{
  toggle: [];
}>();

// Reactive state
const isExpanded = ref(false);
const activeTab = computed({
  get: () => props.debugData.activeTab,
  set: (value: 'errors' | 'midi' | 'system') => {
    props.debugData.activeTab = value;
  }
});

// Error logging
interface ErrorLog {
  id: string;
  timestamp: Date;
  type: 'error' | 'warning' | 'info';
  message: string;
  stack?: string;
  source?: string;
}

// MIDI message logging
interface MidiLog {
  id: string;
  timestamp: Date;
  direction: 'in' | 'out';
  type: 'cc' | 'note' | 'pc' | 'other';
  channel: number;
  data: any;
  description: string;
}

// Use persistent debug data from props
const errorLogs = computed(() => props.debugData.errorLogs);
const midiLogs = computed(() => props.debugData.midiLogs);
const systemInfo = computed(() => props.debugData.systemInfo);

const maxLogs = 100;
const maxMidiLogs = 50;

// Reactive MIDI connection state
const midiConnected = computed(() => midiService.connectionState.value);

// Computed properties
const errorCount = computed(() => props.debugData.errorLogs.length);
const midiCount = computed(() => props.debugData.midiLogs.length);
const hasErrors = computed(() => props.debugData.errorLogs.some(log => log.type === 'error'));
const hasWarnings = computed(() => props.debugData.errorLogs.some(log => log.type === 'warning'));

// Methods
function toggleDrawer() {
  isExpanded.value = !isExpanded.value;
  emit('toggle');
}

function addErrorLog(type: ErrorLog['type'], message: string, stack?: string, source?: string) {
  const log: ErrorLog = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    type,
    message,
    stack,
    source
  };
  
  props.debugData.errorLogs.unshift(log);
  
  // Keep only the most recent logs
  if (props.debugData.errorLogs.length > maxLogs) {
    props.debugData.errorLogs.splice(maxLogs);
  }
}

function addMidiLog(direction: MidiLog['direction'], type: MidiLog['type'], channel: number, data: any, description: string) {
  const log: MidiLog = {
    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date(),
    direction,
    type,
    channel,
    data,
    description
  };
  
  props.debugData.midiLogs.unshift(log);
  
  // Keep only the most recent logs
  if (props.debugData.midiLogs.length > maxMidiLogs) {
    props.debugData.midiLogs.splice(maxMidiLogs);
  }
}

function clearLogs(type: 'errors' | 'midi' | 'all' = 'all') {
  if (type === 'errors' || type === 'all') {
    props.debugData.errorLogs.length = 0;
  }
  if (type === 'midi' || type === 'all') {
    props.debugData.midiLogs.length = 0;
  }
}

function updateSystemInfo() {
  props.debugData.systemInfo.viewportSize = `${window.innerWidth}x${window.innerHeight}`;
  props.debugData.systemInfo.onLine = navigator.onLine;
  props.debugData.systemInfo.timestamp = new Date();
}

function formatTimestamp(date: Date): string {
  const timeString = date.toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit'
  });
  
  // Add milliseconds manually for better compatibility
  const milliseconds = date.getMilliseconds().toString().padStart(3, '0');
  return `${timeString}.${milliseconds}`;
}

function getLogTypeClass(type: ErrorLog['type']): string {
  switch (type) {
    case 'error': return 'log-error';
    case 'warning': return 'log-warning';
    case 'info': return 'log-info';
    default: return '';
  }
}

function getMidiDirectionClass(direction: MidiLog['direction']): string {
  return direction === 'in' ? 'midi-in' : 'midi-out';
}

// Error handling setup
function setupErrorHandling() {
  // Global error handler
  window.addEventListener('error', (event) => {
    addErrorLog('error', event.message, event.error?.stack, event.filename);
  });

  // Unhandled promise rejection handler
  window.addEventListener('unhandledrejection', (event) => {
    addErrorLog('error', `Unhandled Promise Rejection: ${event.reason}`, undefined, 'Promise');
  });

  // Console override for debugging
  const originalConsoleError = console.error;
  const originalConsoleWarn = console.warn;
  const originalConsoleInfo = console.info;

  console.error = (...args) => {
    addErrorLog('error', args.join(' '));
    originalConsoleError.apply(console, args);
  };

  console.warn = (...args) => {
    addErrorLog('warning', args.join(' '));
    originalConsoleWarn.apply(console, args);
  };

  console.info = (...args) => {
    addErrorLog('info', args.join(' '));
    originalConsoleInfo.apply(console, args);
  };

  // Return cleanup function
  return () => {
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    console.info = originalConsoleInfo;
  };
}

// MIDI monitoring setup
function setupMidiMonitoring() {
  // Monitor MIDI input - Control Changes
  const midiCCListener = (cc: number, value: number, channel: number) => {
    addMidiLog('in', 'cc', channel, { cc, value }, `CC${cc} = ${value} on channel ${channel}`);
  };

  // Monitor MIDI input - Note On
  const midiNoteOnListener = (note: number, velocity: number, channel: number) => {
    addMidiLog('in', 'note', channel, { note, velocity, type: 'on' }, `Note On: ${note} (vel: ${velocity}) on channel ${channel}`);
  };

  // Monitor MIDI input - Note Off
  const midiNoteOffListener = (note: number, velocity: number, channel: number) => {
    addMidiLog('in', 'note', channel, { note, velocity, type: 'off' }, `Note Off: ${note} (vel: ${velocity}) on channel ${channel}`);
  };

  // Monitor MIDI input - Program Change
  const midiProgramChangeListener = (program: number, channel: number) => {
    addMidiLog('in', 'pc', channel, { program }, `Program Change: ${program} on channel ${channel}`);
  };

  // Monitor MIDI output (we'll need to patch the midiService methods)
  const originalSendControlChange = midiService.sendControlChange;
  const originalSendNoteOn = midiService.sendNoteOn;
  const originalSendNoteOff = midiService.sendNoteOff;
  const originalSendProgramChange = midiService.sendProgramChange;

  // Patch sendControlChange
  midiService.sendControlChange = function(control: any, value: number) {
    addMidiLog('out', 'cc', control.channel, { cc: control.cc, value }, `CC${control.cc} = ${value} on channel ${control.channel}`);
    return originalSendControlChange.call(this, control, value);
  };

  // Patch sendNoteOn
  midiService.sendNoteOn = function(note: number, channel: number, velocity: number) {
    addMidiLog('out', 'note', channel, { note, velocity, type: 'on' }, `Note On: ${note} (vel: ${velocity}) on channel ${channel}`);
    return originalSendNoteOn.call(this, note, channel, velocity);
  };

  // Patch sendNoteOff
  midiService.sendNoteOff = function(note: number, channel: number, release: number) {
    addMidiLog('out', 'note', channel, { note, release, type: 'off' }, `Note Off: ${note} (rel: ${release}) on channel ${channel}`);
    return originalSendNoteOff.call(this, note, channel, release);
  };

  // Patch sendProgramChange
  midiService.sendProgramChange = function(program: number, channel: number) {
    addMidiLog('out', 'pc', channel, { program }, `Program Change: ${program} on channel ${channel}`);
    return originalSendProgramChange.call(this, program, channel);
  };

  // Add MIDI input listeners
  if (midiService.isConnected) {
    midiService.addControlChangeListener(midiCCListener);
    midiService.addNoteOnListener(midiNoteOnListener);
    midiService.addNoteOffListener(midiNoteOffListener);
    midiService.addProgramChangeListener(midiProgramChangeListener);
  }

  // Watch for MIDI connection changes
  const stopWatching = watch(() => midiService.connectionState.value, (connected) => {
    if (connected) {
      midiService.addControlChangeListener(midiCCListener);
      midiService.addNoteOnListener(midiNoteOnListener);
      midiService.addNoteOffListener(midiNoteOffListener);
      midiService.addProgramChangeListener(midiProgramChangeListener);
    } else {
      midiService.removeControlChangeListener(midiCCListener);
      midiService.removeNoteOnListener(midiNoteOnListener);
      midiService.removeNoteOffListener(midiNoteOffListener);
      midiService.removeProgramChangeListener(midiProgramChangeListener);
    }
  });

  // Return cleanup function
  return () => {
    midiService.removeControlChangeListener(midiCCListener);
    midiService.removeNoteOnListener(midiNoteOnListener);
    midiService.removeNoteOffListener(midiNoteOffListener);
    midiService.removeProgramChangeListener(midiProgramChangeListener);
    midiService.sendControlChange = originalSendControlChange;
    midiService.sendNoteOn = originalSendNoteOn;
    midiService.sendNoteOff = originalSendNoteOff;
    midiService.sendProgramChange = originalSendProgramChange;
    stopWatching();
  };
}

// System monitoring
function setupSystemMonitoring() {
  const updateViewport = () => updateSystemInfo();
  
  window.addEventListener('resize', updateViewport);
  window.addEventListener('orientationchange', updateViewport);
  window.addEventListener('online', updateViewport);
  window.addEventListener('offline', updateViewport);

  // Check WebMIDI support
  props.debugData.systemInfo.webMidiSupported = 'requestMIDIAccess' in navigator;

  return () => {
    window.removeEventListener('resize', updateViewport);
    window.removeEventListener('orientationchange', updateViewport);
    window.removeEventListener('online', updateViewport);
    window.removeEventListener('offline', updateViewport);
  };
}

// Lifecycle
let cleanupErrorHandling: (() => void) | null = null;
let cleanupMidiMonitoring: (() => void) | null = null;
let cleanupSystemMonitoring: (() => void) | null = null;

onMounted(() => {
  cleanupErrorHandling = setupErrorHandling();
  cleanupMidiMonitoring = setupMidiMonitoring();
  cleanupSystemMonitoring = setupSystemMonitoring();
  updateSystemInfo();
});

onUnmounted(() => {
  cleanupErrorHandling?.();
  cleanupMidiMonitoring?.();
  cleanupSystemMonitoring?.();
});

// Watch for visibility changes
watch(() => props.isVisible, (visible) => {
  isExpanded.value = visible;
});
</script>

<template>
  <div class="debug-drawer" :class="{ expanded: isExpanded }">
    <!-- Debug Toggle Button -->
    <button 
      class="debug-toggle"
      @click="toggleDrawer"
      :class="{ 
        'has-errors': hasErrors, 
        'has-warnings': hasWarnings && !hasErrors,
        'has-logs': errorCount > 0 || midiCount > 0
      }"
      :title="`Debug Console (${errorCount} errors, ${midiCount} MIDI messages)`"
    >
      <svg class="debug-icon" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>
      <span class="debug-badge" v-if="errorCount > 0 || midiCount > 0">
        {{ errorCount + midiCount }}
      </span>
    </button>

    <!-- Debug Panel -->
    <div class="debug-panel" v-if="isExpanded">
      <div class="debug-header">
        <h3 class="debug-title">Debug Console</h3>
        <div class="debug-controls">
          <button 
            class="clear-button"
            @click="clearLogs('all')"
            title="Clear all logs"
          >
            Clear All
          </button>
          <button 
            class="close-button"
            @click="toggleDrawer"
            title="Close debug console"
          >
            ×
          </button>
        </div>
      </div>

      <!-- Tab Navigation -->
      <div class="debug-tabs">
        <button 
          class="debug-tab"
          :class="{ active: activeTab === 'errors' }"
          @click="activeTab = 'errors'"
        >
          Errors
          <span class="tab-badge" v-if="errorCount > 0">{{ errorCount }}</span>
        </button>
        <button 
          class="debug-tab"
          :class="{ active: activeTab === 'midi' }"
          @click="activeTab = 'midi'"
        >
          MIDI
          <span class="tab-badge" v-if="midiCount > 0">{{ midiCount }}</span>
        </button>
        <button 
          class="debug-tab"
          :class="{ active: activeTab === 'system' }"
          @click="activeTab = 'system'"
        >
          System
        </button>
      </div>

      <!-- Tab Content -->
      <div class="debug-content">
        <!-- Errors Tab -->
        <div v-if="activeTab === 'errors'" class="tab-panel">
          <div class="panel-header">
            <h4>Error Logs</h4>
            <button class="clear-button small" @click="clearLogs('errors')">Clear</button>
          </div>
          <div class="log-container">
            <div 
              v-for="log in errorLogs" 
              :key="log.id"
              class="log-entry"
              :class="getLogTypeClass(log.type)"
            >
              <div class="log-header">
                <span class="log-timestamp">{{ formatTimestamp(log.timestamp) }}</span>
                <span class="log-type">{{ log.type.toUpperCase() }}</span>
                <span class="log-source" v-if="log.source">{{ log.source }}</span>
              </div>
              <div class="log-message">{{ log.message }}</div>
              <div class="log-stack" v-if="log.stack">{{ log.stack }}</div>
            </div>
            <div v-if="props.debugData.errorLogs.length === 0" class="no-logs">
              No error logs yet
            </div>
          </div>
        </div>

        <!-- MIDI Tab -->
        <div v-if="activeTab === 'midi'" class="tab-panel">
          <div class="panel-header">
            <h4>MIDI Messages</h4>
            <button class="clear-button small" @click="clearLogs('midi')">Clear</button>
          </div>
          <div class="log-container">
            <div 
              v-for="log in midiLogs" 
              :key="log.id"
              class="log-entry midi-log"
              :class="[getMidiDirectionClass(log.direction), { 'midi-pc': log.type === 'pc' }]"
            >
              <div class="log-header">
                <span class="log-timestamp">{{ formatTimestamp(log.timestamp) }}</span>
                <span class="log-direction">{{ log.direction.toUpperCase() }}</span>
                <span class="log-type">{{ log.type.toUpperCase() }}</span>
                <span class="log-channel">CH{{ log.channel }}</span>
              </div>
              <div class="log-message">{{ log.description }}</div>
              <div class="log-data" v-if="log.data">
                <pre>{{ JSON.stringify(log.data, null, 2) }}</pre>
              </div>
            </div>
            <div v-if="props.debugData.midiLogs.length === 0" class="no-logs">
              No MIDI messages yet
            </div>
          </div>
        </div>

        <!-- System Tab -->
        <div v-if="activeTab === 'system'" class="tab-panel">
          <div class="panel-header">
            <h4>System Information</h4>
            <button class="refresh-button small" @click="updateSystemInfo">Refresh</button>
          </div>
          <div class="system-info">
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Platform:</span>
                <span class="info-value">{{ props.debugData.systemInfo.platform }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Language:</span>
                <span class="info-value">{{ props.debugData.systemInfo.language }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Online:</span>
                <span class="info-value" :class="{ online: props.debugData.systemInfo.onLine, offline: !props.debugData.systemInfo.onLine }">
                  {{ props.debugData.systemInfo.onLine ? 'Yes' : 'No' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">Screen:</span>
                <span class="info-value">{{ props.debugData.systemInfo.screenResolution }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Viewport:</span>
                <span class="info-value">{{ props.debugData.systemInfo.viewportSize }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Pixel Ratio:</span>
                <span class="info-value">{{ props.debugData.systemInfo.devicePixelRatio }}</span>
              </div>
              <div class="info-item">
                <span class="info-label">WebMIDI:</span>
                <span class="info-value" :class="{ supported: props.debugData.systemInfo.webMidiSupported, unsupported: !props.debugData.systemInfo.webMidiSupported }">
                  {{ props.debugData.systemInfo.webMidiSupported ? 'Supported' : 'Not Supported' }}
                </span>
              </div>
              <div class="info-item">
                <span class="info-label">MIDI Connected:</span>
                <span class="info-value" :class="{ connected: midiConnected, disconnected: !midiConnected }">
                  {{ midiConnected ? 'Yes' : 'No' }}
                </span>
              </div>
            </div>
            <div class="user-agent">
              <span class="info-label">User Agent:</span>
              <div class="info-value">{{ props.debugData.systemInfo.userAgent }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.debug-drawer {
  position: fixed;
  bottom: 20px;
  right: 20px;
  z-index: 1000;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
}

.debug-toggle {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(10px);
}

.debug-toggle:hover {
  background: rgba(0, 0, 0, 0.9);
  transform: scale(1.1);
}

.debug-toggle.has-errors {
  background: rgba(244, 67, 54, 0.9);
  animation: pulse-error 2s infinite;
}

.debug-toggle.has-warnings {
  background: rgba(255, 152, 0, 0.9);
  animation: pulse-warning 2s infinite;
}

.debug-toggle.has-logs {
  background: rgba(74, 144, 226, 0.9);
}

.debug-icon {
  width: 24px;
  height: 24px;
}

.debug-badge {
  position: absolute;
  top: -4px;
  right: -4px;
  background: #f44336;
  color: white;
  border-radius: 10px;
  padding: 2px 6px;
  font-size: 10px;
  font-weight: bold;
  min-width: 16px;
  text-align: center;
}

.debug-panel {
  position: absolute;
  bottom: 60px;
  right: 0;
  width: 400px;
  max-width: 90vw;
  max-height: 60vh;
  background: rgba(0, 0, 0, 0.95);
  border: 1px solid #333;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debug-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid #333;
}

.debug-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: #4a90e2;
}

.debug-controls {
  display: flex;
  gap: 8px;
}

.clear-button, .close-button, .refresh-button {
  padding: 4px 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.clear-button:hover, .refresh-button:hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

.close-button {
  width: 24px;
  height: 24px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  line-height: 1;
}

.close-button:hover {
  background: #f44336;
  border-color: #f44336;
  color: #fff;
}

.debug-tabs {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid #333;
}

.debug-tab {
  flex: 1;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: #999;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.debug-tab:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #ccc;
}

.debug-tab.active {
  background: rgba(74, 144, 226, 0.2);
  color: #4a90e2;
  border-bottom: 2px solid #4a90e2;
}

.tab-badge {
  background: #f44336;
  color: white;
  border-radius: 8px;
  padding: 1px 4px;
  font-size: 9px;
  min-width: 12px;
  text-align: center;
}

.debug-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tab-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.03);
  border-bottom: 1px solid #333;
}

.panel-header h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: #ccc;
}

.clear-button.small, .refresh-button.small {
  padding: 2px 6px;
  font-size: 10px;
}

.log-container {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.log-entry {
  margin-bottom: 8px;
  padding: 8px;
  border-radius: 4px;
  border-left: 3px solid #333;
  background: rgba(255, 255, 255, 0.02);
}

.log-entry.log-error {
  border-left-color: #f44336;
  background: rgba(244, 67, 54, 0.1);
}

.log-entry.log-warning {
  border-left-color: #ff9800;
  background: rgba(255, 152, 0, 0.1);
}

.log-entry.log-info {
  border-left-color: #2196f3;
  background: rgba(33, 150, 243, 0.1);
}

.log-entry.midi-in {
  border-left-color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.log-entry.midi-out {
  border-left-color: #9c27b0;
  background: rgba(156, 39, 176, 0.1);
}

.log-entry.midi-pc {
  border-left-color: #ff9800;
  background: rgba(255, 152, 0, 0.1);
}

.log-header {
  display: flex;
  gap: 8px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.log-timestamp {
  color: #666;
  font-size: 10px;
}

.log-type, .log-direction, .log-channel, .log-source {
  padding: 1px 4px;
  border-radius: 2px;
  font-size: 9px;
  font-weight: bold;
  text-transform: uppercase;
}

.log-type {
  background: #333;
  color: #ccc;
}

.log-direction {
  background: #4caf50;
  color: white;
}

.log-channel {
  background: #2196f3;
  color: white;
}

.log-source {
  background: #666;
  color: white;
}

.log-message {
  color: #ccc;
  font-size: 11px;
  line-height: 1.4;
  word-break: break-word;
}

.log-stack, .log-data {
  margin-top: 4px;
  padding: 4px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 2px;
  font-size: 10px;
  color: #999;
  white-space: pre-wrap;
  word-break: break-all;
}

.log-data pre {
  margin: 0;
  font-family: inherit;
}

.no-logs {
  text-align: center;
  color: #666;
  font-style: italic;
  padding: 20px;
}

.system-info {
  padding: 16px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-bottom: 16px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-label {
  font-size: 10px;
  color: #666;
  text-transform: uppercase;
  font-weight: 600;
}

.info-value {
  font-size: 11px;
  color: #ccc;
  word-break: break-word;
}

.info-value.online {
  color: #4caf50;
}

.info-value.offline {
  color: #f44336;
}

.info-value.supported {
  color: #4caf50;
}

.info-value.unsupported {
  color: #f44336;
}

.info-value.connected {
  color: #4caf50;
}

.info-value.disconnected {
  color: #f44336;
}

.user-agent {
  margin-top: 16px;
}

.user-agent .info-label {
  margin-bottom: 4px;
}

.user-agent .info-value {
  font-size: 10px;
  line-height: 1.3;
  max-height: 60px;
  overflow-y: auto;
  padding: 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
}

/* Animations */
@keyframes pulse-error {
  0%, 100% { box-shadow: 0 0 0 0 rgba(244, 67, 54, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(244, 67, 54, 0); }
}

@keyframes pulse-warning {
  0%, 100% { box-shadow: 0 0 0 0 rgba(255, 152, 0, 0.7); }
  50% { box-shadow: 0 0 0 10px rgba(255, 152, 0, 0); }
}

/* Mobile optimizations */
@media (max-width: 768px) {
  .debug-drawer {
    bottom: 10px;
    right: 10px;
  }
  
  .debug-panel {
    width: calc(100vw - 20px);
    max-width: none;
    max-height: 70vh;
    right: -10px;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .debug-tabs {
    flex-direction: row;
  }
  
  .debug-tab {
    padding: 8px 6px;
    font-size: 10px;
  }
}

@media (max-width: 480px) {
  .debug-toggle {
    width: 44px;
    height: 44px;
  }
  
  .debug-icon {
    width: 20px;
    height: 20px;
  }
  
  .debug-panel {
    max-height: 80vh;
  }
  
  .debug-tabs {
    flex-direction: row;
  }
  
  .debug-tab {
    padding: 6px 4px;
    font-size: 9px;
  }
  
  .tab-badge {
    font-size: 8px;
    padding: 1px 3px;
  }
  
  .log-header {
    flex-direction: column;
    gap: 2px;
  }
  
  .log-timestamp {
    font-size: 9px;
  }
  
  .log-message {
    font-size: 10px;
  }
}

/* Touch-friendly interactions */
@media (hover: none) and (pointer: coarse) {
  .debug-toggle {
    width: 52px;
    height: 52px;
  }
  
  .debug-icon {
    width: 26px;
    height: 26px;
  }
  
  .clear-button, .close-button, .refresh-button {
    padding: 8px 12px;
    font-size: 12px;
  }
  
  .debug-tab {
    padding: 12px 16px;
    font-size: 12px;
  }
}
</style>
