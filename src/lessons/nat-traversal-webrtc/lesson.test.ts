import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { iceFrames, punchFrames, punchMessages, punchSummary, relayIntro, stunFrames } from './captions';
import { KIND_NAME, candidatePriority, checksMade, nominatedOf, pairNote, pairWorks, pairsOf, type Scenario } from './ice';
import { PRESETS, initialIce, initialPunch, initialRelay, initialStun, presetOf } from './init';
import lesson from './index';
import { NAT_NAME, NAT_TYPES, OFFSET_MAX, epText, matrix, punch, stunTable } from './nat';
import { CALLS, SHARE, latencies, relayLoad } from './relay';

const clean = (node: unknown) => {
  const t = captionText(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const allScenarios = (): Scenario[] => [
  ...NAT_TYPES.flatMap((a) => NAT_TYPES.map((b) => ({ a, b, sameLan: false }))),
  ...NAT_TYPES.flatMap((a) => NAT_TYPES.map((b) => ({ a, b, sameLan: true }))),
];

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: A learns 198.51.100.20:40000 and B 203.0.113.30:50000, one mapping each, and no frame sends a packet from A to B', () => {
    const s = initialStun();
    expect(epText(stunTable('A', s.a)[0].outside)).toBe('198.51.100.20:40000');
    expect(epText(stunTable('B', s.b)[0].outside)).toBe('203.0.113.30:50000');
    const frames = stunFrames(s.a, s.b);
    expect(frames[frames.length - 1].rows).toEqual({ A: 1, B: 1 });
    for (const f of frames) if (f.packet) expect(f.packet.path.includes('a') && f.packet.path.includes('b')).toBe(false);
    const t = lesson.tryThis[0];
    expect(t).toContain('A learns 198.51.100.20:40000 and B learns 203.0.113.30:50000');
    expect(t).toContain('no packet goes from A to B');
  });

  it('try-this 2: both home routers connect with 1 dropped probe of 4; B symmetric drops all 12; A restricted against B symmetric connects with 4 probes', () => {
    const s = initialPunch();
    expect([s.a, s.b, s.offset]).toEqual(['port-restricted', 'port-restricted', 0]);
    const p = punch(s.a, s.b, s.offset);
    expect(p.connected).toBe(true);
    expect(p.probes.map((x) => `${x.from}${x.delivered ? '+' : '-'}`)).toEqual(['A-', 'B+', 'A+', 'B+']);
    expect(p.probes[0].reason).toContain('never contacted');
    expect([p.dropped, p.probes.length]).toEqual([1, 4]);
    const hard = punch(s.a, 'symmetric', 0);
    expect([hard.connected, hard.probes.length, hard.dropped]).toEqual([false, 12, 12]);
    const soft = punch('restricted', 'symmetric', 0);
    expect([soft.connected, soft.probes.length]).toEqual([true, 4]);
    const t = lesson.tryThis[1];
    expect(t).toContain('connected with 1 dropped probe of 4');
    expect(t).toContain('all 12 probes are dropped');
    expect(t).toContain('(4 probes)');
  });

  it('try-this 3: symmetric by symmetric reads relay, 13 of 16 pairs punch, and the offset changes none of them', () => {
    const m = matrix();
    expect(m[3][3]).toBe(false);
    expect(m.flat().filter(Boolean)).toHaveLength(13);
    expect(matrix(3)).toEqual(m);
    expect(lesson.tryThis[2]).toContain('13 of 16 pairs punch');
    expect(lesson.tryThis[2]).toContain('3 ticks late');
  });

  it('try-this 4: the opening pair needs the relay: 90 ms against 30, 800 Mbit/s and 360 GB an hour at 1,000 calls and 20%; share 0 sends nothing', () => {
    const r = initialRelay();
    expect(punch(r.a, r.b).connected).toBe(false);
    expect(latencies()).toEqual({ direct: 30, relayed: 90, extra: 60 });
    const l = relayLoad(r.calls, r.share);
    expect([r.calls, r.share, l.egressMbps, l.gbPerHour]).toEqual([1000, 20, 800, 360]);
    expect(relayLoad(r.calls, 0).egressMbps).toBe(0);
    const t = lesson.tryThis[3];
    expect(t).toContain('port-restricted cone against symmetric');
    expect(t).toContain('90 ms one way instead of 30, 60 ms more');
    expect(t).toContain('1,000 calls with 20% relayed the relay sends 800 Mbit/s, 360 GB an hour');
  });

  it('try-this 5: home routers nominate host to server-reflexive after 2 checks, the same LAN host to host after 1, both symmetric host to relayed after 5', () => {
    const run = (sc: Scenario) => {
      const pairs = pairsOf(sc);
      return { n: checksMade(pairs).length, id: nominatedOf(pairs)?.id };
    };
    expect(run(initialIce())).toEqual({ n: 2, id: 'host-srflx' });
    expect(run(PRESETS.find((p) => p.id === 'lan')!.scenario)).toEqual({ n: 1, id: 'host-host' });
    expect(run(PRESETS.find((p) => p.id === 'symmetric')!.scenario)).toMatchObject({ id: 'host-relay' });
    const t = lesson.tryThis[4];
    expect(t).toContain('host to server-reflexive after 2 checks');
    expect(t).toContain('host to host after 1 check');
    expect(t).toContain(`host to relayed after ${run(PRESETS.find((p) => p.id === 'symmetric')!.scenario).n} checks`);
  });
});

