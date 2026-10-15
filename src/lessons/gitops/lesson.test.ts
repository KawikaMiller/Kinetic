import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { liveCaption, scriptCaption, trapCaption } from './captions';
import { DESIRED_START, diffLines, hasDrift, type State } from './reconcile';
import { SCRIPT_END, runScript, verdict } from './script';
import { TRAP_INTERVAL, commit, failingShare, initWorld, manual, setPaused, tick, toNextRun } from './world';

const web = (n: number): State => ({ ...DESIRED_START, web: { ...DESIRED_START.web, replicas: n } });

describe('try-this entries, from the default state, as written', () => {
  it('try-this 1: web + + then Commit shows 3 to 5 replicas in the diff, and one tick makes the cluster match', () => {
    let w = commit(initWorld(), web(5));
    expect(diffLines(w.desired, w.live, w.prune).map((l) => l.text)).toEqual(['- web: web:v1, 3 replicas', '+ web: web:v1, 5 replicas']);
    w = tick(w);
    expect(w.live.web.replicas).toBe(5);
    expect(w.log.filter((e) => e.text.startsWith('controller:'))).toHaveLength(1);
  });

  it('try-this 2: deleting the service, then going to the next sync (a 10 second interval) recreates it with 9 seconds out of sync', () => {
    const w = toNextRun(manual(initWorld({ interval: 10 }), 'web-svc', null, 'delete web-svc'));
    expect(w.live['web-svc']).toEqual(DESIRED_START['web-svc']);
    expect(w.driftSeconds).toBe(9);
    expect(hasDrift(w.desired, w.live, w.prune)).toBe(false);
  });

  it('try-this 3: with auto-sync off a hand-made replica stays, and the log says out of sync once', () => {
    let w = manual(initWorld({ interval: 10, autoSync: false }), 'web', { ...DESIRED_START.web, replicas: 4 }, 'add a replica to web');
    for (let i = 0; i < 25; i++) w = tick(w);
    expect(w.live.web.replicas).toBe(4);
    expect(w.log.filter((e) => e.text.startsWith('out of sync'))).toHaveLength(1);
  });

  it('try-this 4: at the spike 67% fail with 3 replicas, 0% with 10 by hand, 67% again once the controller reverts it, and 0% if 10 is committed', () => {
    expect(failingShare(DESIRED_START, true)).toBeCloseTo(2 / 3, 10);
    let w = manual(initWorld({ interval: TRAP_INTERVAL }), 'web', { ...DESIRED_START.web, replicas: 10 }, 'scale web to 10');
    expect(failingShare(w.live, true)).toBe(0);
    for (let i = 0; i < TRAP_INTERVAL; i++) w = tick(w);
    expect(failingShare(w.live, true)).toBeCloseTo(2 / 3, 10);
    let c = commit(manual(initWorld({ interval: TRAP_INTERVAL }), 'web', { ...DESIRED_START.web, replicas: 10 }, 'x'), web(10));
    for (let i = 0; i < 3 * TRAP_INTERVAL; i++) c = tick(c);
    expect(failingShare(c.live, true)).toBe(0);
    expect(expectCaption(trapCaption(w, true))).toContain('67% of requests fail');
  });

  it('try-this 5: the edge-triggered controller that restarts ends wrong on api and web-svc, and the level-triggered one ends right', () => {
    const edge = runScript({ handler: 'edge', restart: true, prune: true })[SCRIPT_END];
    expect(verdict(edge.desired, edge.live).wrong).toEqual(['api', 'web-svc']);
    const level = runScript({ handler: 'level', restart: true, prune: true })[SCRIPT_END];
    expect(verdict(level.desired, level.live).matches).toBe(true);
    expect(expectCaption(scriptCaption({ ...edge, notes: [] }, 'edge'))).toContain('ends, and api and web-svc are wrong');
  });
});

describe('captions are read from the state', () => {
  it('says live matches git at the start, and what the controller will do and when once it drifts', () => {
    expect(expectCaption(liveCaption('loop', initWorld()))).toContain('Live matches git');
    const w = manual(initWorld({ interval: 10 }), 'web', { ...DESIRED_START.web, replicas: 9 }, 'scale web to 9');
    const text = expectCaption(liveCaption('drift', w));
    expect(text).toContain('1 change between git and live');
    expect(text).toContain('update web: web:v1, 3 replicas in 10 s');
  });

  it('says what pausing and switching auto-sync off mean: nothing will change the drift, or it is only reported', () => {
    const drifted = manual(initWorld({ interval: 10 }), 'api', null, 'delete api');
    expect(expectCaption(liveCaption('drift', setPaused(drifted, true)))).toContain('sync is paused');
    expect(expectCaption(liveCaption('drift', { ...drifted, autoSync: false }))).toContain('only reports it');
  });

  it('counts paused drift as unnoticed seconds in the trap caption', () => {
    let w = setPaused(manual(initWorld({ interval: TRAP_INTERVAL }), 'web', { ...DESIRED_START.web, replicas: 10 }, 'x'), true);
    for (let i = 0; i < 4; i++) w = tick(w);
    expect(expectCaption(trapCaption(w, false))).toContain('paused for 4 s');
  });

  it('writes a caption for the first, a middle and the last second of the script', () => {
    const frames = runScript({ handler: 'edge', restart: true, prune: true });
    expect(expectCaption(scriptCaption(frames[0], 'edge'))).toContain('Second 0: nothing happens');
    expect(expectCaption(scriptCaption(frames[3], 'edge'))).toContain('someone deletes web-svc by hand');
    expect(expectCaption(scriptCaption(frames[SCRIPT_END], 'level'))).toContain('Second 16');
  });
});
