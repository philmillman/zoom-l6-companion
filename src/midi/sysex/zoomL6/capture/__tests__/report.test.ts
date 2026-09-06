import { describe, it, expect } from 'vitest';
import type { CaptureEvent, CaptureDirection } from '../midiMonitorParser';
import { decodeCapture, buildReport, diffReports } from '../report';
import { zoomL6Sysex, buildGetParam, buildSetParam } from '../../messages';

function evt(line: number, dir: CaptureDirection, bytes: number[]): CaptureEvent {
  return { line, time: `t${line}`, port: 'L6 Editor Port', dir, type: 'SysEx', bytes, truncated: false };
}

/** identity req/reply, editor open/reply, 20 heartbeats, get 0:1 -> reply [1,0], host write 0:1 [0,0], reply [0,0]. */
function makeCapture(): CaptureEvent[] {
  const events: CaptureEvent[] = [];
  let line = 1;

  events.push(evt(line++, 'host→device', [0xf0, 0x7e, 0x00, 0x06, 0x01, 0xf7]));
  events.push(
    evt(line++, 'device→host', [
      0xf0, 0x7e, 0x00, 0x06, 0x02, 0x52, 0x72, 0x00, 0x0b, 0x00, 0x31, 0x2e, 0x31, 0x30, 0xf7,
    ]),
  );

  events.push(evt(line++, 'host→device', [...zoomL6Sysex.editorOpen]));
  events.push(evt(line++, 'device→host', [0xf0, 0x52, 0x00, 0x00, 0x2a, 0x03, 0xf7]));

  for (let h = 0; h < 20; h++) {
    events.push(evt(line++, 'host→device', [...zoomL6Sysex.heartbeat]));
    events.push(evt(line++, 'device→host', [0xf0, 0x52, 0x00, 0x00, 0x00, 0x0b, 0xf7]));
  }

  events.push(evt(line++, 'host→device', buildGetParam(0, 1)));
  events.push(evt(line++, 'device→host', buildSetParam(0, 1, [1, 0])));
  events.push(evt(line++, 'host→device', buildSetParam(0, 1, [0, 0])));
  events.push(evt(line++, 'device→host', [0xf0, 0x52, 0x00, 0x00, 0x00, 0x00, 0xf7]));
  events.push(evt(line++, 'device→host', buildSetParam(0, 1, [0, 0])));

  return events;
}

describe('buildReport', () => {
  it('mentions the 0:1 address and collapses heartbeats with a count', () => {
    const decoded = decodeCapture(makeCapture());
    const report = buildReport(decoded);

    expect(report).toContain('0:1');
    expect(report).toContain('(40 heartbeat/heartbeatAck event(s) collapsed)');
    expect(report).not.toContain('— Heartbeat');
  });

  it('shows heartbeat events in the timeline when collapseHeartbeats is false', () => {
    const decoded = decodeCapture(makeCapture());
    const report = buildReport(decoded, { collapseHeartbeats: false });
    expect(report).toContain('— Heartbeat');
    expect(report).not.toContain('collapsed)');
  });

  it('dumps the editor open state and identity firmware', () => {
    const decoded = decodeCapture(makeCapture());
    const report = buildReport(decoded);
    expect(report).toContain('Editor open state');
    expect(report).toMatch(/subtype=3/);
  });
});

describe('diffReports', () => {
  it('lists the changed address between two captures', () => {
    const before = decodeCapture([evt(1, 'device→host', buildSetParam(0, 1, [1, 0]))]);
    const after = decodeCapture([evt(1, 'device→host', buildSetParam(0, 1, [0, 0]))]);
    const diff = diffReports(before, after);
    expect(diff).toContain('0:1');
  });

  it('reports nothing when the last known values match', () => {
    const a = decodeCapture([evt(1, 'device→host', buildSetParam(0, 1, [1, 0]))]);
    const b = decodeCapture([evt(1, 'device→host', buildSetParam(0, 1, [1, 0]))]);
    const diff = diffReports(a, b);
    expect(diff).not.toContain('0:1');
  });
});