describe('captions are clean and computed from the simulation', () => {
  it('STUN frames, for every pair of NAT types: 6 frames, the replies carry the address the NAT made', () => {
    for (const a of NAT_TYPES) for (const b of NAT_TYPES) {
      const frames = stunFrames(a, b);
      expect(frames).toHaveLength(6);
      frames.forEach((f) => clean(f.say));
      const replyA = clean(frames[2].say);
      expect(replyA).toContain(epText(stunTable('A', a)[0].outside));
      expect(clean(frames[5].say)).toContain('no packet from A went to B');
    }
  });

  it('hole-punching frames: one per signalling message and probe plus a summary, a dropped probe states the reason, for every pair and offset', () => {
    for (const a of NAT_TYPES) for (const b of NAT_TYPES) for (let offset = 0; offset <= OFFSET_MAX; offset++) {
      const p = punch(a, b, offset);
      const msgs = punchMessages(p);
      expect(msgs).toHaveLength(4 + p.probes.length);
      expect(new Set(msgs.map((m) => m.id)).size).toBe(msgs.length);
      const frames = punchFrames(p, a, b, offset);
      expect(frames).toHaveLength(msgs.length + 1);
      frames.forEach((f) => clean(f.say));
      p.probes.forEach((x, k) => {
        expect(msgs[4 + k].lost).toBe(!x.delivered);
        const text = clean(frames[4 + k].say);
        expect(text).toContain(x.delivered ? 'delivered' : `dropped by NAT ${x.from === 'A' ? 'B' : 'A'}`);
        if (!x.delivered) expect(text).toContain(x.reason!);
      });
      const summary = clean(punchSummary(p, a, b, offset));
      expect(summary.includes('connected')).toBe(p.connected);
      expect(summary.includes('no hole opens')).toBe(!p.connected);
      if (!p.connected) expect(summary).toContain(`All ${p.probes.length} probes were dropped`);
    }
  });

  it('relay captions at the slider extremes name the path from the simulation', () => {
    for (const connected of [true, false]) for (const share of [SHARE.min, SHARE.initial, SHARE.max]) for (const calls of [CALLS.min, CALLS.max]) {
      const t = clean(relayIntro(connected, calls, share));
      expect(t.includes('directly')).toBe(connected);
      expect(t.includes('TURN relay')).toBe(!connected);
    }
  });

  it('ICE frames, for every NAT pair and LAN setting: a check per pair down to the nominated one, then a summary naming it', () => {
    for (const sc of allScenarios()) {
      const pairs = pairsOf(sc);
      const made = checksMade(pairs);
      const frames = iceFrames(pairs, made, sc);
      expect(frames).toHaveLength(made.length + 2);
      frames.forEach((f) => clean(f.say));
      const win = nominatedOf(pairs)!;
      const last = clean(frames[frames.length - 1].say);
      expect(last).toContain(`${KIND_NAME[win.local.kind]} to ${KIND_NAME[win.remote.kind]}`);
      expect(last).toContain(`after ${made.length} check`);
      expect(frames[frames.length - 1].checked).toBe(made.length);
    }
  });

  it('every pair note agrees with whether the pair works', () => {
    for (const sc of allScenarios()) {
      for (const p of pairsOf(sc)) {
        const note = pairNote(p.local.kind, p.remote.kind, sc);
        expect(note.length).toBeGreaterThan(10);
        expect(pairWorks(p.local.kind, p.remote.kind, sc)).toBe(p.works);
        if (p.works) expect(note).not.toMatch(/cannot|drops|does not/);
        else expect(note).toMatch(/cannot|drops|does not/);
      }
    }
  });
});

describe('the scenes open in their own state', () => {
  it('each opening state is its own, and the presets agree with the pickers', () => {
    expect(initialStun()).toEqual({ a: 'port-restricted', b: 'port-restricted' });
    expect(initialPunch().offset).toBe(0);
    expect(initialRelay()).toMatchObject({ calls: 1000, share: 20 });
    expect(initialIce()).not.toBe(initialIce());
    expect(presetOf(initialIce())).toBe('home');
    for (const p of PRESETS) expect(presetOf(p.scenario)).toBe(p.id);
    expect(presetOf({ a: 'full', b: 'full', sameLan: false })).toBeNull();
  });

  it('the names the scenes show are the RFC 3489 aliases of the four NAT types', () => {
    expect(NAT_TYPES.map((t) => NAT_NAME[t])).toEqual(['full cone', 'restricted cone', 'port-restricted cone', 'symmetric']);
  });
});

describe('quiz facts come from the model', () => {
  it('the priority answer is the host candidate formula, and the distractors are the server-reflexive, component-2 and relayed values', () => {
    const q = lesson.quiz[4];
    expect(q.options[q.answer]).toBe(String(candidatePriority('host', 65535, 1)));
    expect(q.options).toContain(String(candidatePriority('srflx')));
    expect(q.options).toContain(String(candidatePriority('host', 65535, 2)));
    expect(q.options).toContain(String(candidatePriority('relay')));
  });

  it('the matrix question: symmetric against port-restricted fails, symmetric against restricted works, the other two options work', () => {
    const m = matrix();
    const at = (a: number, b: number) => m[a][b];
    expect(at(3, 2)).toBe(false);
    expect(at(3, 1)).toBe(true);
    expect(at(0, 2)).toBe(true);
    expect(at(1, 2)).toBe(true);
  });

  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
