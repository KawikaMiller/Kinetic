// Screenshot one route, optionally after interacting with it. Prints console errors.
//
//   npm run shot -- /lesson/raft raft-check
//   npm run shot -- /lesson/sorting s --play=3000 --full
//   npm run shot -- /lesson/crdts c "--click=.cr-net|.btn-primary" --wait=2000
//   npm run shot -- /lesson/raft r --size=1440x900 "--eval=document.title"
//   npm run shot -- /lesson/raft r --evalfile=path/to/script.js   # top-level await works; the last value prints
//   npm run shot -- /lesson/raft r --stage     # screenshot just the stage frame
//   npm run shot -- /lesson/sorting k --press=Tab,Tab,Space          # real key presses
//   npm run shot -- /lesson/sorting k --press-on=.tbtn-play --press=Space,Shift+Tab
//     (keys are Puppeteer names: Tab, Enter, Space, Escape, ArrowLeft…; join modifiers
//      with +. After the presses the focused element is printed, to check focus order.
//      --press-on focuses through element.focus(), so SVG elements with a tabindex work too.)
//   npm run shot -- /lesson/sorting s "--click=.btn-primary" --settle "--eval=document.querySelector('.caption-text').textContent"
//     (--settle[=ms]: after every click / key press / play, wait for the caption cross-fade to
//      finish, up to ms (default 2000), so reads don't catch the outgoing caption. --evalfile
//      scripts can also await window.kineticCaptionSettled() between their own clicks.)
//
// Git Bash rewrites "/lesson/x" into a Windows path: set MSYS_NO_PATHCONV=1 (the scripts
// warn and recover the route when they spot it).
import fs from 'node:fs';
import { CAPTION_SETTLE_MS, exposeCaptionSettled, openPage, outPath, parseArgs, shootElement, sleep, visit, waitForCaption } from './lib/browser.mjs';

const KEY_GAP_MS = 150;

/** Press "Shift+Tab"-style chords: hold every modifier, press the last key, release. */
async function pressChord(page, chord) {
  const keys = chord.split('+');
  const main = keys.pop();
  for (const mod of keys) await page.keyboard.down(mod);
  await page.keyboard.press(main);
  for (const mod of keys.reverse()) await page.keyboard.up(mod);
}

/** Short description of the focused element: tag, first class, and its accessible-ish name. */
const describeFocus = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return '(body)';
    const cls = el.classList[0] ? `.${el.classList[0]}` : '';
    const name = el.getAttribute('aria-label') || el.textContent?.trim() || el.getAttribute('title') || '';
    const label = name.replace(/\s+/g, ' ').slice(0, 50);
    return `${el.tagName.toLowerCase()}${cls} "${label}"`;
  });

const { flags, positional } = parseArgs();
const [route = '/', name = 'shot'] = positional;
const [width, height] = String(flags.size ?? '1440x1100').split('x').map(Number);

const { browser, page, errors } = await openPage({ width, height });

const settleMs = flags.settle === true ? CAPTION_SETTLE_MS : Number(flags.settle ?? 0);
/** With --settle, wait out the caption fade; reports a caption still changing at the deadline. */
async function settle() {
  if (settleMs && !(await waitForCaption(page, settleMs))) errors.push(`[shot] caption still changing after ${settleMs} ms`);
}

/**
 * Run a drive script in the page. REPL mode is what lets the script use top-level `await` (a plain
 * page.evaluate parses it as a classic script and throws a SyntaxError); the value of the last
 * expression comes back, awaited if it is a promise.
 */
async function runScript(source) {
  const cdp = await page.createCDPSession();
  try {
    const { result, exceptionDetails } = await cdp.send('Runtime.evaluate', { expression: source, awaitPromise: true, returnByValue: true, replMode: true });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  } finally {
    await cdp.detach();
  }
}

/** Focus any element, HTML or SVG: page.focus only takes HTML elements. False when it can't take focus. */
const focusOn = (selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    el?.focus();
    return !!el && document.activeElement === el;
  }, selector);

await visit(page, route, 800);
await exposeCaptionSettled(page);

if (flags.play) {
  // A live simulation has no play button and is already running: just let it run.
  await (await page.$('.tbtn-play'))?.click();
  await sleep(Number(flags.play));
  await settle();
}
if (typeof flags.click === 'string') {
  for (const selector of flags.click.split('|')) {
    await page.click(selector).catch(() => errors.push(`[shot] could not click ${selector}`));
    await sleep(400);
    await settle();
  }
}
if (typeof flags['press-on'] === 'string') {
  if (!(await focusOn(flags['press-on']))) errors.push(`[shot] could not focus ${flags['press-on']}`);
}
if (typeof flags.press === 'string') {
  for (const chord of flags.press.split(',')) {
    await pressChord(page, chord.trim());
    await sleep(KEY_GAP_MS);
    await settle();
  }
  console.log('focus:', await describeFocus(page));
}
if (flags.wait) await sleep(Number(flags.wait));
if (typeof flags.eval === 'string') console.log('eval:', JSON.stringify(await page.evaluate(flags.eval)));
if (typeof flags.evalfile === 'string') {
  console.log('eval:', JSON.stringify(await runScript(fs.readFileSync(flags.evalfile, 'utf8'))));
}

const file = outPath('shots', `${name}.png`);
const stage = flags.stage ? await page.$('.stage-frame') : null;
if (stage) await shootElement(page, stage, file);
else await page.screenshot({ path: file, fullPage: !!flags.full });

console.log(file);
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
