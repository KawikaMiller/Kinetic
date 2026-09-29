// Screenshot one route, optionally after interacting with it. Prints console errors.
//
//   npm run shot -- /lesson/raft raft-check
//   npm run shot -- /lesson/sorting s --play=3000 --full
//   npm run shot -- /lesson/crdts c "--click=.cr-net|.btn-primary" --wait=2000
//   npm run shot -- /lesson/raft r --size=1440x900 "--eval=document.title"
//   npm run shot -- /lesson/raft r --evalfile=path/to/script.js
//   npm run shot -- /lesson/raft r --stage     # screenshot just the stage frame
import fs from 'node:fs';
import { openPage, outPath, parseArgs, sleep, visit } from './lib/browser.mjs';

const { flags, positional } = parseArgs();
const [route = '/', name = 'shot'] = positional;
const [width, height] = String(flags.size ?? '1440x1100').split('x').map(Number);

const { browser, page, errors } = await openPage({ width, height });
await visit(page, route, 800);

if (flags.play) {
  await page.click('.tbtn-play').catch(() => errors.push('[shot] no play button'));
  await sleep(Number(flags.play));
}
if (typeof flags.click === 'string') {
  for (const selector of flags.click.split('|')) {
    await page.click(selector).catch(() => errors.push(`[shot] could not click ${selector}`));
    await sleep(400);
  }
}
if (flags.wait) await sleep(Number(flags.wait));
if (typeof flags.eval === 'string') console.log('eval:', JSON.stringify(await page.evaluate(flags.eval)));
if (typeof flags.evalfile === 'string') {
  console.log('eval:', JSON.stringify(await page.evaluate(fs.readFileSync(flags.evalfile, 'utf8'))));
}

const file = outPath('shots', `${name}.png`);
const stage = flags.stage ? await page.$('.stage-frame') : null;
if (stage) await stage.screenshot({ path: file });
else await page.screenshot({ path: file, fullPage: !!flags.full });

console.log(file);
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
