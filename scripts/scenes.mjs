// Scene scan, reached as `npm run smoke -- --scenes`: for every lesson that has a scene picker, click each
// scene tab, sit idle ~3 s, and fail on any console error or page error (above all React's
// "Maximum update depth exceeded"). Plain `smoke` loads only each lesson's default scene, so a render loop in
// scene three passes it. Needs the dev server, like smoke.
//
//   npm run smoke -- --scenes webassembly dma-io-devices   # just these lessons
//   npm run smoke -- --scenes --shard=2/4                  # every 4th lesson from the 2nd: run four of these in parallel
//   npm run smoke -- --scenes --idle=5000 sorting          # idle ms per scene (default 3000)
//   npm run smoke -- --scenes --selftest                   # proves the collector catches a render loop (no lessons loaded)
//
// Ids and --shard combine (shard applies to the ids given, or to every lesson). Output: one line per lesson,
// then `SCENES_SUMMARY {json}` so shards can be merged by a script. Exit 1 on any failure. A full run takes
// about (scenes x idle) per lesson: use shards or an id list, not one process over all 330 lessons.
import { DEFAULT_IDLE_MS, scanScenes, shardIds } from './lib/scenes.mjs';
import { lessonIds, openPage, parseArgs, visit } from './lib/browser.mjs';

const { flags, positional } = parseArgs();
const idleMs = typeof flags.idle === 'string' ? Number(flags.idle) : DEFAULT_IDLE_MS;

/** A page with a calm scene and a scene that spams the console the way a render loop does. */
const FIXTURE = `
<div class="stage-frame"><div class="segmented" role="radiogroup" aria-label="Scene">
  <button role="radio" type="button">Calm</button>
  <button role="radio" type="button" id="loop">Loop</button>
</div></div>
<script>
  document.getElementById('loop').addEventListener('click', () => {
    let n = 0;
    const spin = () => { if (n++ < 50) { console.error('Maximum update depth exceeded. This can happen when a component calls setState inside useEffect'); setTimeout(spin, 5); } };
    spin();
  });
</script>`;

async function selfTest() {
  const { browser, page, errors } = await openPage();
  await page.setContent(FIXTURE);
  const results = await scanScenes(page, errors, { idleMs: 400 });
  await browser.close();
  const calm = results.find((r) => r.scene === 'Calm');
  const loop = results.find((r) => r.scene === 'Loop');
  const caught = Boolean(loop?.problems[0]?.startsWith('RENDER LOOP'));
  const quiet = calm?.problems.length === 0;
  console.log(`selftest: calm scene ${quiet ? 'clean' : 'FLAGGED (wrong)'}, looping scene ${caught ? 'caught as a render loop' : 'MISSED (wrong)'}`);
  process.exit(caught && quiet ? 0 : 1);
}

async function main() {
  const wanted = positional.length ? positional : lessonIds();
  const ids = shardIds(wanted, flags.shard);
  const { browser, page, errors } = await openPage();
  const failed = [];
  let sceneCount = 0;
  for (const id of ids) {
    errors.length = 0;
    await visit(page, `/lesson/${id}`, 800);
    const results = await scanScenes(page, errors, { idleMs });
    sceneCount += results.length;
    const bad = results.filter((r) => r.problems.length);
    const names = results.map((r) => r.scene).join(', ');
    if (bad.length) {
      failed.push(id);
      console.log(`FAIL ${id.padEnd(30)} ${results.length} scenes: ${bad.map((r) => `[${r.scene}] ${r.problems.join(' | ')}`).join(' ; ')}`);
    } else {
      console.log(`ok   ${id.padEnd(30)} ${results.length} scene${results.length === 1 ? '' : 's'}: ${names}`);
    }
  }
  await browser.close();
  console.log(`\n${ids.length - failed.length}/${ids.length} lessons clean, ${sceneCount} scenes scanned, ${idleMs} ms idle each`);
  console.log(`SCENES_SUMMARY ${JSON.stringify({ lessons: ids.length, scenes: sceneCount, failed })}`);
  process.exit(failed.length ? 1 : 0);
}

await (flags.selftest ? selfTest() : main());
