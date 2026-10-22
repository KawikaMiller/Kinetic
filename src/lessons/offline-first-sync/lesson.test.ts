import { describe, expect, it } from 'vitest';
import { checkInvariants } from '../../core/distSim';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { faultCaption, listText, liveIntro, loopCaption, strategyCaption } from './captions';
import { HORIZON_MS, convergence, noSilentLoss, scheduleConfig } from './check';
import {
  LIVE_MAX_EDITS, airplaneWindows, initialFaults, initialLive, initialLoop, initialStrategy, liveAdd, liveEdit, liveRename, liveWait, parseNewTitle, parseRename, pickSchedule, pickStrategy, setDraft, toggleAirplane,
} from './init';
import lesson from './index';
import { buildCluster, type ScenarioConfig } from './nodes';
import { MAX_TITLE, STRATEGIES, type Strategy } from './ops';
import { runConfig } from './runs';
import {
  FAULTS_UNTIL_MS, FAULT_LIMITS, LIVE_STEP_MS, LOOP_LIMITS, LOOP_OUTAGE_FROM_MS, PRESETS, PRESET_UNTIL_MS, SKEW_PRESET_S, SKEW_STEP_S, SKEW_MAX_S, faultConfig, liveConfig, loopConfig, loopScript, loopUntil, presetConfig,
} from './scenarios';
import { BROKEN_SEED_ARRIVAL, BROKEN_SEED_LWW } from './seeds';
import { ackedAfter, countMarks, firstPullSince, itemMark, pushAttempts } from './status';

