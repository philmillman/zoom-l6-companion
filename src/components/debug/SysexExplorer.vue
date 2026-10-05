<script lang="ts">
import { ref } from 'vue';

/**
 * Module-scope (not component-scope) so the "Open" reservation on the shared editor session
 * survives the Debug drawer's `v-if` unmount/remount — otherwise closing and reopening the
 * drawer would leak a `useDeviceSettings().acquire()` reservation. `sessionHeld` is the reactive
 * flag the template reads; `releaseSession` is the plain closure it calls.
 */
let releaseSession: (() => void) | null = null;
const sessionHeld = ref(false);
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, watch } from 'vue';
import { sysexExplorerStore, type SweepRow } from '../../stores/sysexExplorerStore';
import { editorSession } from '../../services/editorSessionService';
import { useDeviceSettings } from '../../composables/useDeviceSettings';
import { bytesToHex, hexToBytes, findParamByAddress } from '../../midi/sysex';
import { snapshotLayoutFor } from '../../midi/sysex/zoomL6/stateSnapshot';
import type { ParamSnapshot } from '../../midi/sysex';

const device = useDeviceSettings();

// ── session status / open / close ─────────────────────────────────────────────
const sessionState = computed(() => editorSession.state.value);
const isOpen = computed(() => sessionState.value === 'open');

const stateLabel: Record<string, string> = {
  closed: 'Closed',
  opening: 'Opening…',
  open: 'Open',
  stale: 'Stale',
  error: 'Error',
};

const statePillClass = computed(() => {
  switch (sessionState.value) {
    case 'open':
      return 'pill-ok';
    case 'opening':
    case 'stale':
      return 'pill-warn';
    case 'error':
      return 'pill-error';
    default:
      return 'pill-neutral';
  }
});

/** Why the session can't be opened right now, or `null` if it can. Mirrors the link-readiness
 * checks in `useDeviceSettings` (not exported from there, so restated here for the explorer). */
const blockedReason = computed<string | null>(() => {
  if (!device.linkEnabled.value) return 'Editor link (SysEx) is turned off in Advanced Settings.';
  switch (device.link.value) {
    case 'no-sysex':
      return 'System Exclusive is not enabled. Reload the app and allow SysEx when prompted.';
    case 'no-editor-port':
      return 'No Zoom “Editor” MIDI port found. Connect the mixer over USB.';
    case 'suspended':
      return 'The editor link is suspended (e.g. USB mass storage in progress).';
    default:
      return null;
  }
});

const opening = ref(false);
const openError = ref<string | null>(null);

async function openSession(): Promise<void> {
  if (releaseSession || opening.value) return;
  // Respect the same link-readiness gate the composable uses. Opening while the link is
  // suspended (mass storage in progress) would race the file-transfer handshake on the wire.
  if (blockedReason.value) {
    openError.value = blockedReason.value;
    return;
  }
  openError.value = null;
  opening.value = true;
  releaseSession = device.acquire();
  sessionHeld.value = true;
  try {
    await editorSession.open();
  } catch (e) {
    openError.value = e instanceof Error ? e.message : String(e);
    // Release so "Open" is clickable again immediately, instead of forcing an explicit Close first.
    closeSession();
  } finally {
    opening.value = false;
  }
}

function closeSession(): void {
  releaseSession?.();
  releaseSession = null;
  sessionHeld.value = false;
}

// If the session is torn down elsewhere (MIDI disconnect, mass-storage suspend both call
// deviceSettings.close(), which bypasses the ref count), drop our stale reservation so the
// "Open" button becomes usable again instead of pointing at a dead session.
watch(sessionState, (state) => {
  if (sessionHeld.value && (state === 'closed' || state === 'error') && !opening.value) {
    closeSession();
  }
});

// ── snapshot re-read / layout ──────────────────────────────────────────────────
/** Live session's snapshot (editor-open reply payload); `payload[0]` is the layout byte. */
const livePayload = computed(() => editorSession.info.value?.editorState.payload ?? null);

