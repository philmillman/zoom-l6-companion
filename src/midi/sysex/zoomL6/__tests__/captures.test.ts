import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseMidiMonitorText } from '../capture/midiMonitorParser';
import { decodeCapture, buildReport } from '../capture/report';

/**
 * Decodes every real capture under `captures/*.txt` (see docs/CAPTURE_GUIDE.md) so `npm test`
 * doubles as a smoke test for the reverse-engineering workflow. Skips gracefully when no
 * captures have been recorded yet.
 *
 * Resolve `captures/` relative to this test file (not `process.cwd()`), so the fixtures are found
 * regardless of the directory vitest is launched from — otherwise a non-root cwd silently skips
 * the whole suite instead of catching a decoding regression.
 */
const capturesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../../../captures');

describe('captures/*.txt fixtures', () => {
  const hasDir = existsSync(capturesDir);
  const files = hasDir ? readdirSync(capturesDir).filter((f) => f.endsWith('.txt')) : [];

  if (!hasDir || files.length === 0) {
    it.skip('no captures/*.txt fixtures present yet', () => {});
    return;
  }

  for (const file of files) {
    it(`decodes ${file} without throwing`, () => {
      const text = readFileSync(join(capturesDir, file), 'utf8');
      expect(() => {
        const events = parseMidiMonitorText(text);
        const decoded = decodeCapture(events);
        buildReport(decoded);
      }).not.toThrow();
    });
  }
});