const clean = (node: unknown) => {
  const t = captionText(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const rename = (strategy: Strategy, skewSec = 0) => runConfig(presetConfig('rename', strategy, skewSec), PRESET_UNTIL_MS);

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: offline rename on the laptop is pending, the phone\'s tick confirmed and the replicas differ; back online both survive with no conflict', () => {
    let s = initialLive();
    const start = runConfig(liveConfig(s.script, airplaneWindows(s)), s.clock);
    expect(start.converged).toBe(true);
    expect(listText(start.views.server)).toBe('"Milk"');
    expect(itemMark(start.phone, 'phone:1')).toBe('confirmed');
    s = toggleAirplane(s, 'laptop');
    s = setDraft(s, 'laptop', 'Oat milk');
    s = liveRename(s, 'laptop', 0);
    s = liveEdit(s, 'phone', { kind: 'tick', pick: 0 });
    s = liveWait(s);
    const off = runConfig(liveConfig(s.script, airplaneWindows(s)), s.clock);
    expect(itemMark(off.laptop, 'phone:1')).toBe('pending');
    expect(itemMark(off.phone, 'phone:1')).toBe('confirmed');
    expect(off.converged).toBe(false);
    expect(off.laptop.airplane).toBe(true);
    s = toggleAirplane(s, 'laptop');
    s = liveWait(s);
    const back = runConfig(liveConfig(s.script, airplaneWindows(s)), s.clock);
    expect(back.converged).toBe(true);
    expect(listText(back.views.server)).toBe('"Oat milk" (done)');
    expect(back.views.server.conflicts).toHaveLength(0);
    const t = lesson.tryThis[0];
    expect(t).toContain('the laptop shows its rename pending');
    expect(t).toContain("the phone's tick is confirmed");
    expect(t).toContain('the replicas differ');
    expect(t).toContain('all three show "Oat milk" (done)');
    expect(t).toContain('(0 listed)');
  });

  it('try-this 2: last write wins agrees on "Soy milk" and loses 1 edit; merge lists 1 conflict and loses none; manual leaves the title undecided; arrival order on seed 0 ends different', () => {
    const s = initialStrategy();
    expect([s.strategy, s.schedule, s.skewSec]).toEqual(['lww', 'rename', 0]);
    const lww = rename('lww');
    expect([lww.converged, listText(lww.views.server), lww.lost.length, lww.views.server.conflicts.length]).toEqual([true, '"Soy milk"', 1, 0]);
    const merge = rename('merge');
    expect([merge.views.server.conflicts.length, merge.lost.length]).toEqual([1, 0]);
    expect(listText(rename('manual').views.server)).toBe('undecided');
    const picked = pickStrategy(s, 'arrival');
    expect([picked.schedule, picked.seed]).toEqual(['random', BROKEN_SEED_ARRIVAL]);
    const arrival = runConfig(scheduleConfig(picked.seed, 'arrival', true, picked.skewSec * 1000), HORIZON_MS);
    expect(arrival.converged).toBe(false);
    const t = lesson.tryThis[1];
    expect(t).toContain('the replicas agree on "Soy milk" and 1 acknowledged edit is lost with 0 conflicts listed');
    expect(t).toContain('Press "merge": 1 conflict listed in orange and 0 lost');
    expect(t).toContain('the title reads undecided');
    expect(t).toContain(`on seed ${BROKEN_SEED_ARRIVAL}, and the replicas end different`);
  });

  it('try-this 3: with the laptop 300 s ahead the earlier "Soy milk" wins, with no skew the later "Oat milk", and merge does not care', () => {
    const skew = PRESETS.find((p) => p.id === 'skew')!;
    expect(pickSchedule(initialStrategy(), 'skew').skewSec).toBe(SKEW_PRESET_S);
    expect(skew.skewSec).toBe(300);
    expect(SKEW_PRESET_S % SKEW_STEP_S).toBe(0);
    const skewed = runConfig(presetConfig('skew', 'lww', SKEW_PRESET_S), PRESET_UNTIL_MS);
    const unskewed = runConfig(presetConfig('skew', 'lww', 0), PRESET_UNTIL_MS);
    expect(listText(skewed.views.server)).toBe('"Soy milk"');
    expect(listText(unskewed.views.server)).toBe('"Oat milk"');
    const t = lesson.tryThis[2];
    expect(t).toContain('its clock is 300 s ahead, so "Soy milk" wins');
    expect(t).toContain('the later edit wins, "Oat milk"');
  });

  it('try-this 4: counter 2, 2, 2 with deduplication; more without it; a blank rename is refused and rolled back', () => {
    const f = initialFaults();
    expect([f.lossPct, f.dupPct, f.dedupe, f.blank]).toEqual([20, 40, true, false]);
    const on = runConfig(faultConfig(f, f.seed), FAULTS_UNTIL_MS);
    expect([on.views.phone.counter, on.views.laptop.counter, on.views.server.counter]).toEqual([2, 2, 2]);
    const off = runConfig(faultConfig({ ...f, dedupe: false }, f.seed), FAULTS_UNTIL_MS);
    for (const c of [off.views.phone.counter, off.views.laptop.counter, off.views.server.counter]) expect(c).toBeGreaterThan(2);
    const blank = runConfig(faultConfig({ ...f, blank: true }, f.seed), FAULTS_UNTIL_MS);
    expect(blank.laptop.notices).toHaveLength(1);
    expect(blank.views.server.counter).toBe(2);
    expect(blank.converged).toBe(true);
    const t = lesson.tryThis[3];
    expect(t).toContain('the counter reads 2, 2, 2 for 2 increments');
    expect(t).toContain(`Turn deduplication off: ${off.views.phone.counter}, ${off.views.laptop.counter}, ${off.views.server.counter}`);
    expect(t).toContain('the laptop shows 1 rolled-back edit, and the counter stays 2');
  });

  it('try-this 5: from the defaults, a 40 s outage with a 2 s cap pushes more and recovers sooner than a 30 s cap', () => {
    const l = initialLoop();
    expect([l.outageSec, l.edits, l.capSec]).toEqual([20, 3, 8]);
    const edits = loopScript(l.edits).map((x) => x.at);
    const at = (capSec: number) => {
      const c = { ...l, outageSec: 40, capSec };
      const run = runConfig(loopConfig(c, c.seed), loopUntil(c));
      return { attempts: pushAttempts(run.trace, 'laptop', edits), acked: ackedAfter(run.trace, 'laptop', LOOP_OUTAGE_FROM_MS + 40_000) };
    };
    const low = at(2);
    const high = at(30);
    expect(low.attempts.length).toBeGreaterThan(high.attempts.length);
    expect(low.acked!).toBeLessThan(high.acked!);
    // independent oracle: a push that left the laptop during the outage window is lost, afterwards it is delivered
    for (const a of low.attempts) expect(a.lost).toBe(a.at >= LOOP_OUTAGE_FROM_MS && a.at < LOOP_OUTAGE_FROM_MS + 40_000);
    const t = lesson.tryThis[4];
    expect(t).toContain('set the network outage to 40 s and the retry cap to 2 s');
    expect(t).toContain(`pushes ${low.attempts.length} times, ${low.attempts.filter((a) => a.lost).length} of them lost`);
    expect(t).toContain(`acknowledged at ${(low.acked! / 1000).toFixed(1)} s. Raise the cap to 30 s: ${high.attempts.length} pushes, ${high.attempts.filter((a) => a.lost).length} lost, acknowledged at ${(high.acked! / 1000).toFixed(1)} s`);
  });
});