const layoutLabel = computed<string | null>(() => {
  const payload = livePayload.value;
  if (!payload || payload.length === 0) return null;
  const id = snapshotLayoutFor(payload)?.id;
  const name = id === undefined ? 'unknown' : id;
  const pretty = name.toLowerCase() === 'l6max' ? 'L6max' : name.toLowerCase() === 'l6' ? 'L6' : name;
  return `Layout ${pretty} (0x${payload[0]!.toString(16).padStart(2, '0')}), ${payload.length} bytes`;
});

const rereadConfirmed = ref(false);
let rereadConfirmTimer: ReturnType<typeof setTimeout> | null = null;

async function rereadSnapshot(): Promise<void> {
  rereadConfirmed.value = false;
  await sysexExplorerStore.refreshSnapshot();
  if (sysexExplorerStore.reread.error) return;
  rereadConfirmed.value = true;
  if (rereadConfirmTimer) clearTimeout(rereadConfirmTimer);
  rereadConfirmTimer = setTimeout(() => {
    rereadConfirmed.value = false;
  }, 2500);
}

onBeforeUnmount(() => {
  if (rereadConfirmTimer) clearTimeout(rereadConfirmTimer);
});

// ── raw hex send ───────────────────────────────────────────────────────────────
const rawHexError = ref<string | null>(null);

function sendRawHex(): void {
  rawHexError.value = null;
  try {
    const bytes = hexToBytes(sysexExplorerStore.rawHex);
    if (bytes.length < 2 || bytes[0] !== 0xf0 || bytes[bytes.length - 1] !== 0xf7) {
      throw new Error('Message must start with F0 and end with F7.');
    }
    editorSession.sendRaw(bytes);
  } catch (e) {
    rawHexError.value = e instanceof Error ? e.message : String(e);
  }
}

// ── sweep results ────────────────────────────────────────────────────────────
const copiedKey = ref<string | null>(null);

async function copyRegistryEntry(row: SweepRow): Promise<void> {
  const text = sysexExplorerStore.registryEntryFor(row);
  const key = `${row.group}:${row.index}`;
  try {
    await navigator.clipboard.writeText(text);
    copiedKey.value = key;
    setTimeout(() => {
      if (copiedKey.value === key) copiedKey.value = null;
    }, 1500);
  } catch {
    // Clipboard API unavailable/denied: nothing more we can do from here.
  }
}

function sweepRowHex(row: SweepRow): string {
  return row.values ? bytesToHex(row.values) : '—';
}

// ── set ───────────────────────────────────────────────────────────────────────
const setConfirmed = ref(false);

const setAddressKnown = computed(() =>
  findParamByAddress({
    scheme: 'param',
    group: sysexExplorerStore.setForm.group,
    index: sysexExplorerStore.setForm.index,
  }),
);

function runSetParam(): void {
  void sysexExplorerStore.setParam(setConfirmed.value);
}

// ── snapshots & diff ────────────────────────────────────────────────────────────
const snapshotLabel = ref('');

function takeSnapshot(): void {
  sysexExplorerStore.takeSnapshot(snapshotLabel.value);
  snapshotLabel.value = '';
}

const diffA = ref('');
const diffB = ref('');

function runDiff(): void {
  if (!diffA.value || !diffB.value) return;
  sysexExplorerStore.runDiff(diffA.value, diffB.value);
}

function snapshotLabelFor(id: string): string {
  const s = sysexExplorerStore.snapshots.find((snap: ParamSnapshot) => snap.id === id);
  return s ? s.label : id;
}

function bytesOrDash(bytes: number[] | null): string {
  return bytes ? bytesToHex(bytes) : '—';
}

// ── export / import ───────────────────────────────────────────────────────────
function exportJson(): void {
  const json = sysexExplorerStore.exportJson();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sysex-explorer-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const importError = ref<string | null>(null);

async function onImportFile(event: Event): Promise<void> {
  importError.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    sysexExplorerStore.importJson(text);
  } catch (e) {
    importError.value = e instanceof Error ? e.message : String(e);
  } finally {
    input.value = '';
  }
}

// ── message log ────────────────────────────────────────────────────────────────
const visibleMessageLog = computed(() => sysexExplorerStore.messageLog.slice(0, 50));

function formatLogTime(at: number): string {
  return new Date(at).toLocaleTimeString('en-US', { hour12: false });
}
</script>

