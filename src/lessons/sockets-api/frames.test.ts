import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { LIFECYCLE_INTRO, bindCaption, pileupCaption, queueIntro, realRanges, sceneFrames, stepCaption, type Occupant } from './frames';
import { BACKLOG, ERRNO_TEXT, TOY_RANGE, acceptQueueScene, bindCheck, lifecycle, pileup, rangeSize, type TcpState } from './model';

const text = (n: Parameters<typeof expectCaption>[0]) => expectCaption(n).replace(/\s+/g, ' ');

describe('lifecycle captions follow the model', () => {
  const steps = lifecycle();
  const frames = sceneFrames(steps, LIFECYCLE_INTRO);

  it('one frame per step after the intro, every one with its own caption', () => {
    expect(frames).toHaveLength(steps.length + 1);
    for (const f of frames) expect(text(f.say).length).toBeGreaterThan(20);
  });

  it('every state change a step makes is named in its caption', () => {
    steps.forEach((s, i) => {
      const say = text(frames[i + 1].say);
      for (const c of s.changes) expect(say, s.kind).toContain(`${c.from} → ${c.to}`);
    });
  });

  it('FD numbers, ports and byte counts in captions are the model\'s', () => {
    for (const [i, s] of steps.entries()) {
      const say = text(frames[i + 1].say);
      if (s.kind === 'accept' || s.kind === 'socket-server' || s.kind === 'socket-client') expect(say).toContain(`fd ${s.ret}`);
      if (s.kind === 'accept') expect(say).toContain(`fd ${s.socks.find((x) => x.listener)!.fd} is still the listener`);
      if (s.kind === 'connect') expect(say).toContain(`${s.socks.find((x) => x.id === s.conn)!.local!.port}`);
      if (s.kind === 'client-close' || s.kind === 'server-close') expect(say).toContain(`fd ${s.freedFd}`);
    }
    const reads = steps.filter((s) => s.kind === 'recv').map((s) => s.bytes!);
    const second = text(frames[steps.findLastIndex((s) => s.kind === 'recv') + 1].say);
    expect(second).toContain(`${reads.map((r) => r.toLocaleString('en-US')).join(' + ')} = ${reads.reduce((a, b) => a + b).toLocaleString('en-US')}`);
  });
});

describe('accept-queue captions, both server settings', () => {
  for (const slow of [false, true]) {
    const steps = acceptQueueScene(slow);
    it(`${slow ? 'slow' : 'accepting'}: each caption states the queue length the step really has`, () => {
      for (const s of steps) {
        const say = text(stepCaption(s));
        const q = s.socks.find((x) => x.listener)!.queue.length;
        if (s.kind !== 'listen') expect(say).toContain(`${q} of ${BACKLOG}`);
        if (s.kind === 'queue-drop') expect(q).toBe(BACKLOG);
        if (s.kind === 'queue-accept') expect(say).toContain(`fd ${s.ret}`);
      }
      expect(text(queueIntro(slow))).toContain(slow ? "isn't calling accept()" : 'calls accept()');
    });
  }
});

describe('TIME_WAIT captions, both client settings', () => {
  const size = rangeSize(TOY_RANGE);
  for (const reuse of [false, true]) {
    const run = pileup({ reuse });
    it(`${reuse ? 'keep-alive' : 'new connection each time'}: every caption matches its frame`, () => {
      run.forEach((f, i) => {
        const say = text(pileupCaption(f, i, run, reuse, TOY_RANGE));
        if (i === 0) expect(say).toContain(`${size} ports`);
        else if (i === run.length - 1) {
          expect(f.timeWait).toBe(0);
          expect(say).toContain(`all ${size} ports are free again`);
          expect(say.includes('refused')).toBe(f.failed > 0);
          if (f.failed) expect(say).toContain(`${f.failed} refused`);
        } else if (f.firstFailure) {
          expect(f.timeWait).toBe(size);
          expect(say).toContain(`all ${size} ports are in TIME_WAIT`);
          expect(say).toContain(ERRNO_TEXT.EADDRNOTAVAIL);
        } else {
          expect(say).toContain(reuse ? `${f.timeWait} in TIME_WAIT` : `${f.timeWait} ports sit in TIME_WAIT`);
          expect(say.includes('refused')).toBe(f.failed > 0);
        }
      });
    });
  }

  it('the real-range numbers are rounded down, never up', () => {
    const say = text(realRanges());
    expect(say).toContain('about 273 or 470 new connections per second');
    expect(say).toContain('16,384');
    expect(say).toContain('28,232');
  });
});

describe('bind() captions, every combination the scene offers', () => {
  const ON_PORT: Record<Occupant, TcpState[]> = { nothing: [], listener: ['LISTEN'], 'time-wait': ['TIME_WAIT'] };
  for (const port of [8080, 80])
    for (const occupant of ['nothing', 'listener', 'time-wait'] as Occupant[])
      for (const privileged of [false, true])
        for (const reuseAddr of [false, true]) {
          it(`:${port}, ${occupant}, root ${privileged}, SO_REUSEADDR ${reuseAddr}`, () => {
            const r = bindCheck(port, { privileged, reuseAddr, onPort: ON_PORT[occupant] });
            const say = text(bindCaption(port, occupant, privileged, reuseAddr, r));
            if (r.ok) {
              expect(say).toMatch(/^Bound/);
              expect(say).not.toMatch(/EADDRINUSE|EACCES/);
            } else {
              expect(say).toMatch(new RegExp(`^${r.errno}`));
              if (r.errno === 'EADDRINUSE') expect(say).toContain(occupant === 'listener' ? 'already LISTENing' : 'TIME_WAIT');
              // Only suggest root when it isn't already on.
              expect(say.includes('Or set "Runs as" to Root.')).toBe(r.errno === 'EACCES' && !privileged);
            }
          });
        }
});