describe('the sync loop, read from the trace', () => {
  it('during the outage every push is lost and the timer gaps stay within the backoff bounds, doubling until the cap (jitter: between half and all)', () => {
    const l = { ...initialLoop(), capSec: 8 };
    const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
    const attempts = pushAttempts(run.trace, 'laptop', loopScript(l.edits).map((x) => x.at));
    const outageEnd = LOOP_OUTAGE_FROM_MS + l.outageSec * 1000;
    for (const a of attempts.filter((x) => x.at < outageEnd)) expect(a.lost).toBe(true);
    const retries = attempts.filter((a) => a.why === 'timer' && a.at < outageEnd && a.gap !== null);
    expect(retries.length).toBeGreaterThan(3);
    for (const a of retries) expect(a.gap!).toBeLessThanOrEqual(8000 + 1);
    // later gaps sit at the cap's band, earlier ones are shorter
    const late = retries.slice(-2).map((a) => a.gap!);
    for (const g of late) expect(g).toBeGreaterThanOrEqual(4000 - 1);
  });
  it('after the outage the next push is delivered, its ack arrives, and the pull asks since the cursor it had', () => {
    const l = initialLoop();
    const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
    const outageEnd = LOOP_OUTAGE_FROM_MS + l.outageSec * 1000;
    const delivered = pushAttempts(run.trace, 'laptop', loopScript(l.edits).map((x) => x.at)).filter((a) => a.at >= outageEnd && !a.lost);
    expect(delivered.length).toBeGreaterThan(0);
    expect(delivered[0].ops).toBeGreaterThan(0);
    const since = firstPullSince(run.trace, 'laptop', outageEnd)!;
    expect(since).toBeGreaterThanOrEqual(0);
    expect(since).toBeLessThanOrEqual(run.server.log.length);
    expect(run.laptop.cursor).toBeGreaterThanOrEqual(since);
    expect(run.laptop.outbox).toEqual([]);
    expect(run.converged).toBe(true);
  });
  it('with no outage nothing is lost and the first push is acknowledged at once', () => {
    const l = { ...initialLoop(), outageSec: 0 };
    const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
    const attempts = pushAttempts(run.trace, 'laptop', loopScript(l.edits).map((x) => x.at));
    expect(attempts.every((a) => !a.lost)).toBe(true);
    expect(ackedAfter(run.trace, 'laptop', 0)!).toBeLessThan(2000);
  });
  it('the retry cap bounds every timer gap at every slider value', () => {
    for (const capSec of [LOOP_LIMITS.capSec.min, 8, LOOP_LIMITS.capSec.max]) {
      const l = { ...initialLoop(), capSec };
      const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
      const attempts = pushAttempts(run.trace, 'laptop', loopScript(l.edits).map((x) => x.at));
      for (const a of attempts.filter((x) => x.why === 'timer' && x.gap !== null && x.lost)) expect(a.gap!).toBeLessThanOrEqual(capSec * 1000 + 1);
    }
  });
});

describe('the pinned seeds hold under both skews, and the scene opens on them', () => {
  it('the lowest violating seed of arrival order (convergence) and of last write wins (no silent loss) is the constant, with the laptop clock at 0 and at 5 minutes', () => {
    for (const skew of [0, 300_000]) {
      const lowest = (strategy: Strategy, safety: ReturnType<typeof convergence>) => {
        for (let seed = 0; seed < 200; seed++) if (!checkInvariants(buildCluster(scheduleConfig(seed, strategy, true, skew) as ScenarioConfig), [safety], { until: HORIZON_MS }).ok) return seed;
        return -1;
      };
      expect(lowest('arrival', convergence('arrival')), `arrival ${skew}`).toBe(BROKEN_SEED_ARRIVAL);
      expect(lowest('lww', noSilentLoss('lww')), `lww ${skew}`).toBe(BROKEN_SEED_LWW);
    }
  });
  it('picking the broken mode opens on its seed; the other strategies keep the schedule and the seed; picking an example sets its skew', () => {
    const s = initialStrategy();
    expect(pickStrategy({ ...s, seed: 77 }, 'arrival').seed).toBe(BROKEN_SEED_ARRIVAL);
    expect(pickStrategy({ ...s, seed: 77, schedule: 'random' }, 'merge')).toMatchObject({ seed: 77, schedule: 'random', strategy: 'merge' });
    expect(pickSchedule({ ...s, skewSec: 120 }, 'rename').skewSec).toBe(0);
    expect(pickSchedule({ ...s, skewSec: 120 }, 'random').skewSec).toBe(120);
    expect(SKEW_MAX_S % SKEW_STEP_S).toBe(0);
  });
});

