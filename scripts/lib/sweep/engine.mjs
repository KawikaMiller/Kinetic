// The sweep for one lesson: every scene, every control, extremes, with the detectors run after each action.
// The engine takes a page and a `load` callback (navigate to the lesson fresh), so it drives the real dev server
// and the fixture pages of the self-test alike.
import { frameCount, seekFrame, sleep } from '../browser.mjs';
import { checkPhone } from '../phone.mjs';
import { readPicker, selectScene } from '../scenes.mjs';
import { gluedSentences, CODE_PLACEHOLDER } from '../../../src/core/testing/glue.ts';
import { describeAction, isKeyPress, planActions } from './actions.mjs';
import { CALL_TIMEOUT_MS, createPageApi } from './controls.mjs';
import { addFinding, createResult } from './report.mjs';
import { classifyConsole, focusDropped, frozenPlayer, MIN_TEXT_PX, scanResidue, withoutTypedResidue } from './scan.mjs';

export const DEFAULT_OPTIONS = {
  /** Idle time per scene with the console watched (render loops need seconds to hit React's limit). */
  idleMs: 3000,
  /** Actions per scene before the sweep stops exercising it and says so. */
  maxActions: 400,
  /** Wall time per lesson before the control passes stop and the report says so (never a silent cut). */
  budgetMs: 300_000,
  /** Wait after each action before reading the page back. */
  settleMs: 120,
  /** Extremes and one click per control, a short idle: a pre-push check. */
  fast: false,
  /** Already at phone width: skip the temporary 390 px resize for the layout and text-size checks. */
  mobile: false,
  /** How long to wait for a scene picker before concluding a lesson has one scene. */
  pickerWaitMs: 4000,
  /** How long a started player gets to move its frame counter (three intervals at 1x). */
  playerWaitMs: 3500,
  /** How long one call into the page may take before it counts as hung. */
  callTimeoutMs: CALL_TIMEOUT_MS,
};
const PHONE = { width: 390, height: 844 };
/** Controls enumerated per pass at most: a runaway list (a control that spawns controls) must not loop forever. */
const MAX_CONTROLS_PER_PASS = 200;
const PLACEHOLDER_CAPTION = 'Press play, or poke';

/**
 * Sweep one lesson. `load()` navigates to it fresh at its default scene; `obs` is the page's observer
 * (observe.mjs). Returns the lesson's result (findings and tallies); never throws for a lesson defect, only for a
 * hung page, which it records as a finding first.
 */
