// Drive every control of a lesson with extremes and watch what the page does: the Tier 3 sign-off sweep as a repo
// script. Per scene it clicks the scene tab, idles, exercises every button, chip, radio, slider (min, max, Home/End,
// one beyond), field and select, plays any step player, and after every action checks the console (errors AND
// warnings), visible text for NaN / undefined / float residue, an error boundary, keyboard focus falling to <body>,
// a frozen player, requests that leave the page, glued captions and text under 8px at 390. Needs the dev server.
//
//   npm run sweep -- <ids...>                 # these lessons, 1440 wide, seeded Math.random
//   npm run sweep -- <ids...> --mobile        # the whole sweep at 390 x 844
//   npm run sweep -- --shard=2/4              # every 4th lesson from the 2nd (combines with ids)
//   npm run sweep -- --all-tier=4             # every built lesson of a tier
//   npm run sweep -- <ids...> --fast          # extremes and one click per control, 1 s idle
//   npm run sweep -- --selftest               # fixture pages: each detector fires, a clean page stays clean
//   flags: --idle=<ms> (3000)  --max-actions=<n> (400 per scene)  --budget=<s> (300 per lesson)  --json=<file>
// A scene or lesson that uses up its budget is reported with a BUDGET REACHED line, never cut silently.
//
// Output: one line per lesson (findings indented under it), then SWEEP_SUMMARY {json}. Exit 1 on any finding.
import fs from 'node:fs';
import { TOPICS } from '../src/core/curriculum.ts';
import { BASE_URL, lessonIds, loadFresh, newPage, openPage, parseArgs } from './lib/browser.mjs';
import { shardIds } from './lib/scenes.mjs';
import { DEFAULT_OPTIONS, sweepLesson } from './lib/sweep/engine.mjs';
import { observePage } from './lib/sweep/observe.mjs';
import { formatLesson, summarize, toJson } from './lib/sweep/report.mjs';

const PHONE = { width: 390, height: 844 };
/** Seed for Math.random, so lessons that build random inputs show the same thing on every run. */
const SEED = 1;
const SETTLE_AFTER_LOAD_MS = 1200;

const { flags, positional } = parseArgs();

/** The lessons to sweep: ids given, else a tier's built lessons, else every built lesson; then the shard. */
function chooseIds() {
  const built = lessonIds();
  let ids = positional;
  if (flags['all-tier'] !== undefined) {
    const tier = Number(flags['all-tier']);
    if (!Number.isInteger(tier)) throw new Error(`--all-tier must be a number, got "${flags['all-tier']}"`);
    const inTier = new Set(TOPICS.filter((t) => t.tier === tier).map((t) => t.id));
    ids = [...ids, ...built.filter((id) => inTier.has(id))];
  }
  if (!ids.length) ids = built;
  const unknown = ids.filter((id) => !built.includes(id));
  if (unknown.length) throw new Error(`no such lesson: ${unknown.join(', ')}`);
  return shardIds([...new Set(ids)], flags.shard);
}

function numberFlag(name, fallback) {
  if (typeof flags[name] !== 'string') return fallback;
  const value = Number(flags[name]);
  if (!Number.isFinite(value) || value < 0) throw new Error(`--${name} must be a non-negative number, got "${flags[name]}"`);
  return value;
}

async function selfTest() {
  const { fixtureVerdict, launchFixtureBrowser, runFixtures } = await import('./lib/sweep/fixtures.mjs');
  const browser = await launchFixtureBrowser();
  const runs = await runFixtures(browser);
  await browser.close();
  let bad = 0;
  for (const run of runs) {
    const verdict = fixtureVerdict(run);
    if (!verdict.ok) bad++;
    console.log(`${verdict.ok ? 'ok  ' : 'FAIL'} ${run.fixture.name.padEnd(55)} raised ${run.kinds.join(', ') || 'nothing'}${verdict.why ? `  <- ${verdict.why}` : ''}`);
  }
  console.log(`\nselftest: ${runs.length - bad}/${runs.length} fixtures behaved`);
  process.exit(bad ? 1 : 0);
}

async function main() {
  const ids = chooseIds();
  const mobile = Boolean(flags.mobile);
  const options = {
    ...DEFAULT_OPTIONS,
    fast: Boolean(flags.fast),
    mobile,
    idleMs: numberFlag('idle', flags.fast ? 1000 : DEFAULT_OPTIONS.idleMs),
    maxActions: numberFlag('max-actions', DEFAULT_OPTIONS.maxActions),
    budgetMs: numberFlag('budget', DEFAULT_OPTIONS.budgetMs / 1000) * 1000,
  };
  let { browser, page } = await openPage({ seed: SEED, ...(mobile ? PHONE : {}) });
  let obs = observePage(page, BASE_URL);
  const results = [];
  for (const id of ids) {
    const load = () => loadFresh(page, `/lesson/${id}`, SETTLE_AFTER_LOAD_MS);
    const result = await sweepLesson({ page, obs, id, load, options });
    results.push(result);
    console.log(formatLesson(result));
    if (result.aborted) {
      // A hung page cannot be reused: open a fresh, identically seeded one for the next lesson.
      obs.stop();
      await page.close({ runBeforeUnload: false }).catch(() => {});
      page = await newPage(browser, { seed: SEED, ...(mobile ? PHONE : {}) });
      obs = observePage(page, BASE_URL);
    }
  }
  await browser.close();
  const summary = summarize(results);
  console.log(`\n${summary.clean}/${summary.lessons} lessons clean · ${summary.scenes} scenes, ${summary.controls} controls, ${summary.actions} actions, ${summary.keyPresses} key presses, ${summary.captions} captions · ${summary.seconds}s${mobile ? ' · at 390px' : ''}`);
  console.log(`SWEEP_SUMMARY ${JSON.stringify(summary)}`);
  if (typeof flags.json === 'string') fs.writeFileSync(flags.json, JSON.stringify({ summary, lessons: results.map(toJson) }, null, 1));
  process.exit(summary.findings ? 1 : 0);
}

await (flags.selftest ? selfTest() : main());
