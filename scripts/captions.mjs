// Step through each step-player lesson and flag long runs of an unchanged caption:
// candidates for a stale caption (a frame without `say` keeps the previous one).
// A flagged run is only a bug if the caption has stopped being true, so eyeball them.
// It also fails (exit 1) on a glued sentence in any caption it sees ("port.60 s": a JSX line
// break after `{…}` swallowed the space), with inline code blanked first; see core/testing/glue.ts.
//
//   npm run captions                 # all lessons
//   npm run captions -- tcp-udp      # just these
import { CODE_PLACEHOLDER, gluedSentences } from '../src/core/testing/glue.ts';
import { BASE_URL, lessonIds, openPage, parseArgs, sleep, stepForward } from './lib/browser.mjs';

const MAX_STEPS = 70;
const FLAG_RUN = 6;

const { positional } = parseArgs();
const ids = positional.length ? positional : lessonIds();
// Seeded, with a full reload per lesson, so lessons with random inputs give the same frames every run.
const { browser, page } = await openPage({ seed: 1 });
const glued = [];

for (const id of ids) {
  await page.goto('about:blank');
  await page.goto(`${BASE_URL}/#/lesson/${id}`, { waitUntil: 'networkidle0' });
  await sleep(900);
  if (!(await page.$('.tbtn-play'))) continue;

  const seen = [];
  let lastCounter = '';
  for (let s = 0; s < MAX_STEPS; s++) {
    const { caption, prose, counter } = await page.evaluate((placeholder) => {
      const el = document.querySelector('.caption-text');
      const copy = el?.cloneNode(true);
      copy?.querySelectorAll('code, kbd, samp').forEach((c) => { c.textContent = placeholder; });
      return {
        caption: (el?.textContent ?? '').trim(),
        prose: copy?.textContent ?? '',
        counter: document.querySelector('.tcount')?.textContent ?? '',
      };
    }, CODE_PLACEHOLDER);
    if (counter === lastCounter) break; // reached the last frame
    lastCounter = counter;
    seen.push(caption);
    for (const hit of gluedSentences(prose)) glued.push(`${id} frame ${s + 1}: "${hit}"`);
    await stepForward(page);
  }

  let longest = { length: 0, start: 0, caption: '' };
  for (let i = 0; i < seen.length; ) {
    let j = i;
    while (j < seen.length && seen[j] === seen[i]) j++;
    if (j - i > longest.length) longest = { length: j - i, start: i, caption: seen[i] };
    i = j;
  }
  const status = longest.length >= FLAG_RUN ? 'CHECK' : 'ok   ';
  console.log(
    `${status} ${id.padEnd(26)} frames=${String(seen.length).padEnd(3)} longest run=${longest.length} from frame ${longest.start + 1}: "${longest.caption.slice(0, 70)}"`,
  );
}
await browser.close();
if (glued.length) {
  console.error(`\nGlued sentences (a JSX line break after {…} swallowed the space):\n  ${glued.join('\n  ')}`);
  process.exitCode = 1;
}
