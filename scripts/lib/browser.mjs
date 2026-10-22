// Shared helpers for the headless-browser dev scripts (smoke, shot, captions).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { ROOT_ENDPOINT, rootMismatch, SKIP_ENV } from './root.mjs';
import { retryOnce } from './retry.mjs';
import { recoverRoute } from './route.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASE_URL = process.env.KINETIC_URL ?? 'http://127.0.0.1:5317';
export const OUT_DIR = path.join(ROOT, '.smoke');
/** A cold Vite server transforms and pre-bundles on the first request; Puppeteer's 30 s default can be too short. */
const NAVIGATION_TIMEOUT_MS = 90_000;

const BROWSER_CANDIDATES = [
  process.env.KINETIC_BROWSER,
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

export function findBrowser() {
  const found = BROWSER_CANDIDATES.find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('No Chromium browser found. Set KINETIC_BROWSER to its executable path.');
  return found;
}

/** Every built lesson id, from the folders in src/lessons. */
export function lessonIds() {
  return fs
    .readdirSync(path.join(ROOT, 'src', 'lessons'), { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(ROOT, 'src', 'lessons', d.name, 'index.tsx')))
    .map((d) => d.name)
    .sort();
}

/** Parse `--name=value` flags (split on the first '=' only) and positional args. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq < 0) flags[arg.slice(2)] = true;
    else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  return { flags, positional };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Abort unless the dev server at BASE_URL serves this checkout (see ./root.mjs). */
async function assertServesThisCheckout() {
  if (process.env[SKIP_ENV] === '1') return;
  let served = null;
  try {
    const res = await fetch(new URL(ROOT_ENDPOINT, BASE_URL));
    if (res.ok) served = await res.json();
  } catch {
    // not JSON (Vite's SPA fallback page, or another app): rootMismatch reports it
  }
  // Same machine, so resolve junctions and symlinks on both sides before comparing.
  const real = (dir) => {
    try {
      return fs.realpathSync.native(dir);
    } catch {
      return dir;
    }
  };
  if (typeof served?.root === 'string') served = { root: real(served.root) };
  const why = rootMismatch(served, real(ROOT), BASE_URL);
  if (why) {
    console.error(`[kinetic] Wrong dev server. ${why}`);
    process.exit(1);
  }
}

/** A page of `browser` with the navigation timeout, viewport, reduced motion and seeded Math.random openPage describes. */
export async function newPage(browser, { width = 1440, height = 1000, seed, reducedMotion = false } = {}) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(NAVIGATION_TIMEOUT_MS);
  await page.setViewport({ width, height });
  if (reducedMotion) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  if (seed != null) {
    await page.evaluateOnNewDocument((s) => {
      let state = s >>> 0;
      Math.random = () => {
        // mulberry32
        state = (state + 0x6d2b79f5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }, seed);
  }
  return page;
}

/**
 * Launch a headless browser with one page that records console errors.
 * `seed` replaces Math.random with a seeded generator before any app code runs,
 * so lessons that build random inputs render the same thing on every run.
 * `reducedMotion` turns on prefers-reduced-motion, which the app's CSS honours by
 * snapping transitions and stopping looping pulses: settled, repeatable frames.
 */
export async function openPage({ width = 1440, height = 1000, seed, reducedMotion = false } = {}) {
  try {
    await fetch(BASE_URL);
  } catch {
    throw new Error(`Dev server not reachable at ${BASE_URL}. Start it with \`npm run dev\`.`);
  }
  await assertServesThisCheckout();
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await newPage(browser, { width, height, seed, reducedMotion });
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  // Warm the server up before the first measured navigation, so its cold start is not charged to a lesson.
  await gotoUrl(page, BASE_URL);
  return { browser, page, errors };
}

/** page.goto that retries once (with a log line) on a cold-server timeout or a Vite reload mid-navigation. */
export const gotoUrl = (page, url, options = { waitUntil: 'networkidle0' }) =>
  retryOnce(() => page.goto(url, options), `navigating to ${url}`);

/** Load a lesson from a blank document, so seeded Math.random restarts and no state carries over. */
export async function loadFresh(page, route, settleMs) {
  await page.goto('about:blank');
  await gotoUrl(page, `${BASE_URL}/#${route}`);
  await sleep(settleMs);
}

/** Navigate to a hash route and let animations settle. */
export async function visit(page, route, settleMs = 1000) {
  const { route: target, rewritten } = recoverRoute(route);
  if (rewritten) {
    console.warn(
      `[kinetic] route "${route}" looks rewritten by Git Bash; using "${target}". ` +
        'Set MSYS_NO_PATHCONV=1 (or run from PowerShell) so routes pass through untouched.',
    );
  }
  await gotoUrl(page, `${BASE_URL}/#${target}`);
  await sleep(settleMs);
}

/** Step a player forward by pressing → on the document (the player listens on window). */
export async function stepForward(page, times = 1, gapMs = 260) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.press('ArrowRight');
    await sleep(gapMs);
  }
}

