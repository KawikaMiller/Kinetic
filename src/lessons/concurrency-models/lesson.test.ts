import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { sceneElements } from '../../core/testing/sceneKeys';
import { runFrames, runIntro, runSummary, switchRule } from './frames';
import lesson from './index';
import { CPU_MS, DEFAULT_PARAMS, FAULT_REQUEST, HOG_MS, IO_MS, RUNTIMES, outcomeOf, refusal, simulate, withoutFault, type Fault, type Params, type Runtime } from './model';
import { SCENES, SCENE_FAULT, openingFor } from './openings';
import { threadOracle } from './oracles';

const text = expectCaption;
const ROUND = 2 * CPU_MS + IO_MS;
const run = (over: Partial<Params>) => simulate({ ...DEFAULT_PARAMS, ...over });

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: 100 requests, 4 cores and a thread each take 126 ms with 100 threads and 100 MB; the event loop takes 201 ms on one thread, one core and 1 MB', () => {
    const open = openingFor('normal');
    expect(open).toMatchObject({ runtime: 'threads', requests: 100, cores: 4, pool: 100, fault: 'none' });
    const threads = simulate(open);
    // closed form: 100 first steps over 4 cores take 25 ms, then the 100 ms wait, then the last second step
    expect(threads.makespan).toBe(Math.ceil(100 / 4) * CPU_MS + IO_MS + CPU_MS);
    expect([threads.makespan, threads.peakConcurrent, threads.memoryMb]).toEqual([126, 100, 100]);
    const loop = simulate({ ...open, runtime: 'events' });
    // one thread: 100 first steps, the wait of the last one, its second step
    expect(loop.makespan).toBe(100 * CPU_MS + IO_MS + CPU_MS);
    expect([loop.makespan, loop.osThreads, loop.memoryMb, loop.peakCores]).toEqual([201, 1, 1, 1]);
    for (const piece of ['126 ms with 100 threads and 100 MB', '201 ms on 1 thread and 1 MB, with 1 core busy']) expect(lesson.tryThis[0]).toContain(piece);
  });

  it('try-this 2: 4 workers take 2,550 ms (25 rounds of 102 ms), 16 workers fewer, and 4 actors 126 ms', () => {
    const open = openingFor('normal');
    const pool = simulate({ ...open, runtime: 'csp' });
    expect(pool.makespan).toBe(25 * ROUND);
    const wide = simulate({ ...open, runtime: 'csp', workers: 16 });
    expect(wide.makespan).toBe(Math.max(...threadOracle(100, 16, 4)));
    expect(wide.makespan).toBeLessThan(pool.makespan);
    const actors = simulate({ ...open, runtime: 'actors' });
    expect(actors.makespan).toBe(Math.ceil(100 / 4) * CPU_MS + IO_MS + CPU_MS);
    for (const piece of ['take 2550 ms', `falls to ${wide.makespan} ms`, '126 ms with 4 actors']) expect(lesson.tryThis[1]).toContain(piece);
  });

  it('try-this 3: with a slow handler on threads the earliest other request finishes at 102 ms; on the event loop it finishes at 300 ms instead of 102', () => {
    const open = openingFor('slow');
    expect(open).toMatchObject({ runtime: 'threads', fault: 'hog' });
    expect(simulate(open).bystanderFinish).toBe(ROUND);
    const loop = simulate({ ...open, runtime: 'events' });
    // hand-worked: 6 first steps, the 200 ms one, the 93 first steps queued behind it ahead of any reply, then request 1's second step
    expect(loop.bystanderFinish).toBe(6 + HOG_MS + 93 + 1);
    expect(simulate(withoutFault({ ...open, runtime: 'events' })).bystanderFinish).toBe(ROUND);
    for (const piece of ['still finishes at 102 ms', 'finishes at 300 ms instead of 102 ms']) expect(lesson.tryThis[2]).toContain(piece);
  });

  it('try-this 4: a crash on threads fails 1 of 100, on the event loop ends the process at 7 ms with 0 finished, and with the safety net 99 finish', () => {
    const open = openingFor('crash');
    expect(open).toMatchObject({ runtime: 'threads', fault: 'crash', net: false });
    expect(simulate(open).finished).toBe(99);
    const loop = simulate({ ...open, runtime: 'events' });
    // the 7th first step ends at 7 ms, by hand, and nothing has finished by then
    expect([loop.finished, loop.makespan]).toEqual([0, FAULT_REQUEST * CPU_MS]);
    expect(simulate({ ...open, runtime: 'events', net: true }).finished).toBe(99);
    for (const piece of ['99 of 100 requests finish', '0 finish and the process ends at 7 ms', '99 finish.']) expect(lesson.tryThis[3]).toContain(piece);
  });

  it('try-this 5: zero workers is refused with the sentence that says nobody would receive, whatever the buffer', () => {
    const open = { ...openingFor('slow'), runtime: 'csp' as const, workers: 0 };
    expect(refusal(open)).toContain('Nobody to receive');
    expect(() => simulate(open)).toThrow('Nobody to receive');
    expect(lesson.tryThis[4]).toContain('nobody would receive');
  });
});