describe('captions are clean and true for every strategy, example and fault setting', () => {
  it('strategy captions: agreement, lost count and conflict count match the run, for every strategy on every example and the random schedule', () => {
    for (const strategy of STRATEGIES.map((x) => x.id)) {
      for (const p of PRESETS) {
        const run = runConfig(presetConfig(p.id, strategy, p.skewSec), PRESET_UNTIL_MS);
        const t = clean(strategyCaption(run, strategy));
        expect(t.includes('end with the same list')).toBe(run.converged);
        expect(t.includes('end different')).toBe(!run.converged);
        if (run.lost.length > 0) expect(t).toContain(`${run.lost.length} acknowledged edit`);
        else expect(t).toContain('No acknowledged edit was lost');
        const k = run.views.server.conflicts.length;
        expect(t.includes(`${k} conflict`)).toBe(k > 0);
      }
      clean(strategyCaption(runConfig(scheduleConfig(1, strategy, true, 0), HORIZON_MS), strategy));
    }
  });
  it('fault captions at the slider extremes name the counters from the replicas', () => {
    for (const dedupe of [true, false]) for (const lossPct of [FAULT_LIMITS.lossPct.min, FAULT_LIMITS.lossPct.max]) for (const dupPct of [0, FAULT_LIMITS.dupPct.max]) for (const delay of [FAULT_LIMITS.delay.min, FAULT_LIMITS.delay.max]) {
      const f = { ...initialFaults(), dedupe, lossPct, dupPct, delay, reorder: FAULT_LIMITS.reorder.max };
      const run = runConfig(faultConfig(f, f.seed), FAULTS_UNTIL_MS);
      const t = clean(faultCaption(run, dedupe));
      expect(t).toContain(`phone ${run.views.phone.counter}, laptop ${run.views.laptop.counter}, server ${run.views.server.counter}`);
      expect(t).toContain(`deduplication ${dedupe ? 'on' : 'off'}`);
    }
  });
  it('the live caption states pending and in-flight counts from the devices', () => {
    let s = initialLive();
    expect(clean(liveIntro(runConfig(liveConfig(s.script, airplaneWindows(s)), s.clock)))).toContain('Everything is confirmed');
    s = toggleAirplane(s, 'laptop');
    s = liveEdit(s, 'laptop', { kind: 'tick', pick: 0 });
    const run = runConfig(liveConfig(s.script, airplaneWindows(s)), s.clock);
    const t = clean(liveIntro(run));
    expect(t).toContain('Laptop: 1 edit pending');
    expect(t).toContain('(the laptop offline)');
    expect(countMarks(run.laptop).pending).toBe(1);
  });
  it('the loop caption reads the attempts, and says so when there were none', () => {
    expect(clean(loopCaption([], 20, null, null))).toContain('made no edit');
    const l = initialLoop();
    const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
    const attempts = pushAttempts(run.trace, 'laptop', loopScript(l.edits).map((x) => x.at));
    const t = clean(loopCaption(attempts, 20, 30_000, 4));
    expect(t).toContain(`pushed ${attempts.length} times`);
    expect(t).toContain('20 s outage');
    expect(t).toContain('since log position 4');
  });
  it('the loop caption says the retry waits grew only when the listed waits are non-decreasing, over 100 seeds, four outages and two caps', () => {
    let grew = 0;
    let jittery = 0;
    for (let seed = 0; seed < 100; seed++) for (const outageSec of [10, 20, 30, 40]) for (const capSec of [8, 30]) {
      const l = { ...initialLoop(), seed, outageSec, capSec };
      const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
      const editTimes = loopScript(l.edits).map((x) => x.at);
      const attempts = pushAttempts(run.trace, 'laptop', editTimes);
      // oracle from the raw trace: laptop pushes not at an edit time, timer to timer, for the pushes that were dropped
      const dropped = new Set(run.trace.filter((r) => r.kind === 'drop' && !r.dup).map((r) => r.msgId));
      const timers = run.trace.filter((r) => r.kind === 'send' && r.from === 'laptop' && r.payload?.type === 'push' && !editTimes.some((e) => Math.abs(e - r.t) < 1));
      const gaps = timers.flatMap((r, i) => (i > 0 && dropped.has(r.msgId) ? [r.t - timers[i - 1].t] : []));
      const text = clean(loopCaption(attempts, outageSec, 1000, 0));
      const listed = text.match(/retries (?:grew|rose only on average[^:]*): ((?:\d+\.\d s(?:, )?)+)/)?.[1]?.split(', ').filter(Boolean) ?? [];
      expect(listed, `seed ${seed} outage ${outageSec} cap ${capSec}`).toEqual((gaps.length > 1 ? gaps.slice(0, 6) : []).map((g) => `${(g / 1000).toFixed(1)} s`));
      const nonDecreasing = gaps.every((g, i) => i === 0 || g >= gaps[i - 1]);
      if (gaps.length > 1) {
        expect(text.includes('retries grew'), `grew ${seed} ${outageSec} ${capSec}`).toBe(nonDecreasing);
        if (nonDecreasing) grew++; else jittery++;
      }
    }
    expect(grew).toBeGreaterThan(0);
    expect(jittery).toBeGreaterThan(0);
  });
  it('with no outage the loop caption says none was lost and never mentions a 0 s outage', () => {
    const l = { ...initialLoop(), outageSec: 0 };
    const run = runConfig(loopConfig(l, l.seed), loopUntil(l));
    const t = clean(loopCaption(pushAttempts(run.trace, 'laptop', loopScript(l.edits).map((x) => x.at)), 0, 1000, 0));
    expect(t).toContain('none was lost');
    expect(t).not.toContain('0 s outage');
  });
});

