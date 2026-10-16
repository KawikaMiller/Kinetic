import { describe, expect, it } from 'vitest';
import { captionText as text } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { deliveryText, earlyIntro, earlyRunOf, firstBytes, handshakeFrames, holIntro, migrateFrames, msText } from './captions';
import { MAX_REPLAYS, POLICIES, REQUESTS, runEarly } from './earlyData';
import { STACKS, schedule, timelineEnd } from './flights';
import { DEFAULT_LAYOUT, holRun, summariseHol } from './hol';
import {
  DEFAULT_RTT, DEFAULT_THINK, PRESETS, RTT_RANGE, THINK_RANGE, applyPreset, initialEarly, initialHandshake, initialHol, initialMigrate, replay,
} from './init';
import lesson from './index';
import { SWITCH_AT_MS, recover } from './migration';

const clean = (node: unknown) => {
  const t = text(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};
const slider = (r: { min: number; max: number; step: number }) => {
  const out: number[] = [];
  for (let v = r.min; v <= r.max; v += r.step) out.push(v);
  return out;
};

describe('presets and sliders agree', () => {
  it('every preset round trip lies on the Round trip slider (min + k * step), so the thumb shows what the model runs', () => {
    for (const p of PRESETS) {
      const k = (Math.min(p.rttMs, RTT_RANGE.max) - RTT_RANGE.min) / RTT_RANGE.step;
      expect(Number.isInteger(k), `${p.id} ${p.rttMs} ms`).toBe(true);
    }
  });
});

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: at 100 ms and 20 ms the request leaves at 300, 200, 100, 0 ms and the first byte comes at 420, 320, 220, 120 ms; same city shrinks the gap to 45 ms', () => {
    const s = initialHandshake();
    expect([s.rttMs, s.thinkMs, s.stack]).toEqual([100, 20, 'quic']);
    expect(STACKS.map((x) => schedule(x, 100, 20).requestAt)).toEqual([300, 200, 100, 0]);
    expect(firstBytes(100, 20)).toEqual([420, 320, 220, 120]);
    const city = firstBytes(15, 20);
    expect(city[0] - city[3]).toBe(45);
    const t = lesson.tryThis[0];
    expect(t).toContain('300 ms, 200 ms, 100 ms, 0 ms');
    expect(t).toContain('420 ms, 320 ms, 220 ms, 120 ms');
    expect(t).toContain('shrinks to 45 ms');
    expect(t).toContain('"same city (RTT 15 ms)"');
  });

  it('try-this 2: one replay makes 2 charges; the safe-only policy retries once and moves the first byte from 120 to 220 ms; a key keeps 1 charge and 120 ms', () => {
    const s = replay(initialEarly());
    expect([s.request, s.policy, s.replays]).toEqual(['post', 'accept', 1]);
    expect(earlyRunOf(s, 20).applied).toBe(2);
    expect(earlyRunOf({ ...s, policy: 'idempotent-only' }, 20)).toMatchObject({ applied: 1, retried: true, firstByteMs: 220 });
    expect(earlyRunOf({ ...s, policy: 'idempotency-key' }, 20)).toMatchObject({ applied: 1, retried: false, firstByteMs: 120 });
    const t = lesson.tryThis[1];
    expect(t).toContain('"Charges made" reads 2');
    expect(t).toContain('from 120 ms to 220 ms');
    expect(t).toContain('1 charge and the first byte returns to 120 ms');
  });

  it('try-this 3: packet 6 lost delays 4 of 4 over TCP and 1 over QUIC; packet 2 lost delays 4 and 1 again', () => {
    expect(initialHol().lost).toEqual([5]);
    const a = summariseHol(holRun(DEFAULT_LAYOUT, [5], 100));
    const b = summariseHol(holRun(DEFAULT_LAYOUT, [1], 100));
    expect([a.tcpDelayed, a.quicDelayed, b.tcpDelayed, b.quicDelayed]).toEqual([4, 1, 4, 1]);
    const t = lesson.tryThis[2];
    expect(t).toContain('TCP delays 4 of 4 streams and QUIC 1');
    expect(t).toContain('TCP still delays 4 of 4 and QUIC 1');
  });

  it('try-this 4: TCP stalls 1300 ms, QUIC 100 ms, and 600 ms with UDP blocked', () => {
    const s = initialMigrate();
    expect([s.rttMs, s.udpBlocked]).toEqual([100, false]);
    expect([recover('tcp', 100, false).stallMs, recover('quic', 100, false).stallMs, recover('quic', 100, true).stallMs]).toEqual([1300, 100, 600]);
    const t = lesson.tryThis[3];
    expect(t).toContain('TCP stalls 1300 ms, QUIC 100 ms');
    expect(t).toContain('QUIC stalls 600 ms');
    expect(t).toContain('"blocks UDP"');
  });

  it('try-this 5: the satellite preset sets the slider to its 300 ms top and the first byte comes at 1220 ms against 320 ms', () => {
    const p = PRESETS.find((x) => x.id === 'satellite');
    expect(p?.rttMs).toBe(RTT_RANGE.max);
    expect(applyPreset(initialHandshake(), p as NonNullable<typeof p>).rttMs).toBe(300);
    const fb = firstBytes(300, 20);
    expect([fb[0], fb[3]]).toEqual([1220, 320]);
    const t = lesson.tryThis[4];
    expect(t).toContain('1220 ms for TCP + TLS 1.2 and 320 ms for QUIC 0-RTT, 900 ms apart');
  });
});

