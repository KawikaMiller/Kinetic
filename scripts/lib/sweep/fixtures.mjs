// Fixture pages for the sweep's self-test: one clean page the sweep must leave alone, and one page per detector
// that plants exactly that defect behind a control, built from the app's real class names (`.segmented`, `.slider`,
// `.btn`, `.chip-button`, `.tbtn`, `.caption-text`, `.crash-panel`). A detector is proven when its page is flagged
// with its kind and the clean page is not.
import puppeteer from 'puppeteer-core';
import { findBrowser } from '../browser.mjs';
import { sweepLesson } from './engine.mjs';
import { observePage } from './observe.mjs';

/** Stands in for the dev server's origin: a fixture request anywhere else is off-page. */
export const FIXTURE_BASE_URL = 'http://127.0.0.1:5317';

/** Fast options for fixtures: short idle and settle, a short player wait, no waiting for a picker that is there. */
const FIXTURE_OPTIONS = { fast: true, idleMs: 150, settleMs: 60, pickerWaitMs: 300, playerWaitMs: 600 };

const SCENE_PICKER = `
  <div class="segmented" role="radiogroup" aria-label="Scene">
    <button type="button" role="radio" aria-checked="true">Calm</button>
    <button type="button" role="radio" aria-checked="false">Busy</button>
  </div>`;

const CLEAN_BODY = `
  <div class="segmented" role="radiogroup" aria-label="Mode">
    <span class="segmented-label">Mode</span>
    <button type="button" role="radio" aria-checked="true" id="mode-a">A</button>
    <button type="button" role="radio" aria-checked="false" id="mode-b">B</button>
  </div>
  <label class="slider"><span class="slider-label">Speed <b id="speed">5</b></span>
    <input type="range" min="0" max="10" step="1" value="5" id="speed-input"></label>
  <button type="button" class="btn btn-ghost" id="add">Add item</button>
  <button type="button" class="chip-button" id="chip">Preset</button>
  <label>Name <input type="text" id="name"></label>
  <select id="pick" aria-label="Pick"><option value="x">x</option><option value="y">y</option></select>
  <label><input type="checkbox" id="check"> Check</label>
  <p id="out">Count: 3 items, 12 ms</p>`;

const CLEAN_SCRIPT = `
  const out = document.getElementById('out');
  document.getElementById('add').addEventListener('click', () => { out.textContent = 'Count: 4 items, 15 ms'; });
  document.getElementById('speed-input').addEventListener('input', (e) => { document.getElementById('speed').textContent = e.target.value; });
  document.querySelectorAll('[role=radio]').forEach((b) => b.addEventListener('click', () => {
    b.parentElement.querySelectorAll('[role=radio]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
  }));`;

/** A lesson-shaped page: stage with a Scene picker plus `body`, then the caption area, then `script`. */
const lessonPage = ({ body = CLEAN_BODY, script = '', caption = 'A calm caption.', wired = true }) => `<!doctype html><meta charset="utf-8">
  <main class="lesson-main"><div class="stage-frame">${SCENE_PICKER}<div class="stage">${body}</div></div>
  <div class="caption"><div class="caption-text">${caption}</div></div></main>
  <script>(() => { ${wired ? CLEAN_SCRIPT : ''}${script} })();</script>`;

/** Wire a button (by id) to a handler written as page script. */
const onClick = (id, handler) => `document.getElementById('${id}').addEventListener('click', () => { ${handler} });`;
const button = (id, label) => `<button type="button" class="btn btn-ghost" id="${id}">${label}</button>`;
const withBody = (body) => `${CLEAN_BODY}${body}`;