describe('typed text and limits', () => {
  it('a new item\'s title: blank and over-long are refused with the reason, the limit is 40, and markup stays text', () => {
    expect(parseNewTitle('   ')).toEqual({ ok: false, error: 'Type a title for the new item first.' });
    expect(parseNewTitle('x'.repeat(MAX_TITLE + 1))).toMatchObject({ ok: false, error: expect.stringContaining('at most 40 characters; this one has 41') });
    expect(parseNewTitle('x'.repeat(MAX_TITLE))).toMatchObject({ ok: true });
    expect(parseNewTitle('  Milk  ')).toEqual({ ok: true, value: 'Milk' });
    expect(parseNewTitle('<b>hi</b>')).toEqual({ ok: true, value: '<b>hi</b>' });
    expect(parseNewTitle('x'.repeat(5000)).ok).toBe(false);
  });
  it('a rename may be blank (the server refuses it) but not over-long', () => {
    expect(parseRename('')).toEqual({ ok: true, value: '' });
    expect(parseRename('y'.repeat(41)).ok).toBe(false);
  });
  it('a refused add or rename changes nothing and says why; the list keeps at most 60 edits', () => {
    const s = initialLive();
    const bad = liveAdd(s, 'phone');
    expect(bad.script).toBe(s.script);
    expect(bad.note).toContain('Type a title');
    expect(bad.clock).toBe(s.clock);
    let big = s;
    for (let i = 0; i < LIVE_MAX_EDITS + 5; i++) big = liveEdit(big, 'phone', { kind: 'inc' });
    expect(big.script).toHaveLength(LIVE_MAX_EDITS);
    expect(big.note).toContain('at most 60 edits');
  });
  it('each press moves time on by its fixed step, and the wait by 3 s', () => {
    const s = initialLive();
    expect(liveEdit(s, 'phone', { kind: 'inc' }).clock - s.clock).toBe(LIVE_STEP_MS);
    expect(liveWait(s).clock - s.clock).toBe(3000);
    expect(toggleAirplane(s, 'laptop').clock - s.clock).toBe(LIVE_STEP_MS);
  });
  it('toggling airplane mode twice closes the window at the time of the second press', () => {
    let s = initialLive();
    s = toggleAirplane(s, 'laptop');
    const from = s.open.laptop!;
    s = liveWait(s);
    s = toggleAirplane(s, 'laptop');
    expect(s.open.laptop).toBeNull();
    expect(s.closed).toEqual([{ device: 'laptop', from, to: from + LIVE_STEP_MS + 3000 }]);
    expect(airplaneWindows(s)).toEqual(s.closed);
  });
});

