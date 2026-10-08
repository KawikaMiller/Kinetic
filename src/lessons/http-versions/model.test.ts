import { describe, expect, it } from 'vitest';
import {
  BANDWIDTH_BYTES_PER_MS, DATA_FRAME_BYTES, LOSS_RECOVERY_RTTS, LOST_RESOURCE, PAGE, SETUP_RTTS, frameStrip, headerBytes, hpackBlocks,
  hpackIntBytes, http1HeadBytes, requestHeaders, segments, segmentsUntil, simulate, streamId, type ConnCount, type Resource,
} from './model';
import { RTT_MAX, RTT_MIN, RTT_STEP } from './constants';

const RTTS: number[] = [];
for (let r = RTT_MIN; r <= RTT_MAX; r += RTT_STEP) RTTS.push(r);
const CONNS: ConnCount[] = [1, 2, 6];
const byId = (run: ReturnType<typeof simulate>, id: string) => run.timings.find((t) => t.id === id)!;

describe('the preset page', () => {
  it('has 12 resources: HTML, 2 CSS, 4 JS and 5 images, HTML first', () => {
    expect(PAGE).toHaveLength(12);
    expect(PAGE[0].kind).toBe('html');
    const count = (k: string) => PAGE.filter((r) => r.kind === k).length;
    expect([count('html'), count('css'), count('js'), count('img')]).toEqual([1, 2, 4, 5]);
  });
});

describe('connection setup', () => {
  it('takes 2 RTT over TCP + TLS 1.3 and 1 RTT over QUIC', () => {
    expect(SETUP_RTTS).toEqual({ h1: 2, h2: 2, h3: 1 });
    for (const rtt of [50, 120]) {
      const p = { rtt, conns: 6 as const, loss: false };
      expect(simulate('h1', p).timings[0].sent).toBe(2 * rtt);
      expect(simulate('h2', p).timings[0].sent).toBe(2 * rtt);
      expect(simulate('h3', p).timings[0].sent).toBe(rtt);
    }
  });

  it('HTTP/1.1 opens the extra connections when the HTML arrives, each with its own 2 RTT handshake', () => {
    const run = simulate('h1', { rtt: 100, conns: 6, loss: false });
    const html = run.timings[0].done;
    expect(run.connReady).toEqual([200, ...Array(5).fill(html + 200)]);
  });
});

describe('a single connection is fully serial (HTTP/1.1, 1 connection)', () => {
  it('matches the closed form: setup + Σ (RTT + think + size ÷ bandwidth)', () => {
    for (const rtt of RTTS) {
      const run = simulate('h1', { rtt, conns: 1, loss: false });
      let t = 2 * rtt;
      for (const r of PAGE) {
        const x = byId(run, r.id);
        expect(x.sent).toBeCloseTo(t, 6);
        t += rtt + r.think + r.size / BANDWIDTH_BYTES_PER_MS;
        expect(x.done).toBeCloseTo(t, 6);
      }
      expect(run.total).toBeCloseTo(t, 6);
    }
  });

  it('never overlaps two requests, and each goes out the moment the previous response is in', () => {
    const run = simulate('h1', { rtt: 80, conns: 1, loss: false });
    for (let i = 1; i < run.timings.length; i++) expect(run.timings[i].sent).toBeCloseTo(run.timings[i - 1].done, 6);
  });
});

describe('fair sharing (hand-worked)', () => {
  const page: Resource[] = [
    { id: 'index.html', kind: 'html', size: 10_000, think: 0 },
    { id: 'a.js', kind: 'js', size: 50_000, think: 0 },
    { id: 'b.js', kind: 'js', size: 50_000, think: 0 },
  ];
  it('two equal responses on HTTP/2 each get half the link and finish together', () => {
    const run = simulate('h2', { rtt: 100, conns: 6, loss: false }, page);
    // HTML: sent at 200, served at 250, 10 KB at 1250 B/ms = 8 ms, arrives 308.
    expect(run.timings[0].done).toBeCloseTo(308, 6);
    // Both requests leave at 308, reach the server at 358; 100 KB together at 1250 B/ms = 80 ms; last bytes land at 488.
    expect(byId(run, 'a.js').done).toBeCloseTo(488, 6);
    expect(byId(run, 'b.js').done).toBeCloseTo(488, 6);
  });

  it('a 6 KB stream sharing with a 50 KB one finishes first, then the big one gets the whole link', () => {
    const small = page.map((r) => (r.id === 'b.js' ? { ...r, size: 6_000 } : r));
    const run = simulate('h2', { rtt: 100, conns: 6, loss: false }, small);
    // Shared: 625 B/ms each; b's 6 KB takes 9.6 ms (a has sent 6 KB too). a's remaining 44 KB alone: 35.2 ms.
    expect(byId(run, 'b.js').done).toBeCloseTo(358 + 9.6 + 50, 6);
    expect(byId(run, 'a.js').done).toBeCloseTo(358 + 9.6 + 35.2 + 50, 6);
  });
});