describe('scene 1: every round trip and think time at the slider extremes', () => {
  it('frames are clean, end on the slowest first byte, and carry both milestones of the chosen stack', () => {
    for (const rttMs of [RTT_RANGE.min, DEFAULT_RTT, RTT_RANGE.max]) {
      for (const thinkMs of [THINK_RANGE.min, DEFAULT_THINK, THINK_RANGE.max]) {
        for (const stack of STACKS) {
          const frames = handshakeFrames({ rttMs, thinkMs, stack, note: null });
          frames.forEach((f) => clean(f.say ?? ''));
          expect(frames[frames.length - 1].now).toBeCloseTo(timelineEnd(rttMs, thinkMs), 9);
          const said = frames.filter((f) => f.say !== undefined).map((f) => clean(f.say));
          expect(said.some((t) => t.includes(`at ${msText(schedule(stack, rttMs, thinkMs).firstByteAt)}`))).toBe(true);
        }
      }
    }
  });

  it('a think time of 0 drops the think-time clause, and the summary names the saving from the same numbers as the stat', () => {
    const t = clean(handshakeFrames({ ...initialHandshake(), thinkMs: 0 }).filter((f) => f.say !== undefined).map((f) => clean(f.say)).find((x) => x.includes('first byte of the response')));
    expect(t).not.toContain('think time');
    const fb = firstBytes(100, 20);
    expect(clean(handshakeFrames(initialHandshake()).at(-1)?.say)).toContain(`QUIC 0-RTT is ${msText(fb[0] - fb[3])} sooner`);
  });
});

describe('scene 2: the whole control cross product', () => {
  it('every request, policy and replay count has a clean caption that states the work done and the retry honestly', () => {
    for (const request of REQUESTS) {
      for (const policy of POLICIES) {
        for (let replays = 0; replays <= MAX_REPLAYS; replays++) {
          const s = { ...initialEarly(), request, policy, replays };
          const run = earlyRunOf(s, DEFAULT_THINK);
          const t = clean(earlyIntro(s, run));
          expect(t).toContain(`${run.applied} ${run.applied === 1 ? 'time' : 'times'}`);
          expect(t.includes('charged more than once')).toBe(request === 'post' && run.applied > 1);
          expect(t.includes('refused request was sent again')).toBe(run.retried);
          run.deliveries.forEach((d) => clean(deliveryText(d)));
        }
      }
    }
  });

  it('the replay button stops at the maximum and does not go past it', () => {
    let s = initialEarly();
    for (let i = 0; i < MAX_REPLAYS + 3; i++) s = replay(s);
    expect(s.replays).toBe(MAX_REPLAYS);
  });

  it('the round trip changes the first byte only, never the number of times the work is done', () => {
    for (const request of REQUESTS) for (const policy of POLICIES) {
      const counts = slider(RTT_RANGE).map((r) => runEarly(request, policy, 2, r, 20).applied);
      expect(new Set(counts).size).toBe(1);
    }
  });
});

describe('scene 3: every lost-packet choice', () => {
  it('every single lost packet gives a clean caption naming that packet, and QUIC never delays more streams than TCP', () => {
    for (let k = 0; k < DEFAULT_LAYOUT.packets.length; k++) {
      for (const rttMs of [RTT_RANGE.min, RTT_RANGE.max]) {
        const s = { rttMs, lost: [k] };
        const t = clean(holIntro(DEFAULT_LAYOUT, s));
        expect(t).toContain(`packet ${k + 1} (`);
        const sum = summariseHol(holRun(DEFAULT_LAYOUT, s.lost, rttMs));
        expect(sum.quicDelayed).toBeLessThanOrEqual(sum.tcpDelayed);
        expect(t).toContain(`${sum.tcpDelayed} ${sum.tcpDelayed === 1 ? 'stream' : 'streams'} wait`);
      }
    }
    expect(clean(holIntro(DEFAULT_LAYOUT, { rttMs: 100, lost: [] }))).toContain('No packet is lost');
  });
});

describe('scene 4: both toggles at the slider extremes', () => {
  it('frames are clean, end after both recoveries, and mention validation or fallback as the toggle says', () => {
    for (const rttMs of slider(RTT_RANGE).filter((_, i) => i % 7 === 0).concat(RTT_RANGE.max)) {
      for (const udpBlocked of [false, true]) {
        const frames = migrateFrames({ rttMs, udpBlocked });
        frames.forEach((f) => clean(f.say ?? ''));
        const said = frames.filter((f) => f.say !== undefined).map((f) => clean(f.say)).join(' ');
        expect(said.includes('PATH_CHALLENGE')).toBe(!udpBlocked);
        expect(said.includes('falls back to TCP')).toBe(udpBlocked);
        const stall = Math.max(recover('tcp', rttMs, udpBlocked).stallMs, recover('quic', rttMs, udpBlocked).stallMs);
        expect(frames[frames.length - 1].now).toBe(SWITCH_AT_MS + stall + SWITCH_AT_MS);
      }
    }
  });
});

describe('content', () => {
  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