/** Each fixture: its name, the finding kinds it must raise (empty: none allowed), page HTML and engine options. */
export const FIXTURES = [
  { name: 'clean page', expect: [], html: lessonPage({}) },
  {
    name: 'NaN printed after a click',
    expect: ['residue'],
    html: lessonPage({ body: withBody(button('bad', 'Compute') + '<span id="r"></span>'), script: onClick('bad', "document.getElementById('r').textContent = 'NaN%';") }),
  },
  {
    name: 'a slider at its maximum prints undefined',
    expect: ['residue'],
    html: lessonPage({
      body: withBody('<span id="r"></span>'),
      script: `document.getElementById('speed-input').addEventListener('input', (e) => {
        document.getElementById('r').textContent = Number(e.target.value) === 10 ? 'latency undefined ms' : 'ok';
      });`,
    }),
  },
  {
    name: 'an SVG role=button (no click method) is still pressed',
    expect: ['residue'],
    html: lessonPage({
      body: withBody('<svg width="80" height="30"><g role="button" tabindex="0" id="node"><rect width="60" height="20"></rect><text x="4" y="14" style="font-size:12px">node</text></g></svg><span id="r"></span>'),
      script: onClick('node', "document.getElementById('r').textContent = 'NaN%';"),
    }),
  },
  {
    name: 'the End key on a slider prints Infinity',
    expect: ['residue'],
    options: { fast: false },
    html: lessonPage({
      wired: false,
      body: `<label class="slider"><span class="slider-label">Gain <b id="g">1</b></span><input type="range" min="0" max="10" step="1" value="1" id="gain"></label><span id="r"></span>`,
      script: `document.getElementById('gain').addEventListener('keydown', (e) => { if (e.key === 'End') document.getElementById('r').textContent = 'gain Infinity'; });`,
    }),
  },
  {
    name: 'float residue',
    expect: ['residue'],
    html: lessonPage({ body: withBody(button('bad', 'Tiny') + '<span id="r"></span>'), script: onClick('bad', "document.getElementById('r').textContent = 'error 0.0000000000000568';") }),
  },
  {
    name: 'React key warning on the console',
    expect: ['react-warning'],
    html: lessonPage({ body: withBody(button('bad', 'Render')), script: onClick('bad', "console.error('Warning: Encountered two children with the same key, `a`. Keys should be unique.');") }),
  },
  {
    name: 'a warning (not an error) is caught',
    expect: ['react-warning'],
    html: lessonPage({ body: withBody(button('bad', 'Render')), script: onClick('bad', "console.warn('Cannot update a component (`Foo`) while rendering a different component (`Bar`).');") }),
  },
  {
    name: 'NaN attribute warning',
    expect: ['react-warning'],
    html: lessonPage({ body: withBody(button('bad', 'Draw')), script: onClick('bad', "console.error('Received NaN for the `cx` attribute. If this is expected, cast the value to a string.');") }),
  },
  {
    name: 'uncaught exception',
    expect: ['console'],
    html: lessonPage({ body: withBody(button('bad', 'Throw')), script: onClick('bad', "setTimeout(() => { throw new Error('boom'); }, 0);") }),
  },
  {
    name: 'render loop (maximum update depth)',
    expect: ['render-loop'],
    html: lessonPage({
      body: withBody(button('bad', 'Loop')),
      script: onClick('bad', "let n = 0; const spin = () => { if (n++ < 20) { console.error('Maximum update depth exceeded. This can happen when a component calls setState inside useEffect'); setTimeout(spin, 5); } }; spin();"),
    }),
  },
  {
    name: 'error boundary (a crashed stage)',
    expect: ['error-boundary'],
    html: lessonPage({
      body: withBody(button('bad', 'Crash')),
      script: onClick('bad', "document.querySelector('.stage').innerHTML = '<div class=\"crash-panel\" role=\"alert\"><h2>This lesson hit an error</h2></div>';"),
    }),
  },
  {
    name: 'focus falls to body when an item removes itself',
    expect: ['focus-dropped'],
    html: lessonPage({
      body: withBody('<button type="button" class="chip-button" id="gone">Remove me</button>'),
      script: onClick('gone', "document.getElementById('gone').remove();"),
    }),
  },
  {
    name: 'focus falls to body when a button hard-disables itself',
    expect: ['focus-dropped'],
    html: lessonPage({
      body: withBody(button('once', 'Only once')),
      script: onClick('once', "const b = document.getElementById('once'); b.disabled = true; b.hidden = true;"),
    }),
  },
  {
    name: 'text under 8 px at 390',
    expect: ['small-text'],
    html: lessonPage({ body: withBody('<svg viewBox="0 0 200 40" width="200" height="40"><text x="4" y="20" style="font-size:5px">tiny label</text></svg>') }),
  },
  {
    name: 'a page that scrolls sideways at 390',
    expect: ['phone-layout'],
    html: lessonPage({ body: withBody('<div style="width:900px;height:12px;border:1px solid"></div>') }),
  },
  {
    name: 'request that leaves the page',
    expect: ['off-page-request'],
    html: lessonPage({ body: withBody(button('bad', 'Phone home')), script: onClick('bad', "fetch('http://127.0.0.2:9/x').catch(() => {});") }),
  },
  {
    name: 'player that never advances',
    expect: ['frozen-player'],
    html: lessonPage({
      body: withBody(`<div class="transport"><button type="button" class="tbtn" title="Step back (←)">‹</button>
        <button type="button" class="tbtn tbtn-play" title="Play (Space)">▶</button>
        <button type="button" class="tbtn" title="Step forward (→)">›</button>
        <input class="scrub" type="range" min="0" max="8" value="0" aria-label="Timeline"><span class="tcount">1<span>/9</span></span></div>`),
    }),
  },
  {
    name: 'glued sentence in a caption',
    expect: ['glued-caption'],
    html: lessonPage({ body: withBody(button('bad', 'Next')), script: onClick('bad', "document.querySelector('.caption-text').textContent = 'The queue held it on port.60 s later.';") }),
  },
  {
    name: 'placeholder caption survives interaction',
    expect: ['caption-placeholder'],
    html: lessonPage({ caption: 'Press play, or poke at the visual.' }),
  },
  {
    name: 'a page that hangs',
    expect: ['unresponsive'],
    options: { callTimeoutMs: 800 },
    html: lessonPage({ body: withBody(button('bad', 'Spin')), script: onClick('bad', 'const end = Date.now() + 2500; while (Date.now() < end) { /* hang on purpose */ }') }),
  },
];

