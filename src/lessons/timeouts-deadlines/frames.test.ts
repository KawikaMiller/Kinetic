import { describe, expect, it } from 'vitest';
import { decimal } from '../../core/format';
import { expectCaption } from '../../core/testing/captions';
import { attemptBars, chainBars, REFUSED_BAR } from './bars';
import { chainEvents, chainFrames, summaryCaption } from './frames';
import { HOPS, NORMAL_DB, runChain, runRetries, SLOW_ATTEMPT, SLOW_DB, type ChainParams, type ChainRun } from './model';

const settings: ChainParams[] = [];
for (const timeouts of [{ A: 5, B: 10, C: 30 }, { A: 3, B: 2, C: 1 }, { A: 1.5, B: 6, C: 6 }]) {
  for (const dbLatency of [NORMAL_DB, SLOW_DB]) for (const propagate of [false, true]) for (const queueB of [0, 1.7]) {
    settings.push({ patience: 2, timeouts, dbLatency, queueB, propagate });
  }
}
const sec = (x: number) => `${decimal(x, 2)} s`;

describe('captions follow the model', () => {
  it('every frame of every setting has a caption that reads cleanly', () => {
    for (const p of settings) {
      for (const f of chainFrames(runChain(p))) expect(expectCaption(f.say).length).toBeGreaterThan(20);
    }
  });

  it('events come in time order and the frames jump to each one', () => {
    for (const p of settings) {
      const run = runChain(p);
      const events = chainEvents(run);
      for (let i = 1; i < events.length; i++) expect(events[i].at).toBeGreaterThanOrEqual(events[i - 1].at);
      const frames = chainFrames(run);
      expect(frames).toHaveLength(events.length + 2);
      expect(frames[0].now).toBe(0);
      expect(frames.slice(1, -1).map((f) => f.now)).toEqual(events.map((e) => e.at));
      expect(frames.at(-1)!.now).toBe(run.end);
    }
  });

  it('the give-up caption names exactly the hops still working at that moment', () => {
    for (const p of settings.filter((s) => !s.propagate)) {
      const run = runChain(p);
      const working = run.hops.filter((h) => h.reached && !h.refused && h.start <= run.gaveUp && run.gaveUp < h.finish).map((h) => h.id);
      const frame = chainFrames(run)[chainEvents(run).findIndex((e) => e.kind === 'gave-up') + 1];
      const text = expectCaption(frame.say);
      expect(text).toContain('The user gives up');
      if (!working.length) expect(text).toContain('Nothing is still working');
      else for (const id of working) expect(text).toContain(id === 'DB' ? 'the database' : id);
    }
  });

  it('with propagation the deadline caption says every hop was given the time', () => {
    const run = runChain({ ...settings[0], propagate: true });
    const frame = chainFrames(run)[chainEvents(run).findIndex((e) => e.kind === 'gave-up') + 1];
    expect(expectCaption(frame.say)).toContain('Every hop was given this absolute time');
  });

  it('a finish caption quotes its own finish time, and a late success says so', () => {
    for (const p of settings) {
      const run = runChain(p);
      const events = chainEvents(run);
      const frames = chainFrames(run);
      events.forEach((e, i) => {
        if (e.kind !== 'finish') return;
        const h = run.hops.find((x) => x.id === e.hop)!;
        const text = expectCaption(frames[i + 1].say);
        if (h.refused) expect(text).toContain(sec(h.finish));
        else if (h.outcome === 'timeout') expect(text).toContain('times out');
        else if (h.outcome === 'deadline') expect(text).toContain('deadline exceeded');
        if (h.outcome === 'ok') {
          expect(text).toContain(sec(h.finish));
          expect(text.includes('reached nobody')).toBe(h.lateSuccess);
        }
        if (h.wasted > 0) expect(text).toContain(`${sec(h.wasted)} of its work came after nobody was waiting`);
        else expect(text).not.toContain('came after nobody was waiting');
      });
    }
  });

  it('a refusal caption appears only for a hop that refused, and says why', () => {
    const run = runChain({ patience: 2, timeouts: { A: 5, B: 10, C: 30 }, dbLatency: SLOW_DB, queueB: 1.7, propagate: true });
    const events = chainEvents(run);
    const frames = chainFrames(run);
    const reach = events.findIndex((e) => e.kind === 'reach' && e.hop === 'C');
    const text = expectCaption(frames[reach + 1].say);
    expect(text).toContain('refuses at once');
    expect(text).toContain('0.05 s of budget left');
    const reachA = events.findIndex((e) => e.kind === 'reach' && e.hop === 'A');
    expect(expectCaption(frames[reachA + 1].say)).not.toContain('refuses');
  });

  it('the summary quotes the wasted work and what the user saw', () => {
    for (const p of settings) {
      const run = runChain(p);
      const text = expectCaption(summaryCaption(run));
      expect(text).toContain(`${sec(run.totalWasted)} of work nobody was waiting for`);
      const verdict = { ok: 'good answer', error: 'got an error', 'gave-up': p.propagate ? 'deadline passed' : 'gave up' }[run.userSees];
      expect(text).toContain(verdict);
    }
  });

  it('the queue note appears only when B queued', () => {
    const queued = runChain({ ...settings[0], queueB: 1.7, propagate: true });
    const frames = chainFrames(queued);
    const events = chainEvents(queued);
    const reachB = events.findIndex((e) => e.kind === 'reach' && e.hop === 'B') + 1;
    expect(expectCaption(frames[reachB].say)).toContain("B's 1.7 s wait in its queue");
    const calm = chainFrames(runChain({ ...settings[0], propagate: true }));
    expect(calm.every((f) => !expectCaption(f.say).includes('wait in its queue'))).toBe(true);
  });
});

