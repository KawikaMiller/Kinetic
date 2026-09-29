// Load every lesson (or the ids given) in a headless browser and check it's healthy:
// no console errors, overview + stage + caption + quiz present, no horizontal overflow.
// Screenshots each stage to .smoke/<label>/<id>.png for eyeballing or before/after review.
//
//   npm run smoke                       # all lessons, label "latest"
//   npm run smoke -- --label=before     # save screenshots under .smoke/before/
//   npm run smoke -- sorting raft       # just these lessons
import { lessonIds, openPage, outPath, parseArgs, sleep, visit } from './lib/browser.mjs';

const { flags, positional } = parseArgs();
const ids = positional.length ? positional : lessonIds();
const label = typeof flags.label === 'string' ? flags.label : 'latest';

const { browser, page, errors } = await openPage();
const results = [];

for (const id of ids) {
  errors.length = 0;
  await visit(page, `/lesson/${id}`, 1200);
  const hasPlayer = !!(await page.$('.tbtn-play'));
  if (hasPlayer) await page.click('.tbtn-play');
  await sleep(2500);

  const info = await page.evaluate(() => ({
    overview: !!document.querySelector('.overview-tldr p')?.textContent?.trim(),
    stage: !!document.querySelector('.stage-frame .stage'),
    caption: (document.querySelector('.caption-text')?.textContent ?? '').trim(),
    quiz: document.querySelectorAll('.quiz-q').length,
    tries: document.querySelectorAll('.try-list li').length,
    ideas: document.querySelectorAll('.idea-list li').length,
    overflowX: document.documentElement.scrollWidth > window.innerWidth,
  }));
  const stage = await page.$('.stage-frame');
  if (stage) await stage.screenshot({ path: outPath(label, `${id}.png`) });

  const problems = [];
  if (!info.overview) problems.push('missing overview');
  if (!info.stage) problems.push('missing stage');
  if (!info.caption || info.caption.startsWith('Press play, or poke')) problems.push('no caption');
  if (info.quiz < 3) problems.push(`quiz has ${info.quiz} questions`);
  if (info.tries < 3 || info.ideas < 3) problems.push(`tryThis=${info.tries} keyIdeas=${info.ideas}`);
  if (info.overflowX) problems.push('horizontal overflow');
  if (errors.length) problems.push(`console: ${errors.join(' || ')}`);
  results.push({ id, hasPlayer, caption: info.caption, problems });
}
await browser.close();

for (const r of results) {
  const status = r.problems.length ? 'FAIL' : 'ok  ';
  console.log(`${status} ${r.id.padEnd(26)} ${r.hasPlayer ? 'player' : 'sim   '} "${r.caption.slice(0, 60)}" ${r.problems.join('; ')}`);
}
const failed = results.filter((r) => r.problems.length).length;
console.log(`\n${results.length - failed}/${results.length} clean · screenshots in .smoke/${label}/`);
process.exit(failed ? 1 : 0);