/** Pause a step player and jump straight to frame `index` via the timeline scrubber. */
export async function seekFrame(page, index) {
  await page.evaluate((i) => {
    const scrub = document.querySelector('.scrub');
    if (!scrub) return;
    // Pause explicitly: seeking to the current frame fires no onChange, so it wouldn't pause.
    const play = document.querySelector('.tbtn-play');
    if (play?.title.startsWith('Pause')) play.click();
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setValue.call(scrub, String(i));
    scrub.dispatchEvent(new Event('input', { bubbles: true }));
  }, index);
}

/** Frame count of the step player on the page, or 0 if there isn't one. */
export function frameCount(page) {
  return page.evaluate(() => {
    const scrub = document.querySelector('.scrub');
    return scrub ? Number(scrub.max) + 1 : 0;
  });
}

/** App chrome that stays pinned while the page scrolls: the sticky top bar. */
const STICKY_CHROME = '.topbar';

const setChromeVisibility = (page, visibility) =>
  page.evaluate(
    (sel, v) => document.querySelectorAll(sel).forEach((el) => { el.style.visibility = v; }),
    STICKY_CHROME,
    visibility,
  );

/**
 * Screenshot one element. An element taller than the viewport is captured by scrolling, and
 * the sticky top bar would be painted over its top edge, so the bar is hidden for the capture
 * (visibility only, so nothing reflows) and restored afterwards.
 */
export async function shootElement(page, element, file) {
  await setChromeVisibility(page, 'hidden');
  try {
    await element.screenshot({ path: file });
  } finally {
    await setChromeVisibility(page, '');
  }
}

export function outPath(...parts) {
  const file = path.join(OUT_DIR, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}

/** How long waitForCaption waits by default before giving up on a caption that keeps changing. */
export const CAPTION_SETTLE_MS = 2000;

/**
 * Page-side: resolves once the caption has stopped cross-fading (one `.caption-text` left, fully
 * opaque, for two animation frames in a row), or after `timeout` ms. Resolves true when settled.
 * The caption fades out the old text before the new one fades in, so a script that reads
 * `.caption-text` straight after a click can get the outgoing caption.
 */
function captionSettledInPage(timeout) {
  return new Promise((resolve) => {
    const start = performance.now();
    let stable = 0;
    const tick = () => {
      const captions = document.querySelectorAll('.caption-text');
      const settled = captions.length <= 1 && (!captions[0] || getComputedStyle(captions[0]).opacity === '1');
      stable = settled ? stable + 1 : 0;
      if (stable >= 2 || performance.now() - start > timeout) resolve(settled);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Wait until the stage caption has finished its fade (see captionSettledInPage). */
export const waitForCaption = (page, timeout = CAPTION_SETTLE_MS) => page.evaluate(captionSettledInPage, timeout);

/**
 * Give the page `window.kineticCaptionSettled(timeout?)` (a Promise, same rule as waitForCaption),
 * so an --evalfile drive script can await it between a click and reading the caption.
 */
export const exposeCaptionSettled = (page) =>
  page.evaluate(`window.kineticCaptionSettled = ${captionSettledInPage.toString()};`);