describe('the bars match the run', () => {
  const orphanTime = (run: ChainRun, now: number, id: string) =>
    chainBars(run, now).filter((b) => b.lane === id && b.id.endsWith('-orphan')).reduce((s, b) => s + (b.end - b.start), 0);

  it('when the run is over, each hop\'s red bar is exactly its wasted time', () => {
    for (const p of settings) {
      const run = runChain(p);
      for (const h of run.hops) expect(orphanTime(run, run.end + 1, h.id)).toBeCloseTo(h.wasted, 6);
    }
  });

  it('no bar is drawn past the cursor, and none before the hop started', () => {
    for (const p of settings) {
      const run = runChain(p);
      for (const now of [0, 0.5, 1, 2, 3, 4.4]) {
        for (const b of chainBars(run, now)) {
          const refused = b.id.endsWith('-refused');
          expect(b.end).toBeLessThanOrEqual(now + (refused ? REFUSED_BAR : 0) + 1e-9);
          const h = run.hops.find((x) => x.id === b.lane)!;
          expect(b.start).toBeGreaterThanOrEqual(h.arrive - 1e-9);
        }
      }
    }
  });

  it('a hop wears its outcome ring only once it has finished', () => {
    const run = runChain({ patience: 2, timeouts: { A: 1.5, B: 6, C: 6 }, dbLatency: SLOW_DB, queueB: 0, propagate: false });
    const a = run.hops[0];
    expect(chainBars(run, a.finish - 0.01).some((b) => b.lane === 'A' && b.ring === 'bad')).toBe(false);
    expect(chainBars(run, a.finish).some((b) => b.lane === 'A' && b.ring === 'bad' && b.label === 'timeout')).toBe(true);
  });

  it('every hop that was reached has a bar by the end of the run, and an idle hop has none', () => {
    const run = runChain({ patience: 2, timeouts: { A: 5, B: 10, C: 30 }, dbLatency: SLOW_DB, queueB: 1.7, propagate: true });
    const bars = chainBars(run, run.end + 1);
    for (const h of run.hops) expect(bars.some((b) => b.lane === h.id)).toBe(h.reached);
    expect(HOPS.filter((id) => bars.some((b) => b.lane === id))).toEqual(['A', 'B', 'C']);
  });

  it('the retry bars split at the deadline: before it blue, after it red', () => {
    const naive = runRetries('naive', { deadline: 2, attemptTimeout: 0.9, latencies: [SLOW_ATTEMPT] });
    const bars = attemptBars(naive, 2);
    const late = bars.filter((b) => b.tone === 'bad').reduce((s, b) => s + (b.end - b.start), 0);
    expect(late).toBeCloseTo(naive.afterDeadline, 6);
    const budgeted = attemptBars(runRetries('budgeted', { deadline: 2, attemptTimeout: 0.9, latencies: [SLOW_ATTEMPT] }), 2);
    expect(budgeted.some((b) => b.tone === 'orange')).toBe(true);
    expect(budgeted.every((b) => b.tone !== 'bad')).toBe(true);
  });
});
