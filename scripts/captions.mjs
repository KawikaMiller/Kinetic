// Step through each step-player lesson and flag long runs of an unchanged caption:
// candidates for a stale caption (a frame without `say` keeps the previous one).
// A flagged run is only a bug if the caption has stopped being true, so eyeball them.
//
//   npm run captions                 # all lessons
//   npm run captions -- tcp-udp      # just these
import { BASE_URL, lessonIds, openPage, parseArgs, sleep, stepForward } from './lib/browser.mjs';

const MAX_STEPS = 70;
const FLAG_RUN = 6;

const { positional } = parseArgs();
const ids = positional.length ? positional : lessonIds();
// Seeded, with a full reload per lesson, so lessons with random inputs give the same frames every run.
const { browser, page } = await openPage({ seed: 1 });

for (const id of ids) {
  await page.goto('about:blank');
  await page.goto(`${BASE_URL}/#/lesson/${id}`, { waitUntil: 'networkidle0' });
  await sleep(900);
  if (!(await page.$('.tbtn-play'))) continue;

  const seen = [];
  let lastCounter = '';
  for (let s = 0; s < MAX_STEPS; s++) {
    const { caption, counter } = await page.evaluate(() => ({
      caption: (document.querySelector('.caption-text')?.textContent ?? '').trim(),
      counter: document.querySelector('.tcount')?.textContent ?? '',
    }));
    if (counter === lastCounter) break; // reached the last frame
    lastCounter = counter;
    seen.push(caption);
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
