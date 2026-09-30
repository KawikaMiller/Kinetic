// Shared helpers for the headless-browser dev scripts (smoke, shot, captions).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BASE_URL = process.env.KINETIC_URL ?? 'http://127.0.0.1:5317';
export const OUT_DIR = path.join(ROOT, '.smoke');

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
  const browser = await puppeteer.launch({
    executablePath: findBrowser(),
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars'],
  });
  const page = await browser.newPage();
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
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 200)));
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  return { browser, page, errors };
}

/** Navigate to a hash route and let animations settle. */
export async function visit(page, route, settleMs = 1000) {
  await page.goto(`${BASE_URL}/#${route}`, { waitUntil: 'networkidle0' });
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

export function outPath(...parts) {
  const file = path.join(OUT_DIR, ...parts);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return file;
}
