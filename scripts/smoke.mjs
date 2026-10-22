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
//   npm run smoke -- --scenes [ids...] [--shard=2/4] [--idle=3000] [--selftest]
//                                            # click every scene tab, sit idle, fail on any console
//                                            # error (render loops included); see scripts/scenes.mjs
//   npm run smoke -- --mobile              # 390x844 phone: also fails on content the stage
//                                            # frame clips, and on scene (SVG) text rendered
//                                            # below MIN_SCENE_TEXT_PX (fix: StageFrame minWidth)
import { frameCount, lessonIds, loadFresh, openPage, outPath, parseArgs, seekFrame, shootElement, sleep, visit } from './lib/browser.mjs';

const SETTLE_MS = 1500;
const LIVE_MS = 2500;
const PHONE = { width: 390, height: 844 };
/** Smallest scene text a phone should render: the smallest size lessons use on desktop. */
const MIN_SCENE_TEXT_PX = 8;

const { flags, positional } = parseArgs();
// `--scenes` is its own pass (every scene tab of every lesson that has a picker, idle, console watched): scenes.mjs.
if (flags.scenes) await import('./scenes.mjs');
const ids = positional.length ? positional : lessonIds();
const mobile = !!flags.mobile;
const label = typeof flags.label === 'string' ? flags.label : mobile ? 'mobile' : 'latest';
const framesMode = !!flags.frames;

const { browser, page, errors } = await openPage({
  ...(mobile ? PHONE : {}),
  ...(framesMode ? { seed: 1, reducedMotion: true } : {}),
});
const results = [];

async function shootStage(name) {
  const stage = await page.$('.stage-frame');
  if (stage) await shootElement(page, stage, outPath(label, `${name}.png`));
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

/** Phone-only checks: content cut off by the stage frame, and unreadably small scene text. */
async function checkPhone() {
  return page.evaluate(() => {
    const frame = document.querySelector('.stage-frame');
    if (!frame) return { clipped: [], smallText: null };
    const right = frame.getBoundingClientRect().right + 1;
    const clipped = [];
    for (const el of frame.querySelectorAll('*')) {
      if (el.closest('.stage-wide')) continue; // scrolls sideways on purpose
      const box = el.getBoundingClientRect();
      if (!box.width || box.right <= right || el.parentElement.getBoundingClientRect().right > right) continue;
      // clipped on purpose by its own overflow container, which itself fits
      let a = el.parentElement;
      let deliberate = false;
      for (; a && a !== frame; a = a.parentElement) {
        if (getComputedStyle(a).overflowX !== 'visible' && a.getBoundingClientRect().right <= right) {
          deliberate = true;
          break;
        }
      }
      if (!deliberate) clipped.push(`${el.tagName.toLowerCase()}.${String(el.className?.baseVal ?? el.className).split(' ')[0]}`);
    }
    let smallText = null;
    for (const text of frame.querySelectorAll('.stage svg text')) {
      // The drawing's own scale (viewBox → screen), not per-element animation transforms
      // like a packet scaling in, which would make the check depend on timing.
      const ctm = text.ownerSVGElement?.getScreenCTM();
      if (!ctm || !text.textContent.trim() || !text.getBoundingClientRect().width) continue;
      const px = parseFloat(getComputedStyle(text).fontSize) * Math.hypot(ctm.a, ctm.b);
      if (!smallText || px < smallText.px) smallText = { px: Math.round(px * 10) / 10, text: text.textContent.trim().slice(0, 24) };
    }
    return { clipped: clipped.slice(0, 3), smallText };
  });
}

for (const id of ids) {
  errors.length = 0;
  if (framesMode) {
    // Full document load per lesson, so the seeded Math.random restarts every time.
    await loadFresh(page, `/lesson/${id}`, SETTLE_MS);
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
  if (mobile) {
    const phone = await checkPhone();
    if (phone.clipped.length) problems.push(`clipped by the frame: ${phone.clipped.join(', ')}`);
    if (phone.smallText && phone.smallText.px < MIN_SCENE_TEXT_PX) {
      problems.push(`scene text ${phone.smallText.px}px ("${phone.smallText.text}") < ${MIN_SCENE_TEXT_PX}px: set StageFrame minWidth`);
    }
  }
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
console.log(`\n${results.length - failed}/${results.length} clean${mobile ? ' at 390px' : ''} · screenshots in .smoke/${label}/`);
process.exit(failed ? 1 : 0);
