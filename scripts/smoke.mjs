// Load every lesson (or the ids given) in a headless browser and check it's healthy:
// no console errors, overview + stage + caption + quiz present, no horizontal overflow.
// Screenshots each stage to .smoke/<label>/ for eyeballing or before/after diffs.
//
//   npm run smoke                            # all lessons, label "latest"
//   npm run smoke -- --label=before          # save screenshots under .smoke/before/
//   npm run smoke -- sorting raft            # just these lessons
//   npm run smoke -- --frames --label=base   # deterministic: seeded Math.random, and
//                                            # step players shot paused at first/middle/last
//                                            # frame (<id>@0.png ...); live sims get <id>@live.png
import { BASE_URL, frameCount, lessonIds, openPage, outPath, parseArgs, seekFrame, sleep, visit } from './lib/browser.mjs';

const SETTLE_MS = 1500;
const LIVE_MS = 2500;

const { flags, positional } = parseArgs();
const ids = positional.length ? positional : lessonIds();
const label = typeof flags.label === 'string' ? flags.label : 'latest';
const framesMode = !!flags.frames;

const { browser, page, errors } = await openPage(framesMode ? { seed: 1, reducedMotion: true } : {});
const results = [];

async function shootStage(name) {
  const stage = await page.$('.stage-frame');
  if (stage) await stage.screenshot({ path: outPath(label, `${name}.png`) });
}

async function checkStructure() {
  return page.evaluate(() => ({
    overview: !!document.querySelector('.overview-tldr p')?.textContent?.trim(),
    stage: !!document.querySelector('.stage-frame .stage'),
    caption: (document.querySelector('.caption-text')?.textContent ?? '').trim(),
    quiz: document.querySelectorAll('.quiz-q').length,
    tries: document.querySelectorAll('.try-list li').length,
    ideas: document.querySelectorAll('.idea-list li').length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  }));
}

for (const id of ids) {
  errors.length = 0;
  if (framesMode) {
    // Full document load per lesson, so the seeded Math.random restarts every time.
    await page.goto('about:blank');
    await page.goto(`${BASE_URL}/#/lesson/${id}`, { waitUntil: 'networkidle0' });
    await sleep(SETTLE_MS);
  } else {
    await visit(page, `/lesson/${id}`, 1200);
  }

  const frames = await frameCount(page);
  const hasPlayer = frames > 0;
  let info;

  if (framesMode && hasPlayer) {
    info = await checkStructure();
    const targets = [...new Set([0, Math.floor((frames - 1) / 2), frames - 1])];
    for (const f of targets) {
      await seekFrame(page, f);
      await sleep(SETTLE_MS);
      await shootStage(`${id}@${f}`);
    }
  } else {
    if (hasPlayer) await page.click('.tbtn-play');
    await sleep(LIVE_MS);
    info = await checkStructure();
    await shootStage(framesMode ? `${id}@live` : id);
  }

  const problems = [];
  if (!info.overview) problems.push('missing overview');
  if (!info.stage) problems.push('missing stage');
  if (!info.caption || info.caption.startsWith('Press play, or poke')) problems.push('no caption');
  if (info.quiz < 3) problems.push(`quiz has ${info.quiz} questions`);
  if (info.tries < 3 || info.ideas < 3) problems.push(`tryThis=${info.tries} keyIdeas=${info.ideas}`);
  if (info.overflowX) problems.push('horizontal overflow');
  if (errors.length) problems.push(`console: ${errors.join(' || ')}`);
  results.push({ id, hasPlayer, frames, caption: info.caption, problems });
}
await browser.close();

for (const r of results) {
  const status = r.problems.length ? 'FAIL' : 'ok  ';
  const kind = r.hasPlayer ? `player(${r.frames})` : 'sim';
  console.log(`${status} ${r.id.padEnd(26)} ${kind.padEnd(12)} "${r.caption.slice(0, 55)}" ${r.problems.join('; ')}`);
}
const failed = results.filter((r) => r.problems.length).length;
console.log(`\n${results.length - failed}/${results.length} clean · screenshots in .smoke/${label}/`);
process.exit(failed ? 1 : 0);
