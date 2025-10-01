<template>
  <div class="sound-pads">
    <div class="pads-header">
      <h2 class="pads-title">Sound Pads</h2>
    </div>
    <div class="pads-grid">
      <button
        v-for="pad in pads"
        :key="pad.id"
        class="pad-button"
        @mousedown="noteOn(pad)"
        @mouseup="noteOff(pad)"
        @touchstart.prevent="noteOn(pad)"
        @touchend.prevent="noteOff(pad)"
      >
        <div class="pad-id">{{ pad.id }}</div>
        <div class="pad-note">MIDI {{ noteLabel(pad.note) }}</div>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { soundPads } from '../config/midiConfig';
import { midiService } from '../services/midiService';

const pads = computed(() => soundPads);

function noteOn(pad: { note: number; channel: number }) {
  midiService.sendNoteOn(pad.note, pad.channel, 100);
}

function noteOff(pad: { note: number; channel: number }) {
  midiService.sendNoteOff(pad.note, pad.channel, 0);
}

function noteLabel(note: number) {
  // Simple C-based note naming around middle C (60)
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  const name = names[note % 12];
  return `${name}${octave} (${note})`;
}
</script>

<style scoped>
.sound-pads {
  background: #1e1e1e;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 16px;
  margin: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.pads-header {
  text-align: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
}

.pads-title {
  color: #4a90e2;
  font-size: 18px;
  font-weight: bold;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.pads-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 16px;
}

.pad-button {
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 8px;
  height: 120px;
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 12px;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pad-button:hover {
  border-color: #4a90e2;
  transform: translateY(-2px);
}

.pad-button:active {
  background: #4a90e2;
  border-color: #4a90e2;
}

.pad-id {
  font-size: 22px;
}

.pad-note {
  font-size: 12px;
  color: #9bbcf3;
}
</style>