describe('the version comparison, every RTT on the slider', () => {
  it('with no loss, HTTP/2 finishes no later than HTTP/1.1 at 6 connections', () => {
    for (const rtt of RTTS) {
      const p = { rtt, conns: 6 as const, loss: false };
      expect(simulate('h2', p).total).toBeLessThanOrEqual(simulate('h1', p).total);
    }
  });

  it('HTTP/3 is HTTP/2 shifted one round trip earlier, response by response', () => {
    for (const rtt of RTTS) {
      const h2 = simulate('h2', { rtt, conns: 6, loss: false });
      const h3 = simulate('h3', { rtt, conns: 6, loss: false });
      h2.timings.forEach((x, i) => expect(h3.timings[i].done).toBeCloseTo(x.done - rtt, 6));
    }
  });

  it('more HTTP/1.1 connections never make the page slower', () => {
    for (const rtt of RTTS) {
      const [one, two, six] = CONNS.map((conns) => simulate('h1', { rtt, conns, loss: false }).total);
      expect(two).toBeLessThanOrEqual(one + 1e-6);
      expect(six).toBeLessThanOrEqual(two + 1e-6);
    }
  });

  it('HTTP/1.1 head-of-line: on a connection, nothing is requested until the response before it is in', () => {
    for (const rtt of RTTS) {
      for (const conns of CONNS) {
        const run = simulate('h1', { rtt, conns, loss: false });
        for (let c = 0; c < conns; c++) {
          const mine = run.timings.filter((x) => x.conn === c).sort((a, b) => a.sent - b.sent);
          for (let i = 1; i < mine.length; i++) expect(mine[i].sent).toBeGreaterThanOrEqual(mine[i - 1].done - 1e-6);
        }
      }
    }
  });

  it('HTTP/2 sends every sub-request at once, the moment the HTML is in', () => {
    const run = simulate('h2', { rtt: 100, conns: 6, loss: false });
    const html = run.timings[0].done;
    for (const x of run.timings.slice(1)) expect(x.sent).toBe(html);
  });
});

describe('one lost packet', () => {
  it('on HTTP/2, every response still in progress finishes exactly the recovery time later; finished ones are untouched', () => {
    for (const rtt of RTTS) {
      const clean = simulate('h2', { rtt, conns: 6, loss: false });
      const lossy = simulate('h2', { rtt, conns: 6, loss: true });
      const loss = lossy.loss!;
      const recovery = LOSS_RECOVERY_RTTS * rtt;
      // Precondition for an exact shift: no request reaches the server during the stall.
      for (const x of clean.timings) expect(x.serverStart <= loss.sentAt || x.serverStart >= loss.sentAt + recovery).toBe(true);
      clean.timings.forEach((x, i) => {
        const y = lossy.timings[i];
        if (x.lastSent <= loss.sentAt + 1e-6) expect(y.done).toBeCloseTo(x.done, 6);
        else expect(y.done).toBeCloseTo(x.done + recovery, 6);
      });
      expect(loss.stalled).toBe(lossy.timings.filter((y) => y.lastSent > loss.sentAt + 1e-6).length);
      expect(loss.stalled).toBeGreaterThan(1);
    }
  });

  it('on HTTP/3, only the lost packet\'s stream is held up; the others finish no later', () => {
    for (const rtt of RTTS) {
      const clean = simulate('h3', { rtt, conns: 6, loss: false });
      const lossy = simulate('h3', { rtt, conns: 6, loss: true });
      clean.timings.forEach((x, i) => {
        const y = lossy.timings[i];
        if (x.id === LOST_RESOURCE) {
          // It pauses, but the link stays busy with the other streams, so it may not finish any later.
          expect(y.done).toBeGreaterThanOrEqual(x.done - 1e-6);
          expect(y.done).toBeLessThanOrEqual(x.done + LOSS_RECOVERY_RTTS * rtt + 1e-6);
        } else expect(y.done).toBeLessThanOrEqual(x.done + 1e-6);
        expect(y.stall !== null).toBe(x.id === LOST_RESOURCE);
      });
      expect(lossy.loss!.stalled).toBe(1);
      expect(lossy.total).toBeLessThan(simulate('h2', { rtt, conns: 6, loss: true }).total);
    }
  });

  it('happens early in the lost resource, on every version and connection count', () => {
    for (const conns of CONNS) {
      for (const v of ['h1', 'h2', 'h3'] as const) {
        const run = simulate(v, { rtt: 100, conns, loss: true });
        const hero = byId(run, LOST_RESOURCE);
        expect(run.loss!.sentAt).toBeGreaterThan(hero.serverStart);
        expect(run.loss!.sentAt).toBeLessThan(hero.lastSent);
        expect(run.loss!.until - run.loss!.at).toBe(LOSS_RECOVERY_RTTS * 100);
      }
    }
  });

  it('on HTTP/1.1, only the lost packet\'s own connection stalls', () => {
    const run = simulate('h1', { rtt: 100, conns: 6, loss: true });
    const hero = byId(run, LOST_RESOURCE);
    for (const x of run.timings) expect(x.stall !== null).toBe(x.id === LOST_RESOURCE);
    expect(hero.conn).toBeGreaterThanOrEqual(0);
  });
});

