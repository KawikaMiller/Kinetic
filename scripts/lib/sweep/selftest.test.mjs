// The sweep's self-test in a real browser: every detector must fire on its fixture page and the clean page must
// stay clean (no dev server needed: the fixtures are served with setContent). Skipped where no Chromium browser
// is installed; `npm run sweep -- --selftest` runs the same fixtures from the command line.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { findBrowser } from '../browser.mjs';
import { FIXTURES, fixtureVerdict, launchFixtureBrowser, runFixtures } from './fixtures.mjs';
import { KINDS } from './scan.mjs';

const hasBrowser = (() => {
  try {
    findBrowser();
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasBrowser)('sweep self-test (fixture pages in a browser)', () => {
  let browser;
  let runs;
  beforeAll(async () => {
    browser = await launchFixtureBrowser();
    runs = await runFixtures(browser);
  }, 120_000);
  afterAll(() => browser?.close());

  it.each(FIXTURES.map((f) => f.name))('%s', (name) => {
    const run = runs.find((r) => r.fixture.name === name);
    const verdict = fixtureVerdict(run);
    expect(verdict.why).toBe('');
    expect(verdict.ok).toBe(true);
  });

  it('every detector kind except the driver fallback has a fixture that raises it', () => {
    const covered = new Set(FIXTURES.flatMap((f) => f.expect));
    expect(KINDS.filter((k) => k !== 'driver' &&!covered.has(k))).toEqual([]);
  });
});