describe('captions across the runtime, fault, safety-net and size cross product', () => {
  const faults: Fault[] = ['none', 'hog', 'crash'];
  const cases: Params[] = [];
  for (const runtime of RUNTIMES.map((r) => r.id)) {
    for (const fault of faults) {
      for (const net of [false, true]) {
        for (const cores of [1, 4, 8]) {
          for (const requests of [10, 100]) cases.push({ ...DEFAULT_PARAMS, runtime, fault, net, cores, requests, workers: 4, buffer: 3, actors: 3, pool: 7 });
        }
      }
    }
  }

  it('the intro, every frame and the summary are clean sentences that quote the run', () => {
    expect(cases).toHaveLength(4 * 3 * 2 * 3 * 2);
    for (const p of cases) {
      const r = simulate(p);
      const base = simulate(withoutFault(p));
      const label = JSON.stringify(p);
      const intro = text(runIntro(r));
      expect(intro, label).toContain(`${p.requests} requests`);
      if (p.fault === 'hog') expect(intro, label).toContain(`${HOG_MS} ms of CPU`);
      if (p.fault === 'crash') expect(intro, label).toContain(p.net ? 'with the safety net on' : 'with no safety net');
      const summary = text(runSummary(r, base));
      expect(summary, label).toContain(`${r.finished} of ${p.requests} requests finished`);
      expect(summary, label).toContain(`${r.makespan} ms`);
      const frames = runFrames(r, base);
      expect(frames[0].now, label).toBe(0);
      expect(frames.at(-1)!.now, label).toBe(r.makespan);
      frames.forEach((f) => f.say && text(f.say));
    }
  });

  it('the fault milestones sit at the times the schedule has them: the slow handler starts and ends where its bar does, and the crash where the mark is', () => {
    for (const runtime of ['threads', 'events', 'actors', 'csp'] as Runtime[]) {
      const hog = run({ runtime, fault: 'hog', requests: 40, cores: 4, pool: 40, actors: 4, workers: 4 });
      const hogBars = hog.segs.filter((s) => s.hog);
      expect(hogBars.length, runtime).toBeGreaterThan(0);
      const start = Math.min(...hogBars.map((s) => s.start));
      const frames = runFrames(hog, simulate(withoutFault(hog.params)));
      const startFrame = frames.find((f) => f.say && text(f.say).includes('starts its'))!;
      expect(startFrame.now, runtime).toBe(start);
      expect(text(startFrame.say), runtime).toContain(outcomeOf(hog.params).text);
      const crash = run({ runtime, fault: 'crash', requests: 40, cores: 4, pool: 40, actors: 4, workers: 4 });
      const crashAt = crash.marks.find((m) => m.kind === 'crash')!.at;
      const crashFrame = runFrames(crash, simulate(withoutFault(crash.params))).find((f) => f.say && text(f.say).includes('crashes at'))!;
      expect(crashFrame.now, runtime).toBe(crashAt);
    }
  });

  it('the switch rule printed beside the count says what the model counts, for each runtime', () => {
    expect(switchRule({ ...DEFAULT_PARAMS, runtime: 'threads' })).toContain('one per block and per wake');
    expect(switchRule({ ...DEFAULT_PARAMS, runtime: 'csp' })).toContain('one per block and per wake');
    expect(switchRule({ ...DEFAULT_PARAMS, runtime: 'events' })).toContain('none');
    expect(switchRule({ ...DEFAULT_PARAMS, runtime: 'actors' })).toContain('none');
  });
});

describe('scenes', () => {
  it('every scene the Stage returns carries its own key', () => {
    const elements = sceneElements('concurrency-models');
    expect(elements.map((e) => e.component)).toEqual(['RunScene', 'RunScene', 'RunScene']);
    for (const element of elements) expect(element.keyed, element.component).toBe(true);
  });

  it('each scene opens on its own fault with OS threads and no safety net, as a pure function, and visiting every scene twice changes nothing', () => {
    const walk = () => SCENES.map((s) => openingFor(s));
    expect(walk()).toEqual(walk());
    for (const scene of SCENES) {
      const open = openingFor(scene);
      expect(open, scene).toMatchObject({ runtime: 'threads', fault: SCENE_FAULT[scene], net: false, requests: 100, cores: 4 });
      expect(openingFor(scene), scene).not.toBe(open);
    }
    expect(SCENES.map((s) => SCENE_FAULT[s])).toEqual(['none', 'hog', 'crash']);
  });

  it('every scene opens on a run the model can do, and each opening shows the fault it is named for', () => {
    expect(simulate(openingFor('normal')).failed).toBe(0);
    expect(simulate(openingFor('slow')).segs.some((s) => s.hog)).toBe(true);
    expect(simulate(openingFor('crash')).marks.some((m) => m.kind === 'crash')).toBe(true);
  });
});