/** A headless browser for fixtures (no dev server involved). Throws when no Chromium browser is installed. */
export const launchFixtureBrowser = () =>
  puppeteer.launch({ executablePath: findBrowser(), headless: true, args: ['--no-sandbox', '--hide-scrollbars'] });

/** Run one fixture on a fresh page of `browser`; resolves to { fixture, kinds, result }. */
export async function runFixture(browser, fixture) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const obs = observePage(page, FIXTURE_BASE_URL);
  const load = () => page.setContent(fixture.html, { waitUntil: 'load' });
  const result = await sweepLesson({ page, obs, id: fixture.name, load, options: { ...FIXTURE_OPTIONS, ...fixture.options } });
  obs.stop();
  await page.close();
  return { fixture, kinds: [...new Set(result.findings.map((f) => f.kind))], result };
}

/** Fixtures that run at once: each gets its own page, so they do not disturb one another. */
const PARALLEL = 6;

/** Run all fixtures, `PARALLEL` at a time, keeping their order in the result. */
export async function runFixtures(browser, fixtures = FIXTURES) {
  const runs = new Array(fixtures.length);
  let next = 0;
  const worker = async () => {
    for (let i = next++; i < fixtures.length; i = next++) runs[i] = await runFixture(browser, fixtures[i]);
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, fixtures.length) }, worker));
  return runs;
}

/** Whether a fixture run behaved: every expected kind fired, and the clean page raised nothing at all. */
export function fixtureVerdict({ fixture, kinds }) {
  if (fixture.expect.length === 0) return { ok: kinds.length === 0, why: kinds.length ? `clean page flagged: ${kinds.join(', ')}` : '' };
  const missing = fixture.expect.filter((k) => !kinds.includes(k));
  return { ok: missing.length === 0, why: missing.length ? `missed ${missing.join(', ')} (saw: ${kinds.join(', ') || 'nothing'})` : '' };
}
