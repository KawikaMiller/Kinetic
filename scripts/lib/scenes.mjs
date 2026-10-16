// The logic behind `npm run smoke -- --scenes`: click every scene tab of a lesson, let it sit idle,
// and report what the console said. Smoke's normal pass loads only each lesson's default scene, so a
// render loop that lives in scene three never shows up there. Pure helpers are tested
// (scenes.test.mjs); `scanScenes` drives a real page.
import { sleep } from './browser.mjs';

/** Idle time per scene: long enough for an effect loop to hit React's update-depth limit. */
export const DEFAULT_IDLE_MS = 3000;

/** React's two messages for a state-update loop. */
const LOOP_PATTERN = /maximum update depth exceeded|too many re-renders/i;

/** True when a console or page error is a render loop: the failure this scan exists to catch. */
export const isRenderLoop = (message) => LOOP_PATTERN.test(message);

/**
 * One scene's verdict from the errors heard while it sat idle. A render loop is called out by name,
 * and listed first, so a shard's log says what it is at a glance.
 */
export function sceneProblems(errors) {
  const loops = errors.filter(isRenderLoop);
  const others = errors.filter((e) => !isRenderLoop(e));
  return [...(loops.length ? ['RENDER LOOP (Maximum update depth exceeded)'] : []), ...others.map((e) => `console: ${e}`)];
}

/** "2/4" keeps every 4th lesson starting at the 2nd (1-based), so n shards cover every id exactly once. */
export function shardIds(ids, spec) {
  if (spec === undefined || spec === true) return ids;
  const match = /^(\d+)\/(\d+)$/.exec(String(spec));
  if (!match) throw new Error(`--shard must look like 2/4, got "${spec}"`);
  const [index, count] = [Number(match[1]), Number(match[2])];
  if (index < 1 || index > count) throw new Error(`--shard ${spec}: the first number must be from 1 to ${count}`);
  return ids.filter((_, i) => i % count === index - 1);
}

/** The scene picker of the page: the first radio group inside a stage frame, with its option labels, or null. */
const findPicker = () => {
  const group = document.querySelector('.stage-frame .segmented');
  if (!group) return null;
  const options = [...group.querySelectorAll('[role="radio"]')].map((b) => (b.textContent ?? '').trim());
  return { name: group.getAttribute('aria-label') ?? '', options };
};

/** Click option `index` of the picker called `name` (re-found every time: a scene switch re-renders the picker). */
const clickOption = ({ name, index }) => {
  const group = [...document.querySelectorAll('.stage-frame .segmented')].find((g) => (g.getAttribute('aria-label') ?? '') === name);
  const button = group?.querySelectorAll('[role="radio"]')[index];
  if (!button) return false;
  button.click();
  return true;
};

/**
 * With the lesson already loaded: click each scene tab in turn, wait `idleMs`, and collect the errors heard
 * in that window. `errors` is the array openPage() fills from console.error and pageerror. Returns one
 * entry per scene ({ scene, problems }); a lesson without a picker yields a single entry for its default scene.
 */
export async function scanScenes(page, errors, { idleMs = DEFAULT_IDLE_MS } = {}) {
  const picker = await page.evaluate(findPicker);
  const results = [];
  const listen = async (scene) => {
    await sleep(idleMs);
    results.push({ scene, problems: sceneProblems([...errors]) });
  };
  if (!picker || picker.options.length < 2) {
    errors.length = 0;
    await listen(picker?.options[0] ?? '(only scene)');
    return results;
  }
  for (let index = 0; index < picker.options.length; index++) {
    errors.length = 0;
    const clicked = await page.evaluate(clickOption, { name: picker.name, index });
    if (!clicked) {
      results.push({ scene: picker.options[index], problems: [`could not click scene tab "${picker.options[index]}"`] });
      continue;
    }
    await listen(picker.options[index]);
  }
  return results;
}