describe('the scenes open in their own state, and hidden controls feed nothing', () => {
  it('each opening state is its own fresh object', () => {
    expect(initialLive()).not.toBe(initialLive());
    expect(initialFaults().seed).toBeGreaterThanOrEqual(0);
    expect(initialStrategy().strategy).toBe('lww');
    expect(initialLive().drafts).toEqual({ phone: '', laptop: '' });
  });
  it('the fault scene\'s blank-rename toggle and seed change nothing else when off: the counters agree with a run that never had the toggle', () => {
    const f = initialFaults();
    const a = runConfig(faultConfig(f, f.seed), FAULTS_UNTIL_MS);
    const b = runConfig(faultConfig({ ...f, blank: false }, f.seed), FAULTS_UNTIL_MS);
    expect(b.views).toEqual(a.views);
  });
  it('the live scene uses merge and a skew of nothing, so no clock reaches it', () => {
    const c = liveConfig([], []);
    expect([c.strategy, c.skewMs]).toEqual(['merge', 0]);
  });
});

describe('quiz facts come from the model', () => {
  it('the backoff question: the cap is 8 s and the distractors are 16, 1 and 4', () => {
    const q = lesson.quiz[4];
    expect(q.options).toEqual(['8 s', '16 s', '1 s', '4 s']);
    expect(q.answer).toBe(0);
  });
  it('the clock question: the skewed laptop edit wins under last write wins, the phone\'s under no skew', () => {
    expect(listText(rename('lww', 0).views.server)).toBe('"Soy milk"');
    const skewed = runConfig(presetConfig('skew', 'lww', SKEW_PRESET_S), PRESET_UNTIL_MS);
    expect(skewed.views.server.items[0].title).toBe('Soy milk');
  });
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});

describe('an edit that names an item the device does not hold yet is not turned into something else', () => {
  const titles = (r: ReturnType<typeof runConfig>) => ['phone', 'laptop', 'server'].flatMap((n) => r.views[n as 'phone'].items.map((i) => i.title));

  it('the blank rename, over the delay, reordering and loss sliders and several seeds: either it is rolled back or it is reported as not made, and no stray item appears', () => {
    let skippedRuns = 0;
    let rolledRuns = 0;
    for (const delay of [10, 500, 1500]) for (const reorder of [0, 750, 1500]) for (const lossPct of [0, 20, 60]) for (const seed of [1, 3, 7, 11]) {
      const r = runConfig(faultConfig({ ...initialFaults(), delay, reorder, lossPct, blank: true, seed }, seed), FAULTS_UNTIL_MS);
      const accountedFor = r.laptop.notices.length + r.laptop.skipped.length;
      expect(accountedFor, `delay ${delay} reorder ${reorder} loss ${lossPct} seed ${seed}`).toBe(1);
      skippedRuns += r.laptop.skipped.length;
      rolledRuns += r.laptop.notices.length;
      expect(titles(r).filter((t) => t !== 'Milk'), 'only Milk was ever added').toEqual([]);
    }
    expect(skippedRuns, 'the slow settings do reach the not-made case').toBeGreaterThan(0);
    expect(rolledRuns, 'and the quick ones the rolled-back case').toBeGreaterThan(0);
  });

  it('the not-made case says what happened in words and the card shows it', () => {
    const r = runConfig(faultConfig({ ...initialFaults(), delay: 10, reorder: 1500, lossPct: 20, blank: true, seed: 3 }, 3), FAULTS_UNTIL_MS);
    const note = r.laptop.skipped[0] ?? r.laptop.notices[0];
    expect(note).toMatch(/no item to rename yet|rolled back/);
  });

  it('the random schedules never invent an "Item N" row: an edit with nothing to edit is skipped and counted', () => {
    let skipped = 0;
    for (let seed = 0; seed < 200; seed++) {
      const r = runConfig(scheduleConfig(seed, 'merge', true, 0), HORIZON_MS);
      expect(titles(r).filter((t) => /^Item \d+$/.test(t ?? ''))).toEqual([]);
      skipped += r.phone.skipped.length + r.laptop.skipped.length;
    }
    expect(skipped).toBeGreaterThan(0);
  });
});
