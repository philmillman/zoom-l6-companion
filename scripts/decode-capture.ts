#!/usr/bin/env node
/**
 * CLI wrapper around the pure capture decoder/reporter.
 *
 *   npx tsx scripts/decode-capture.ts <capture.txt> [--diff <other.txt>] [--all-heartbeats]
 *
 * `capture.txt` is text copied from snoize MIDI Monitor (see docs/PROTOCOL.md ▸ How to Contribute Findings).
 */
import { readFileSync } from 'node:fs';
import { parseMidiMonitorText } from '../src/midi/sysex/zoomL6/capture/midiMonitorParser';
import { decodeCapture, buildReport, diffReports } from '../src/midi/sysex/zoomL6/capture/report';

interface Args {
  file: string | null;
  diffFile: string | null;
  allHeartbeats: boolean;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { file: null, diffFile: null, allHeartbeats: false };
  const rest = [...argv];
  while (rest.length > 0) {
    const arg = rest.shift()!;
    if (arg === '--diff') {
      args.diffFile = rest.shift() ?? null;
    } else if (arg === '--all-heartbeats') {
      args.allHeartbeats = true;
    } else if (args.file === null) {
      args.file = arg;
    }
  }
  return args;
}

function decodeFile(path: string) {
  const text = readFileSync(path, 'utf8');
  return decodeCapture(parseMidiMonitorText(text));
}

function main(): void {
  const { file, diffFile, allHeartbeats } = parseArgs(process.argv.slice(2));

  if (!file) {
    console.error('Usage: npx tsx scripts/decode-capture.ts <capture.txt> [--diff <other.txt>] [--all-heartbeats]');
    process.exitCode = 1;
    return;
  }

  const decoded = decodeFile(file);
  console.log(buildReport(decoded, { collapseHeartbeats: !allHeartbeats }));

  if (diffFile) {
    const otherDecoded = decodeFile(diffFile);
    console.log('');
    console.log(diffReports(decoded, otherDecoded));
  }
}

main();
