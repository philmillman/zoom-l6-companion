/**
 * Turns parsed MIDI Monitor captures (`midiMonitorParser.ts`) into a plain-text report for
 * reverse-engineering the protocol, and diffs two captures against each other. Pure functions,
 * no I/O — `scripts/decode-capture.ts` is the CLI wrapper.
 */
import { decode7bitLE } from '../codec';
import { bytesToHex } from '../hex';
import { describeZoomL6, parseZoomL6, type ParsedZoomL6Message } from '../parse';
import { snapshotKey } from '../snapshot';
import type { CaptureEvent } from './midiMonitorParser';

export interface DecodedEvent extends CaptureEvent {
  message: ParsedZoomL6Message;
}

/** Parses every captured SysEx event's bytes into a `ParsedZoomL6Message`. */
export function decodeCapture(events: readonly CaptureEvent[]): DecodedEvent[] {
  return events.map((e) => ({ ...e, message: parseZoomL6(e.bytes) }));
}

export interface BuildReportOptions {
  /** Fold heartbeat/heartbeatAck events out of the timeline, keeping a collapsed count. Default true. */
  collapseHeartbeats?: boolean;
}

function isHeartbeatKind(kind: string): boolean {
  return kind === 'heartbeat' || kind === 'heartbeatAck';
}

function sortAddressKeys(keys: Iterable<string>): string[] {
  return [...keys].sort((a, b) => {
    const [ag, ai] = a.split(':').map(Number);
    const [bg, bi] = b.split(':').map(Number);
    return (ag! - bg!) || (ai! - bi!);
  });
}

/**
 * Builds a plain-text report: summary counts by kind x direction, a timeline, a param table
 * (`group:index`), the editor-open-state dump, unknown Zoom commands, and a "candidates" section
 * of addresses whose device-reported value changed within the capture.
 */
export function buildReport(decoded: readonly DecodedEvent[], opts: BuildReportOptions = {}): string {
  const collapse = opts.collapseHeartbeats !== false;
  const sections: string[] = [];

  // --- Summary: counts by kind x direction ---
  const summary = new Map<string, number>();
  for (const e of decoded) {
    const key = `${e.message.kind}|${e.dir}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  const summaryLines = [...summary.keys()].sort().map((key) => {
    const [kind, dir] = key.split('|');
    return `${kind} [${dir}]: ${summary.get(key)}`;
  });
  sections.push(['=== Summary (kind x direction) ===', ...summaryLines].join('\n'));

  // --- Timeline ---
  const timelineLines: string[] = [];
  let collapsedCount = 0;
  for (const e of decoded) {
    if (collapse && isHeartbeatKind(e.message.kind)) {
      collapsedCount++;
      continue;
    }
    timelineLines.push(`${e.line} ${e.time} ${e.dir} ${bytesToHex(e.bytes)} — ${describeZoomL6(e.message)}`);
  }
  if (collapse) {
    timelineLines.push(`(${collapsedCount} heartbeat/heartbeatAck event(s) collapsed)`);
  }
  sections.push(['=== Timeline ===', ...timelineLines].join('\n'));

  // --- Param table (group:index): every getParam / paramValue in order ---
  const paramEvents = new Map<string, DecodedEvent[]>();
  for (const e of decoded) {
    const m = e.message;
    if (m.kind !== 'getParam' && m.kind !== 'paramValue') continue;
    const key = snapshotKey(m.group, m.index);
    const arr = paramEvents.get(key) ?? [];
    arr.push(e);
    paramEvents.set(key, arr);
  }
  const paramKeys = sortAddressKeys(paramEvents.keys());
  const paramLines: string[] = [];
  for (const key of paramKeys) {
    paramLines.push(`-- ${key} --`);
    for (const e of paramEvents.get(key)!) {
      const m = e.message;
      if (m.kind === 'getParam') {
        paramLines.push(`  ${e.line} ${e.time} ${e.dir} GET`);
      } else if (m.kind === 'paramValue') {
        const label =
          e.dir === 'host→device' ? 'SET (host write)' : e.dir === 'device→host' ? 'REPLY (device)' : 'VALUE';
        paramLines.push(
          `  ${e.line} ${e.time} ${e.dir} ${label} values=[${bytesToHex(m.values)}] decode7bitLE=${decode7bitLE(m.values)}`,
        );
      }
    }
  }
  sections.push(['=== Param table (group:index) ===', ...paramLines].join('\n'));

  // --- editorOpenState dump ---
  const stateLines: string[] = [];
  for (const e of decoded) {
    const m = e.message;
    if (m.kind !== 'editorOpenState') continue;
    stateLines.push(
      `${e.line} ${e.time} subtype=${m.subtype} flags=[${bytesToHex(m.flags)}] supportedIds=[${bytesToHex(m.supportedIds)}] tail=[${bytesToHex(m.tail)}]`,
    );
  }
  sections.push(['=== Editor open state ===', ...stateLines].join('\n'));

  // --- Unknown Zoom commands ---
  const unknownLines: string[] = [];
  for (const e of decoded) {
    const m = e.message;
    if (m.kind !== 'unknownZoom') continue;
    unknownLines.push(
      `${e.line} ${e.time} ${e.dir} cmd=0x${m.cmd.toString(16).padStart(2, '0')} body=[${bytesToHex(m.body)}]`,
    );
  }
  sections.push(['=== Unknown Zoom commands ===', ...unknownLines].join('\n'));

  // --- Candidates: addresses whose device-reported value differs first vs last ---
  const candidateLines: string[] = [];
  for (const key of paramKeys) {
    const deviceValues = (paramEvents.get(key) ?? [])
      .filter((e): e is DecodedEvent & { message: Extract<ParsedZoomL6Message, { kind: 'paramValue' }> } =>
        e.message.kind === 'paramValue' && e.dir === 'device→host',
      )
      .map((e) => e.message.values);
    if (deviceValues.length < 2) continue;
    const first = deviceValues[0]!;
    const last = deviceValues[deviceValues.length - 1]!;
    if (bytesToHex(first) !== bytesToHex(last)) {
      candidateLines.push(`${key}: first=[${bytesToHex(first)}] last=[${bytesToHex(last)}]`);
    }
  }
  sections.push(['=== Candidates (device value changed within capture) ===', ...candidateLines].join('\n'));

  return sections.join('\n\n');
}

/** Lists `group:index` addresses whose last-known value (either direction) differs between two captures. */
export function diffReports(a: readonly DecodedEvent[], b: readonly DecodedEvent[]): string {
  const lastValues = (decoded: readonly DecodedEvent[]): Map<string, number[]> => {
    const map = new Map<string, number[]>();
    for (const e of decoded) {
      if (e.message.kind === 'paramValue') {
        map.set(snapshotKey(e.message.group, e.message.index), e.message.values);
      }
    }
    return map;
  };
  const av = lastValues(a);
  const bv = lastValues(b);
  const keys = sortAddressKeys(new Set([...av.keys(), ...bv.keys()]));

  const lines: string[] = ['=== Diff (last known value per capture) ==='];
  for (const key of keys) {
    const beforeArr = av.get(key);
    const afterArr = bv.get(key);
    const beforeHex = beforeArr ? bytesToHex(beforeArr) : '(none)';
    const afterHex = afterArr ? bytesToHex(afterArr) : '(none)';
    if (beforeHex !== afterHex) {
      lines.push(`${key}: ${beforeHex} -> ${afterHex}`);
    }
  }
  return lines.join('\n');
}