<template>
  <div class="sysex-explorer">
    <div class="notice notice-warn">
      Quit ZOOM L6 Editor before opening a session (MIDI Monitor spying is fine).
    </div>

    <!-- Session status -->
    <section class="sysex-section">
      <div class="section-row session-row">
        <span class="pill" :class="statePillClass">{{ stateLabel[sessionState] ?? sessionState }}</span>
        <span class="info-piece" v-if="device.firmware.value">FW {{ device.firmware.value }}</span>
        <span class="info-piece">HB misses: {{ device.heartbeatMisses.value }}</span>
        <span class="info-piece" v-if="isOpen && layoutLabel">{{ layoutLabel }}</span>
        <div class="spacer" />
        <button class="btn" :disabled="sessionHeld || opening" @click="openSession">
          {{ opening ? 'Opening…' : 'Open' }}
        </button>
        <button class="btn" :disabled="!sessionHeld" @click="closeSession">
          Close
        </button>
        <button class="btn" :disabled="!isOpen || sysexExplorerStore.reread.busy" @click="rereadSnapshot">
          {{ sysexExplorerStore.reread.busy ? 'Re-reading…' : 'Re-read snapshot' }}
        </button>
      </div>
      <div class="hint hint-ok" v-if="rereadConfirmed">Snapshot re-read<template v-if="layoutLabel"> — {{ layoutLabel }}</template></div>
      <div class="hint hint-error" v-if="sysexExplorerStore.reread.error">{{ sysexExplorerStore.reread.error }}</div>
      <div class="hint hint-warn" v-if="blockedReason && !isOpen">{{ blockedReason }}</div>
      <div class="hint hint-error" v-if="openError">{{ openError }}</div>
      <div class="hint hint-error" v-if="device.lastError.value">{{ device.lastError.value }}</div>
    </section>

    <!-- Raw hex send -->
    <section class="sysex-section">
      <h4>Raw SysEx</h4>
      <textarea
        v-model="sysexExplorerStore.rawHex"
        class="mono-input textarea"
        rows="2"
        placeholder="F0 52 00 00 46 00 00 F7"
        :disabled="!isOpen"
      />
      <div class="section-row">
        <button class="btn" :disabled="!isOpen" @click="sendRawHex">Send</button>
        <span class="hint hint-error" v-if="rawHexError">{{ rawHexError }}</span>
      </div>
    </section>

    <!-- Get single -->
    <section class="sysex-section">
      <h4>Get param</h4>
      <div class="section-row wrap">
        <label class="field">
          Group
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.single.group" :disabled="!isOpen" />
        </label>
        <label class="field">
          Index
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.single.index" :disabled="!isOpen" />
        </label>
        <button class="btn" :disabled="!isOpen || sysexExplorerStore.single.busy" @click="sysexExplorerStore.getSingle()">
          {{ sysexExplorerStore.single.busy ? 'Reading…' : 'Get' }}
        </button>
      </div>
      <div class="mono-output" v-if="sysexExplorerStore.single.result">
        {{ bytesToHex(sysexExplorerStore.single.result) }}
      </div>
      <div class="hint hint-error" v-if="sysexExplorerStore.single.error">{{ sysexExplorerStore.single.error }}</div>
    </section>

    <!-- Sweep -->
    <section class="sysex-section">
      <h4>Sweep (GET only)</h4>
      <div class="section-row wrap">
        <label class="field">
          Group from
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.sweep.groupFrom" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          Group to
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.sweep.groupTo" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          Index from
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.sweep.indexFrom" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          Index to
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.sweep.indexTo" :disabled="sysexExplorerStore.sweep.running" />
        </label>
      </div>
      <div class="section-row wrap">
        <label class="field">
          Interval (ms)
          <input type="number" min="0" v-model.number="sysexExplorerStore.sweep.intervalMs" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <label class="field">
          Timeout (ms)
          <input type="number" min="1" v-model.number="sysexExplorerStore.sweep.timeoutMs" :disabled="sysexExplorerStore.sweep.running" />
        </label>
        <button class="btn" :disabled="!isOpen || sysexExplorerStore.sweep.running" @click="sysexExplorerStore.runSweep()">Run</button>
        <button class="btn btn-danger" :disabled="!sysexExplorerStore.sweep.running" @click="sysexExplorerStore.abortSweep()">Abort</button>
      </div>
      <div class="hint hint-warn" v-if="sysexExplorerStore.sweep.needsConfirm">
        That range is a large number of requests. <button class="link-btn" @click="sysexExplorerStore.runSweep(true)">Confirm &amp; run anyway</button>
      </div>
      <div class="hint hint-error" v-if="sysexExplorerStore.sweep.error">{{ sysexExplorerStore.sweep.error }}</div>
      <div class="hint" v-if="sysexExplorerStore.sweep.running || sysexExplorerStore.sweep.progress.total > 0">
        {{ sysexExplorerStore.sweep.progress.done }} / {{ sysexExplorerStore.sweep.progress.total }}
      </div>
      <div class="table-scroll" v-if="sysexExplorerStore.sweep.rows.length > 0">
        <table class="mono-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Index</th>
              <th>Width</th>
              <th>Values</th>
              <th>Latency</th>
              <th>Registry</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in sysexExplorerStore.sweep.rows" :key="`${row.group}:${row.index}`" :class="`row-${row.status}`">
              <td>{{ row.group }}</td>
              <td>{{ row.index }}</td>
              <td>{{ row.values ? row.values.length : '—' }}</td>
              <td class="mono">{{ row.status === 'ok' ? sweepRowHex(row) : row.status }}</td>
              <td>{{ row.latencyMs }} ms</td>
              <td>{{ row.registryId ?? '—' }}</td>
              <td>
                <button class="link-btn" v-if="row.values" @click="copyRegistryEntry(row)">
                  {{ copiedKey === `${row.group}:${row.index}` ? 'Copied' : 'Copy as registry entry' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Set -->
    <section class="sysex-section">
      <h4>Set param</h4>
      <div class="section-row wrap">
        <label class="field">
          Group
          <input type="number" min="0" :max="0x7e" v-model.number="sysexExplorerStore.setForm.group" :disabled="!isOpen" />
        </label>
        <label class="field">
          Index
          <input type="number" min="0" max="127" v-model.number="sysexExplorerStore.setForm.index" :disabled="!isOpen" />
        </label>
        <label class="field field-grow">
          Values (hex)
          <input type="text" class="mono-input" v-model="sysexExplorerStore.setForm.valuesHex" placeholder="00 01" :disabled="!isOpen" />
        </label>
      </div>
      <label class="checkbox-row" v-if="!setAddressKnown">
        <input type="checkbox" v-model="setConfirmed" />
        I understand this address is not in the registry
      </label>
      <div class="section-row">
        <button class="btn btn-danger" :disabled="!isOpen || (!setAddressKnown && !setConfirmed)" @click="runSetParam">Set</button>
      </div>
      <div class="hint" v-if="sysexExplorerStore.setForm.result">{{ sysexExplorerStore.setForm.result }}</div>
    </section>

    <!-- Snapshots & diff -->
    <section class="sysex-section">
      <h4>Snapshots</h4>
      <details class="workflow-hint">
        <summary>How to find a setting's byte</summary>
        <p>
          To find a setting's byte: Take snapshot → change one setting in Device Settings or Sound Pads →
          Re-read snapshot → Take snapshot → Diff.
        </p>
      </details>
      <div class="section-row wrap">
        <input type="text" class="mono-input field-grow" v-model="snapshotLabel" placeholder="Label" />
        <button class="btn" @click="takeSnapshot">Take snapshot</button>
      </div>
      <ul class="snapshot-list" v-if="sysexExplorerStore.snapshots.length > 0">
        <li v-for="snap in sysexExplorerStore.snapshots" :key="snap.id">
          {{ snap.label }} — {{ Object.keys(snap.params).length }} params — {{ new Date(snap.takenAt).toLocaleTimeString() }}
        </li>
      </ul>
      <div class="section-row wrap" v-if="sysexExplorerStore.snapshots.length > 1">
        <label class="field field-grow">
          A
          <select v-model="diffA">
            <option value="" disabled>Choose…</option>
            <option v-for="snap in sysexExplorerStore.snapshots" :key="snap.id" :value="snap.id">{{ snap.label }}</option>
          </select>
        </label>
        <label class="field field-grow">
          B
          <select v-model="diffB">
            <option value="" disabled>Choose…</option>
            <option v-for="snap in sysexExplorerStore.snapshots" :key="snap.id" :value="snap.id">{{ snap.label }}</option>
          </select>
        </label>
        <button class="btn" :disabled="!diffA || !diffB" @click="runDiff">Diff</button>
      </div>
      <div v-if="sysexExplorerStore.diff">
        <p class="hint">
          {{ snapshotLabelFor(sysexExplorerStore.diff.aId) }} → {{ snapshotLabelFor(sysexExplorerStore.diff.bId) }}
          — layout {{ sysexExplorerStore.diff.layoutId }}
        </p>
        <div class="table-scroll" v-if="sysexExplorerStore.diff.result.params.length > 0">
          <table class="mono-table">
            <thead>
              <tr><th>group:index</th><th>Before</th><th>After</th></tr>
            </thead>
            <tbody>
              <tr v-for="entry in sysexExplorerStore.diff.result.params" :key="entry.key">
                <td>{{ entry.key }}</td>
                <td class="mono">{{ bytesOrDash(entry.before) }}</td>
                <td class="mono">{{ bytesOrDash(entry.after) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="table-scroll" v-if="sysexExplorerStore.diff.result.payload.length > 0">
          <table class="mono-table">
            <thead>
              <tr><th>Payload offset</th><th>Field</th><th>Before</th><th>After</th></tr>
            </thead>
            <tbody>
              <tr v-for="entry in sysexExplorerStore.diff.payload" :key="entry.offset">
                <td>{{ entry.offset }}</td>
                <td :class="{ 'field-unknown': entry.kind === 'unknown' }">
                  {{ entry.field }}
                  <span class="tag-unverified" v-if="entry.verified === false">unverified</span>
                </td>
                <td class="mono">{{ entry.before ?? '—' }}</td>
                <td class="mono">{{ entry.after ?? '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="hint" v-if="sysexExplorerStore.diff.result.params.length === 0 && sysexExplorerStore.diff.result.payload.length === 0">
          No differences.
        </div>
      </div>
    </section>

    <!-- Export / import -->
    <section class="sysex-section">
      <h4>Export / import</h4>
      <div class="section-row wrap">
        <button class="btn" @click="exportJson">Export JSON</button>
        <input type="file" accept="application/json" @change="onImportFile" />
      </div>
      <div class="hint hint-error" v-if="importError">{{ importError }}</div>
    </section>

    <!-- Notes -->
    <section class="sysex-section">
      <h4>Notes</h4>
      <textarea v-model="sysexExplorerStore.notes" class="textarea" rows="3" placeholder="Reverse-engineering notes…" />
    </section>

    <!-- Inbound message log -->
    <section class="sysex-section">
      <h4>Inbound messages</h4>
      <div class="log-container">
        <div v-for="(entry, i) in visibleMessageLog" :key="i" class="log-entry">
          <span class="log-timestamp">{{ formatLogTime(entry.at) }}</span>
          <span class="log-message">{{ entry.description }}</span>
          <span class="log-hex">{{ entry.hex }}</span>
        </div>
        <div v-if="visibleMessageLog.length === 0" class="no-logs">No inbound messages yet</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sysex-explorer {
  padding: 12px;
  overflow-y: auto;
  color: #ccc;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 11px;
}

.notice {
  padding: 8px 10px;
  border-radius: 4px;
  margin-bottom: 12px;
  font-size: 11px;
  line-height: 1.4;
}

.notice-warn {
  background: rgba(255, 152, 0, 0.12);
  border: 1px solid rgba(255, 152, 0, 0.35);
  color: #ffcc80;
}

.sysex-section {
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #2a2a2a;
}

.sysex-section:last-child {
  border-bottom: none;
}

.sysex-section h4 {
  margin: 0 0 8px 0;
  font-size: 11px;
  font-weight: 600;
  color: #4a90e2;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.section-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.section-row.wrap {
  flex-wrap: wrap;
}

.session-row {
  flex-wrap: wrap;
}

.spacer {
  flex: 1 1 auto;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  color: #999;
}

.field-grow {
  flex: 1 1 120px;
}

.field input,
.field select {
  min-width: 0;
}

input[type='number'],
input[type='text'],
select {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #444;
  border-radius: 4px;
  color: #eee;
  padding: 4px 6px;
  font-size: 11px;
  font-family: inherit;
  width: 100%;
  box-sizing: border-box;
}

input[type='number'] {
  width: 64px;
}

.mono-input {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.textarea {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid #444;
  border-radius: 4px;
  color: #eee;
  padding: 6px 8px;
  font-size: 11px;
  resize: vertical;
}

.mono-output {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 4px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  word-break: break-all;
}

.checkbox-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  color: #ffcc80;
}

.btn {
  padding: 5px 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  background: rgba(74, 144, 226, 0.15);
  color: #cfe0f7;
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}

.btn:hover:not(:disabled) {
  background: rgba(74, 144, 226, 0.3);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-danger {
  background: rgba(244, 67, 54, 0.15);
  color: #ffcdd2;
}

.btn-danger:hover:not(:disabled) {
  background: rgba(244, 67, 54, 0.3);
}

.link-btn {
  background: none;
  border: none;
  color: #4a90e2;
  cursor: pointer;
  font-size: 10px;
  padding: 0;
  text-decoration: underline;
}

.pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
}

.pill-ok {
  background: rgba(76, 175, 80, 0.2);
  color: #4caf50;
}

.pill-warn {
  background: rgba(255, 152, 0, 0.2);
  color: #ff9800;
}

.pill-error {
  background: rgba(244, 67, 54, 0.2);
  color: #f44336;
}

.pill-neutral {
  background: rgba(255, 255, 255, 0.1);
  color: #999;
}

.info-piece {
  font-size: 10px;
  color: #999;
}

.hint {
  font-size: 10px;
  color: #888;
  margin-top: 2px;
}

.hint-warn {
  color: #ff9800;
}

.hint-error {
  color: #f44336;
}

.hint-ok {
  color: #4caf50;
}

.workflow-hint {
  margin-bottom: 8px;
  font-size: 10px;
  color: #999;
}

.workflow-hint summary {
  cursor: pointer;
  color: #4a90e2;
}

.workflow-hint p {
  margin: 4px 0 0 0;
  line-height: 1.4;
}

.field-unknown {
  color: #ff9800;
  font-weight: 600;
}

.tag-unverified {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 8px;
  font-size: 9px;
  color: #ff9800;
  background: rgba(255, 152, 0, 0.15);
}

.table-scroll {
  overflow-x: auto;
  margin-top: 6px;
}

.mono-table {
  border-collapse: collapse;
  width: 100%;
  font-size: 10px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.mono-table th,
.mono-table td {
  padding: 3px 6px;
  border-bottom: 1px solid #2a2a2a;
  text-align: left;
  white-space: nowrap;
}

.mono-table th {
  color: #999;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 9px;
}

.row-timeout td {
  color: #ff9800;
}

.row-error td {
  color: #f44336;
}

.mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
}

.snapshot-list {
  list-style: none;
  margin: 4px 0;
  padding: 0;
  font-size: 10px;
  color: #ccc;
}

.snapshot-list li {
  padding: 3px 0;
  border-bottom: 1px solid #2a2a2a;
}

.log-container {
  max-height: 200px;
  overflow-y: auto;
}

.log-entry {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid #2a2a2a;
  font-size: 10px;
}

.log-timestamp {
  color: #666;
  flex: 0 0 auto;
}

.log-message {
  color: #ccc;
}

.log-hex {
  color: #4caf50;
  word-break: break-all;
  flex-basis: 100%;
}

.no-logs {
  text-align: center;
  color: #666;
  font-style: italic;
  padding: 12px;
  font-size: 10px;
}

/* Mobile: stack fields, keep tables scrollable rather than overflowing the page. */
@media (max-width: 480px) {
  .field {
    flex: 1 1 45%;
  }

  input[type='number'] {
    width: 100%;
  }
}
</style>
