import { describe, expect, it } from 'vitest';
import { ipv4 } from '../../core/ipv4';
import { captionText } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { ladderFrames, mtuFrames, mtuSummary, replayIntro, routesIntro, wrapFacts, wrapFrames } from './captions';
import {
  DEFAULT_DEST, WRAP_PAYLOAD, initialKeys, initialMtu, initialReplay, initialRoutes, initialWrap, sendAhead, sendNext, sendNumber, sendOld, sendReplayOfLast, sendTyped, typeDestination,
} from './init';
import lesson from './index';
import { LADDERS } from './ladders';
import { DEFAULT_MTU_INPUT, LINK_MTU, PACKET_SIZE, decide, transferSteps, transferSub, tunnelMtuOf } from './mtu';
import { MAX_NUMBER, WINDOW, receive } from './replay';
import { PRESETS, lookup, presetRows, split } from './routing';
import { DEFAULT_OPTIONS, TUNNELS, fixedOverheadOf, overheadOf, type Suite } from './tunnels';

const clean = (node: unknown) => {
  const t = captionText(node as never, { strict: true });
  expect(t).not.toMatch(/NaN|undefined|Infinity|\[object|null/);
  return t;
};

describe('try-this entries, from each scene\'s opening state, as written', () => {
  it('try-this 1: WireGuard with a 108-byte payload adds 60 bytes (188 on the wire) and 80 over IPv6', () => {
    const s = initialWrap();
    expect([s.tunnel, s.payload, s.opts.outer]).toEqual(['wireguard', 108, 4]);
    const f = wrapFacts(s.tunnel, s.opts, s.payload);
    expect([f.inner.length, f.overhead, f.wrapped.bytes.length]).toEqual([128, 60, 188]);
    expect(wrapFacts('wireguard', { ...s.opts, outer: 6 }, 108).overhead).toBe(80);
    const t = lesson.tryThis[0];
    expect(t).toContain('a 128-byte inner packet');
    expect(t).toContain('adds 60 bytes, 188 on the wire');
    expect(t).toContain('IPv6: 80 bytes');
  });

  it('try-this 2: ESP is 56 with AES-GCM, 76 with AES-CBC + HMAC and 84 with NAT traversal', () => {
    const f = (suite: Suite, natT: boolean) => wrapFacts('esp', { ...DEFAULT_OPTIONS, suite, natT }, 108).overhead;
    expect([f('gcm', false), f('cbc', false), f('cbc', true)]).toEqual([56, 76, 84]);
    const t = lesson.tryThis[1];
    expect(t).toContain('is 56 bytes with AES-GCM');
    expect(t).toContain('AES-CBC + HMAC: 76 bytes');
    expect(t).toContain('NAT traversal on: 84.');
  });

  it('try-this 3: the default silently drops the 1500-byte segment and stalls; clamping cuts it to 1440; ICMP tells the sender 1440', () => {
    const i = initialMtu();
    expect(i).toEqual(DEFAULT_MTU_INPUT);
    expect(decide(i).outcome).toBe('dropped-silent');
    expect(transferSteps(i).stalls).toBe(true);
    expect(decide({ ...i, clamp: true })).toMatchObject({ outcome: 'delivered', sent: 1440, clamped: true });
    expect(decide({ ...i, icmp: true })).toMatchObject({ outcome: 'dropped-icmp', tunnelMtu: 1440 });
    const t = lesson.tryThis[2];
    expect(t).toContain('1500-byte link, 1500-byte packets');
    expect(t).toContain('data segment is dropped silently, so the transfer stalls');
    expect(t).toContain('it is cut to 1440 bytes and delivered');
    expect(t).toContain('the sender is told 1440');
  });

  it('try-this 4: full tunnel sends 203.0.113.50 through the tunnel, split sends it direct with 2 of 6 sample destinations entering; the overlap ties and the policy picks the side', () => {
    const s = initialRoutes();
    expect([s.preset, s.text, s.policy]).toEqual(['full', DEFAULT_DEST, 'direct']);
    expect(lookup(presetRows('full'), s.dest, s.policy).winner?.goes).toBe('tunnel');
    expect(lookup(presetRows('split'), s.dest, s.policy).winner?.goes).toBe('direct');
    expect(split(presetRows('split'), 'direct').tunnel).toBe(2);
    const tie = lookup(presetRows('overlap'), ipv4('192.168.1.20'), 'direct');
    expect([tie.ties.length, tie.winner?.goes]).toEqual([2, 'direct']);
    expect(lookup(presetRows('overlap'), ipv4('192.168.1.20'), 'tunnel').winner?.goes).toBe('tunnel');
    const t = lesson.tryThis[3];
    expect(t).toContain('203.0.113.50) the destination goes through the tunnel');
    expect(t).toContain('it goes direct and 2 of 6 sample destinations enter');
    expect(t).toContain('2 routes tie');
    expect(t).toContain('picks direct');
    expect(t).toContain('picks tunnel.');
  });

  it('try-this 5: three in-order packets, a replay of the last is dropped as seen, a jump of 64 and then number 3 is below the window', () => {
    let r = initialReplay();
    for (let k = 0; k < 3; k++) r = sendNext(r);
    expect(r.window.top).toBe(3);
    r = sendReplayOfLast(r);
    expect(r.log[r.log.length - 1].verdict.kind).toBe('replay');
    r = sendAhead(r, WINDOW);
    expect(r.window.top).toBe(67);
    r = sendTyped({ ...r, field: '3' });
    expect(r.log[r.log.length - 1].verdict).toEqual({ kind: 'too-old', floor: 3 });
    const t = lesson.tryThis[4];
    expect(t).toContain('it is dropped as already seen');
    expect(t).toContain('"64 above the top"');
    expect(t).toContain('it is dropped as below the window');
  });
});

describe('captions are clean and computed from the model', () => {
  it('wrap frames: one per field plus a start and an opening, overhead so far rising to the total, for every tunnel, option and payload extreme', () => {
    for (const tunnel of TUNNELS) {
      for (const outer of [4, 6] as const) {
        for (const suite of ['gcm', 'cbc'] as const) {
          for (const natT of [false, true]) {
            for (const payload of [WRAP_PAYLOAD.min, WRAP_PAYLOAD.initial, 1, WRAP_PAYLOAD.max]) {
              const o = { outer, suite, natT };
              const f = wrapFacts(tunnel, o, payload);
              const frames = wrapFrames(tunnel, o, payload);
              expect(frames).toHaveLength([...f.layout.before, ...f.layout.after].length + 2);
              frames.forEach((fr) => clean(fr.say));
              const last = clean(frames[frames.length - 1].say);
              expect(last).toContain('byte for byte the same');
              expect(last).toContain(`The tunnel cost ${overheadOf(tunnel, f.inner.length, f.eff)} bytes`);
              expect(frames[frames.length - 1].shown).toBe(frames.length - 2);
              const penultimate = clean(frames[frames.length - 2].say);
              expect(penultimate).toContain(`Overhead so far: ${f.overhead} bytes`);
            }
          }
        }
      }
    }
  });

  it('a zero-byte padding field says none was needed, not 0 bytes of padding added', () => {
    const t = clean(wrapFrames('wireguard', DEFAULT_OPTIONS, 108).find((f) => clean(f.say).includes('padding'))!.say);
    expect(t).toContain('none needed (0 bytes)');
  });

  it('MTU captions over the whole control cross product at the slider extremes', () => {
    for (const tunnel of TUNNELS) {
      for (const linkMtu of [LINK_MTU.min, LINK_MTU.ethernet, LINK_MTU.jumbo]) {
        for (const packet of [PACKET_SIZE.min, 1500, PACKET_SIZE.max]) {
          for (const df of [false, true]) for (const icmp of [false, true]) for (const clamp of [false, true]) {
            const input = { tunnel, linkMtu, packet, df, icmp, clamp };
            const r = decide(input);
            const text = clean(mtuSummary(input));
            expect(text).toContain(`${linkMtu} - ${r.overhead} = ${r.tunnelMtu}`);
            if (r.outcome === 'dropped-silent') expect(text).toContain('dropped silently');
            if (r.outcome === 'fragmented') expect(text).toContain(`${r.fragments} fragment`);
            const frames = mtuFrames(input);
            expect(frames).toHaveLength(transferSteps(input).steps.length + 1);
            frames.forEach((f) => clean(f.say));
          }
        }
      }
    }
  });

  it('the route caption names the tie, the preferred side and the machine that becomes unreachable', () => {
    const rows = presetRows('overlap');
    const addr = ipv4('192.168.1.20');
    const direct = clean(routesIntro(rows, addr, lookup(rows, addr, 'direct'), 'direct'));
    expect(direct).toContain('matches 2 routes of the same length');
    expect(direct).toContain('the office machine with this address is unreachable');
    const tunnel = clean(routesIntro(rows, addr, lookup(rows, addr, 'tunnel'), 'tunnel'));
    expect(tunnel).toContain('the home machine with this address is unreachable');
    for (const p of PRESETS) for (const policy of ['direct', 'tunnel'] as const) clean(routesIntro(p.rows, ipv4('203.0.113.50'), lookup(p.rows, ipv4('203.0.113.50'), policy), policy));
    clean(routesIntro([], ipv4('1.2.3.4'), lookup([], ipv4('1.2.3.4'), 'direct'), 'direct'));
  });

  it('ladder captions state the round trips before data, computed from the steps', () => {
    expect(clean(ladderFrames(LADDERS.wireguard)[1].say)).toContain('after 1 round trip');
    expect(clean(ladderFrames(LADDERS.ikev2)[3].say)).toContain('after 2 round trips');
  });

  it('the replay caption states the window range and how many numbers it remembers', () => {
    let r = initialReplay();
    expect(clean(replayIntro(r.window, null))).toContain('covers no number yet');
    r = sendNext(sendNext(r));
    const t = clean(replayIntro(r.window, r.log[r.log.length - 1]));
    expect(t).toContain('Packet 2: accepted');
    expect(t).toContain('covers 1 to 2 and remembers 2 numbers');
  });
});

describe('typed input is refused with the reason and keeps the old state', () => {
  it('a destination: letters, a short address, a leading zero, 256 and a very long string', () => {
    const s = initialRoutes();
    for (const bad of ['', 'abc', '10.1', '010.0.0.1', '1.2.3.256', '1.2.3.4.5', 'x'.repeat(4000), '<b>1.2.3.4</b>']) {
      const r = typeDestination(s, bad);
      expect(r.dest).toBe(s.dest);
      expect(r.error).toContain('Still showing 203.0.113.50.');
      expect((r.error ?? '').length).toBeLessThan(260);
    }
    expect(typeDestination(s, ' 10.20.4.9 ')).toMatchObject({ dest: ipv4('10.20.4.9'), error: null });
  });

  it('a packet number: blank, text, negative, decimal, exponent, too large and absurdly long', () => {
    const r0 = initialReplay();
    for (const bad of ['', 'abc', '-1', '2.5', '1e3', '1000001', '9'.repeat(40)]) {
      const r = sendTyped({ ...r0, field: bad });
      expect(r.sent, bad).toBe(0);
      expect(r.note, bad).toBeTruthy();
      expect(r.window).toBe(r0.window);
    }
    expect(sendTyped({ ...r0, field: '1,000' }).window.top).toBe(1000);
    expect(sendTyped({ ...r0, field: String(MAX_NUMBER) }).window.top).toBe(MAX_NUMBER);
  });

  it('the buttons refuse what has no meaning yet, and the top of the range', () => {
    const r0 = initialReplay();
    expect(sendReplayOfLast(r0).note).toContain('nothing to replay');
    expect(sendOld(r0, 10).note).toContain('no number 10 below it');
    const top = sendNumber(r0, MAX_NUMBER);
    expect(sendNext(top).note).toContain('stop at 1,000,000');
    expect(sendNext(top).sent).toBe(top.sent);
  });

  it('the log keeps only the last six packets', () => {
    let r = initialReplay();
    for (let k = 0; k < 20; k++) r = sendNext(r);
    expect(r.log).toHaveLength(6);
    expect(r.log[5].n).toBe(20);
    expect(r.sent).toBe(20);
    expect(new Set(r.log.map((e) => e.id)).size).toBe(6);
  });
});

describe('the scenes open in their own state', () => {
  it('each opening state is its own and a fresh object', () => {
    expect(initialWrap()).not.toBe(initialWrap());
    expect(initialMtu()).toEqual(DEFAULT_MTU_INPUT);
    expect(initialKeys().ladder).toBe('wireguard');
    expect(initialKeys().replay.window.top).toBe(0);
    expect(initialRoutes().error).toBeNull();
    const a = initialWrap();
    a.opts.suite = 'cbc';
    expect(initialWrap().opts.suite).toBe('gcm');
  });

  it('the MTU scene does not read the ESP suite or NAT traversal of the wrap scene: the overhead is the default-option figure for ESP', () => {
    expect(decide({ ...DEFAULT_MTU_INPUT, tunnel: 'esp' }).overhead).toBe(fixedOverheadOf('esp', DEFAULT_OPTIONS));
    expect(tunnelMtuOf('esp', 1500)).toBe(1500 - 54);
  });
});

describe('quiz facts come from the model', () => {
  it('the 1440 answer is the WireGuard tunnel MTU over 1500', () => {
    const q = lesson.quiz[4];
    expect(q.options[q.answer]).toBe(String(tunnelMtuOf('wireguard', 1500)));
    expect(q.options).toContain(String(1500 - fixedOverheadOf('wireguard', { ...DEFAULT_OPTIONS, outer: 6 })));
  });

  it('the replay question: 100 is too old after 200 with a window of 64, below 136', () => {
    let w = receive(receive(receive({ top: 0, bits: Array.from({ length: WINDOW }, () => 0 as const) }, 1).window, 150).window, 200).window;
    const out = receive(w, 100);
    expect(out.verdict).toEqual({ kind: 'too-old', floor: 136 });
    w = out.window;
    expect(lesson.quiz[3].why).toContain('200 - 64 = 136');
  });

  it('no more than half of the quiz questions have the correct option strictly longest', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});

describe('the large-transfer line under the MTU ladder', () => {
  it('says what the ladder shows: a retry when a segment was lost and recovered, nothing lost when none was, a stall when it never gets through', () => {
    const seen = new Set<string>();
    for (const df of [true, false]) for (const icmp of [true, false]) for (const clamp of [true, false]) for (const linkMtu of [1280, 1500, 9000]) for (const packet of [200, 1400, 1500, 4000]) {
      const t = transferSteps({ ...DEFAULT_MTU_INPUT, df, icmp, clamp, linkMtu, packet });
      const sub = transferSub(t);
      const lostStep = t.steps.some((s) => s.lost);
      // independent oracle from the inputs: the segment is lost only when it does not fit, DF is set, and nothing clamped it
      const tunnelMtu = tunnelMtuOf(DEFAULT_MTU_INPUT.tunnel, linkMtu);
      const lostByRule = df && !(clamp ? true : packet <= tunnelMtu) && true;
      expect(lostStep, JSON.stringify({ df, icmp, clamp, linkMtu, packet })).toBe(lostByRule);
      if (!lostByRule) expect(sub).toBe('no step above was lost');
      else if (icmp) expect(sub).toContain('completes after the sender retries');
      else expect(sub).toBe('pings and small pages still work');
      seen.add(sub.split(' ')[0]);
    }
    expect(seen.size).toBe(3);
  });
});
