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

/**
 * Which of a stage's radio groups (by accessible label, in page order) is the scene picker: the one labelled
 * "Scene" (any case), else the first. A lesson can put step tabs or a speed control before its picker, and
 * taking the first group blindly scanned those instead. -1 when there are no groups.
 */
export function pickerIndex(labels) {
  const named = labels.findIndex((label) => label.trim().toLowerCase() === 'scene');
  if (named >= 0) return named;
  return labels.length ? 0 : -1;
}

/** Every radio group inside a stage frame, in page order, with its accessible label and option texts. */
const findGroups = () =>
  [...document.querySelectorAll('.stage-frame .segmented')].map((group) => ({
    label: group.getAttribute('aria-label') ?? '',
    options: [...group.querySelectorAll('[role="radio"]')].map((b) => (b.textContent ?? '').trim()),
  }));

/**
 * Click option `index` of the scene picker, re-found every time by its label: a scene switch re-renders the
 * stage, and a scene with its own radio group before the picker moves the picker's position in the page.
 * `fallback` is the group's position when the page has no group labelled "Scene".
 */
const clickOption = ({ fallback, index }) => {
  const groups = [...document.querySelectorAll('.stage-frame .segmented')];
  const group = groups.find((g) => (g.getAttribute('aria-label') ?? '').trim().toLowerCase() === 'scene') ?? groups[fallback];
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
  const groups = await page.evaluate(findGroups);
  const group = pickerIndex(groups.map((g) => g.label));
  const picker = group >= 0 ? groups[group] : null;
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
    const clicked = await page.evaluate(clickOption, { fallback: group, index });
    if (!clicked) {
      results.push({ scene: picker.options[index], problems: [`could not click scene tab "${picker.options[index]}"`] });
      continue;
    }
    await listen(picker.options[index]);
  }
  return results;
}