describe('waterfall segments', () => {
  it('tile [need, done] with no gaps, and put the stall where the model says', () => {
    for (const v of ['h1', 'h2', 'h3'] as const) {
      const run = simulate(v, { rtt: 100, conns: 6, loss: true });
      for (const x of run.timings) {
        const segs = segments(x);
        expect(segs[0].from).toBeCloseTo(x.need, 6);
        expect(segs.at(-1)!.to).toBeCloseTo(x.done, 6);
        for (let i = 1; i < segs.length; i++) expect(segs[i].from).toBeCloseTo(segs[i - 1].to, 6);
        const stalled = segs.filter((s) => s.kind === 'stalled');
        if (x.stall) expect(stalled).toEqual([{ kind: 'stalled', from: expect.closeTo(Math.max(x.stall.from, x.firstByte), 6), to: x.stall.to }]);
        else expect(stalled).toEqual([]);
      }
    }
  });

  it('show nothing that has not started yet, and cut the running piece at now', () => {
    const x = simulate('h2', { rtt: 100, conns: 6, loss: false }).timings[4];
    expect(segmentsUntil(x, x.need)).toEqual([]);
    const mid = (x.firstByte + x.done) / 2;
    const cut = segmentsUntil(x, mid);
    expect(cut.at(-1)).toEqual({ kind: 'transfer', from: x.firstByte, to: mid });
  });
});

describe('HTTP/2 frame strip', () => {
  it('has one HEADERS frame per stream and ceil(size ÷ 16,384) DATA frames, in arrival order', () => {
    const run = simulate('h2', { rtt: 100, conns: 6, loss: false });
    const frames = frameStrip(run, 100);
    for (const x of run.timings) {
      const mine = frames.filter((f) => f.id === x.id);
      expect(mine.filter((f) => f.type === 'HEADERS')).toHaveLength(1);
      expect(mine.filter((f) => f.type === 'DATA')).toHaveLength(Math.ceil(x.size / DATA_FRAME_BYTES));
      expect(mine[0].type).toBe('HEADERS');
      expect(mine.at(-1)!.at).toBeCloseTo(x.done, 6);
    }
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i].at).toBeGreaterThanOrEqual(frames[i - 1].at);
      // Frames arriving together list HEADERS first, then by stream ID.
      if (frames[i].at === frames[i - 1].at && frames[i].type === frames[i - 1].type) expect(frames[i].stream).toBeGreaterThan(frames[i - 1].stream);
    }
  });

  it('interleaves streams: some stream\'s frames are split by another stream\'s', () => {
    const frames = frameStrip(simulate('h2', { rtt: 100, conns: 6, loss: false }), 100).filter((f) => f.type === 'DATA');
    const hero = frames.map((f, i) => (f.id === LOST_RESOURCE ? i : -1)).filter((i) => i >= 0);
    expect(hero.at(-1)! - hero[0] + 1).toBeGreaterThan(hero.length);
  });

  it('numbers client streams 1, 3, 5 on HTTP/2 and 0, 4, 8 on HTTP/3', () => {
    expect([0, 1, 2].map((i) => streamId('h2', i))).toEqual([1, 3, 5]);
    expect([0, 1, 2].map((i) => streamId('h3', i))).toEqual([0, 4, 8]);
  });
});

describe('header bytes', () => {
  it('HTTP/1.1 text is counted byte for byte', () => {
    const h = [[':method', 'GET'], [':scheme', 'https'], [':authority', 'a.example'], [':path', '/x'], ['accept', '*/*']] as const;
    expect(http1HeadBytes(h)).toBe('GET /x HTTP/1.1\r\nHost: a.example\r\naccept: */*\r\n\r\n'.length);
  });

  it('HPACK integers follow RFC 7541 §5.1 (C.1 examples: 10 → 1 byte, 1337 → 3 bytes with a 5-bit prefix)', () => {
    expect(hpackIntBytes(10, 5)).toBe(1);
    expect(hpackIntBytes(1337, 5)).toBe(3);
    expect(hpackIntBytes(31, 5)).toBe(2);
    expect(hpackIntBytes(30, 5)).toBe(1);
  });

  it('an identical second block costs one byte per header (all indexed)', () => {
    const block = requestHeaders({ id: 'a.js', kind: 'js' });
    const [, second] = hpackBlocks([block, block]);
    expect(second).toBe(block.length);
  });

  it('static pairs cost one byte even the first time', () => {
    expect(hpackBlocks([[[':method', 'GET'], [':scheme', 'https']]])).toEqual([2]);
  });

  it('HPACK beats HTTP/1.1 text for the page, and a warm table makes later requests tiny', () => {
    const b = headerBytes();
    expect(b.hpack).toBeLessThan(b.http1 / 3);
    expect(b.hpackLast).toBeLessThan(b.hpackFirst / 4);
  });
});