export async function sweepLesson({ page, obs, id, load, options = {} }) {
  const o = { ...DEFAULT_OPTIONS, ...options, ...(options.fast && options.idleMs === undefined ? { idleMs: 1000 } : {}) };
  const api = createPageApi(page, o.callTimeoutMs);
  const result = createResult(id);
  const where = { scene: '', control: '', action: '' };
  const add = (kind, detail, over = {}) => addFinding(result, { ...where, ...over, kind, detail });
  const started = Date.now();

  /** Console, page errors and requests heard since the last look, as findings. */
  const drainEvents = () => {
    for (const e of obs.drain()) {
      if (e.source === 'request') add('off-page-request', e.text);
      else {
        const kind = classifyConsole(e.text);
        if (kind) add(kind, `${e.source === 'pageerror' ? 'uncaught: ' : ''}${e.text}`);
      }
    }
  };

  /** Settle, then run every per-action detector. `focusBefore` is what prepare() said about the acted-on control. */
  async function check(focusBefore) {
    await sleep(o.settleMs);
    drainEvents();
    const snap = await api.call('observe', CODE_PLACEHOLDER);
    if (focusDropped(focusBefore, snap.focus)) add('focus-dropped', `keyboard focus fell to ${snap.focus.where}`);
    if (snap.crash) {
      add('error-boundary', snap.crash);
      return { crashed: true, snap };
    }
    for (const hit of scanResidue(withoutTypedResidue(snap.text, typedResidue))) add('residue', `${hit.rule}: "${hit.context}"`);
    const caption = snap.caption.text;
    if (caption && !result.captionSet.has(caption)) {
      result.captionSet.add(caption);
      result.captions++;
      for (const glued of gluedSentences(snap.caption.prose)) add('glued-caption', `"${glued}" in caption "${caption.slice(0, 60)}"`);
    }
    return { crashed: false, snap };
  }

  let scenes = [];
  let group = -1;
  /** Hostile inputs that look like residue themselves ("NaN") and so are legitimately echoed back ("'NaN' isn't a seed"). */
  const typedResidue = new Set();
  /** Load the lesson fresh and select scene `index`. */
  async function fresh(index) {
    typedResidue.clear();
    await load();
    if (scenes.length > 1 && !(await selectScene(page, group, index))) add('driver', `could not click scene tab "${scenes[index]}"`);
  }
  async function recover(index) {
    await fresh(index);
    await check();
  }

  async function perform(control, action) {
    where.control = control.label;
    where.action = describeAction(action);
    const prep = await api.call('prepare', control, group);
    if (!prep.ok) return { gone: true };
    result.actions++;
    if (isKeyPress(action)) result.keyPresses++;
    if (action.type === 'click') await api.call('click', control, group);
    else if (action.type === 'key') await page.keyboard.press(action.key);
    else if (action.type === 'set') await api.call('set', control, group, action.value);
    else if (action.type === 'select') await api.call('select', control, group, action.value);
    else if (action.type === 'text') {
      if (scanResidue(action.value).length) typedResidue.add(action.value);
      await api.call('set', control, group, action.value);
      await page.keyboard.press('Enter');
    }
    return check(prep);
  }

  let sceneStartActions = 0;
  /** Which budget (actions per scene, or wall time per lesson) (actions or wall time) is used up, as the report words it; null while within both. */
  const budgetSpent = () => {
    if (result.actions - sceneStartActions >= o.maxActions) return `${o.maxActions} actions in scene "${where.scene}" (--max-actions)`;
    if (Date.now() - started >= o.budgetMs) return `${Math.round(o.budgetMs / 1000)} s (--budget)`;
    return null;
  };

  async function exercise(index, { reverse }) {
    const first = await api.call('enumerate', group);
    const count = Math.min(first.length, MAX_CONTROLS_PER_PASS);
    for (let i = 0; i < count; i++) {
      const list = i === 0 ? first : await api.call('enumerate', group);
      const control = list[reverse ? Math.min(count - 1 - i, list.length - 1) : i];
      if (!control) break;
      if (!reverse) result.controls++;
      for (const action of planActions(control, { fast: o.fast, reverse })) {
        const spent = budgetSpent();
        if (spent) {
          result.budget ??= spent;
          return;
        }
        let outcome;
        try {
          outcome = await perform(control, action);
        } catch (err) {
          if (/page unresponsive/.test(err.message)) throw err;
          add('driver', `${err.message.split('\n')[0]}`);
          await recover(index);
          break;
        }
        if (outcome.gone) break;
        if (outcome.crashed) {
          await recover(index);
          break;
        }
      }
    }
  }

  /** Narrow the viewport to a phone, look for clipped content, overflow and tiny text, and put it back. */
  async function phoneChecks() {
    where.control = '(390 px layout)';
    where.action = '';
    const original = page.viewport();
    if (!o.mobile) {
      await page.setViewport({ ...original, ...PHONE });
      await sleep(500);
    }
    const phone = await checkPhone(page);
    if (phone.clipped.length) add('phone-layout', `content clipped by the stage frame: ${phone.clipped.join(', ')}`);
    if (await api.call('overflowX')) add('phone-layout', 'page scrolls sideways (horizontal overflow)');
    const small = await api.call('smallText', MIN_TEXT_PX);
    if (small.length) add('small-text', `${small[0].px}px ("${small[0].text}") is under ${MIN_TEXT_PX}px`);
    if (!o.mobile) {
      await page.setViewport(original);
      await sleep(300);
    }
  }

  /** Play, wait three intervals, expect the counter to move; then step, and scrub to the last and first frames. */
  async function playerChecks(index) {
    const start = (await api.call('observe', CODE_PLACEHOLDER)).player;
    if (!start) return;
    where.control = 'step player';
    where.action = 'Play';
    if (!start.playing) await api.call('clickPlayer', 'Play');
    await sleep(300);
    const before = (await api.call('observe', CODE_PLACEHOLDER)).player;
    await sleep(o.playerWaitMs);
    const after = (await api.call('observe', CODE_PLACEHOLDER)).player;
    if (frozenPlayer({ before: before.counter, after: after.counter, atEnd: after.atEnd })) {
      add('frozen-player', `frame counter stuck at ${after.counter.replace(/\s+/g, '')} for ${o.playerWaitMs} ms after Play`);
    }
    if ((await check()).crashed) return recover(index);
    if (after.playing || (await api.call('observe', CODE_PLACEHOLDER)).player.playing) await api.call('clickPlayer', 'Pause');
    where.action = 'step forward';
    result.actions++;
    await api.call('clickPlayer', 'Step forward');
    if ((await check()).crashed) return recover(index);
    const frames = await frameCount(page);
    for (const frame of [frames - 1, 0]) {
      where.action = `scrub to frame ${frame + 1}`;
      result.actions++;
      await seekFrame(page, frame);
      if ((await check()).crashed) return recover(index);
    }
    return undefined;
  }

  try {
    await load();
    const read = await readPicker(page, o.pickerWaitMs);
    const hasPicker = read.picker && read.picker.options.length >= 2;
    scenes = hasPicker ? read.picker.options : ['(only scene)'];
    group = hasPicker ? read.group : -1;
    for (let s = 0; s < scenes.length; s++) {
      where.scene = scenes[s];
      sceneStartActions = result.actions;
      where.control = '(load)';
      where.action = 'select scene';
      await fresh(s);
      await check();
      where.control = '(idle)';
      where.action = `${o.idleMs} ms`;
      await sleep(o.idleMs);
      await check();
      await phoneChecks();
      await exercise(s, { reverse: false });
      if (!o.fast) {
        await fresh(s);
        await exercise(s, { reverse: true });
      }
      await fresh(s);
      await playerChecks(s);
      result.scenes++;
      const caption = (await api.call('observe', CODE_PLACEHOLDER)).caption.text;
      where.control = '(caption)';
      where.action = '';
      if (caption.startsWith(PLACEHOLDER_CAPTION) && result.actions > 0) add('caption-placeholder', `caption still says "${caption}" after interaction`);
    }
  } catch (err) {
    const hung = /page unresponsive/.test(err.message);
    add(hung ? 'unresponsive' : 'driver', err.message.split('\n')[0], { control: '(lesson)', action: '' });
    result.aborted = true;
  }
  result.ms = Date.now() - started;
  return result;
}
