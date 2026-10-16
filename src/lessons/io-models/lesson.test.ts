import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { edgeIntro, edgeSummary, filesCaption, modelsCaption, n, traceCaption, virtual } from './captions';
import { DEFAULT_EDGE, MESSAGE_BYTES, runEdge, type Trigger } from './edge';
import { connectionWord, edgeFrames, edgeStateAt } from './edgeView';
import { DEFAULT_ACTIVE_PCT, DEFAULT_CONNECTIONS, edgeFacts, queueFacts, scanFacts, threadFacts, traceFacts } from './facts';
import { DEFAULT_TARGET, emptyRings, enter, queueRead, readiness } from './files';
import lesson from './index';
import {
  ACTIVE_STEPS, CONNECTION_STEPS, DEFAULT_MODEL, DEFAULT_SERVER_SEED, DEFAULT_WORK, MODELS, ROUNDS, makeSchedule, runModel, stackOf,
} from './serve';
import { DEFAULT_TRACE_MODEL, TRACE_ROUNDS, TRACE_WORK, echoTrace } from './trace';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);

describe('scene switches', () => {
  it('every scene is its own keyed component, so none opens on another scene\'s state', () => {
    expect(sceneElements('io-models')).toHaveLength(4);
    expect(sharedSceneComponents('io-models')).toEqual([]);
    expect(sceneElements('io-models').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    expect([DEFAULT_MODEL, DEFAULT_CONNECTIONS, DEFAULT_ACTIVE_PCT, DEFAULT_WORK, DEFAULT_SERVER_SEED]).toEqual(['select', 1000, 2, 4, 11]);
    expect([DEFAULT_TRACE_MODEL, TRACE_WORK]).toEqual(['epoll', 4]);
    expect(DEFAULT_EDGE).toEqual({ trigger: 'edge', readBytes: 100, drain: false });
    expect(DEFAULT_TARGET).toBe('socket');
    expect(emptyRings()).toEqual({ queued: 0, inflight: 0, cq: 0, reaped: 0, enters: 0, total: 0 });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: select at the default settings examines 1,000 per busy round, epoll only the ready ones, for the same requests', () => {
    const f = scanFacts();
    // independent: replay the seeded draws fd by fd
    const rnd = mulberry32(DEFAULT_SERVER_SEED);
    const perRound: number[] = [];
    for (let r = 0; r < ROUNDS; r++) {
      let k = 0;
      for (let fd = 0; fd < 1000; fd++) if (rnd() < 0.02) k++;
      perRound.push(k);
    }
    const K = perRound.reduce((a, b) => a + b, 0);
    const busy = perRound.filter((k) => k > 0).length;
    expect([f.selectEntries, f.epollEntries, f.served]).toEqual([busy * 1000, K, K]);
    expect(f.selectEntries).toBeGreaterThan(f.epollEntries);
    expect(lesson.tryThis[0]).toContain(`from ${n(f.selectEntries)} to ${n(f.epollEntries)}`);
  });

  it('try-this 2: blocking at 10,000 connections is 10,000 threads and 78.1 GB of virtual stack, whatever the schedule', () => {
    const f = threadFacts();
    expect(f.threads).toBe(10000);
    expect(f.stackBytes).toBe(10000 * 8 * 1024 * 1024);
    expect(virtual(f.stackBytes)).toBe('78.1 GB');
    for (const pct of ACTIVE_STEPS) expect(runModel('blocking', 10000, makeSchedule(10000, pct, 3)).stackBytes).toBe(f.stackBytes);
    expect(lesson.tryThis[1]).toContain('78.1 GB');
  });

  it('try-this 3: epoll logs 15 calls for the 6 events, the completion model 3, and the busy poll has 3 EAGAINs among 15', () => {
    expect(traceFacts()).toEqual({ epollCalls: 15, uringCalls: 3, busyCalls: 15, busyEagain: 3, events: 6, connections: 3 });
    expect(echoTrace('uring', 4).calls.every((c) => c.name === 'io_uring_enter')).toBe(true);
    expect(lesson.tryThis[2]).toContain('15 calls for 6 events on 3 connections');
    expect(lesson.tryThis[2]).toContain('3 of its 15 calls are EAGAIN');
  });

  it('try-this 4: the default edge run ends hung with 200 bytes unread after 1 notification and 1 read; draining finishes in 4 reads', () => {
    const f = edgeFacts();
    expect(f).toEqual({ remaining: 200, hungReports: 1, hungReads: 1, drainedReads: 4, drainedReports: 1, drainedVerdict: 'done' });
    const run = runEdge(DEFAULT_EDGE);
    const frames = edgeFrames(DEFAULT_EDGE, run);
    const last = frames.at(-1)!;
    expect(text(last.say!)).toBe('Hung: 200 of 300 bytes sit unread after 1 notification and 1 read, and epoll will not mention them again.');
    expect(connectionWord(edgeStateAt(run, last.now))).toBe('hung');
    expect(lesson.tryThis[3]).toContain('200 of 300 bytes unread after 1 notification and 1 read');
    expect(lesson.tryThis[3]).toContain('4 reads (3 that return data and a last one that returns EAGAIN)');
  });

  it('try-this 5: a regular file shows EPERM, and 4 queued reads entered in one call put 4 in flight', () => {
    expect(readiness('file').epollAdd).toBe('EPERM');
    expect(queueFacts()).toEqual({ queued: 4, inflight: 4, enters: 1 });
    let r = emptyRings();
    for (let i = 0; i < 4; i++) r = queueRead(r);
    expect(enter(r)).toMatchObject({ inflight: 4, enters: 1, queued: 0 });
    expect(lesson.tryThis[4]).toContain('1 call puts 4 reads in flight');
  });
});

describe('captions are computed from the model', () => {
  it('the models caption states the counters of the chosen model at 3 connection counts, 3 activity levels and every model', () => {
    for (const connections of [10, 300, 10000]) {
      for (const pct of [1, 10, 100]) {
        const schedule = makeSchedule(connections, pct, 5);
        for (const model of MODELS) {
          const c = runModel(model, connections, schedule);
          const cap = text(modelsCaption(c, connections, pct, 4));
          const id = `${model} C=${connections} a=${pct}`;
          expect(cap, id).toContain(`${n(c.served.length)} ${c.served.length === 1 ? 'request' : 'requests'} served`);
          expect(cap, id).toContain(`${n(c.syscalls)} system call`);
          expect(cap, id).toContain(`fd entries handled ${n(c.entries)}`);
          expect(cap.includes('returned nothing'), id).toBe(c.wasted > 0);
          expect(cap, id).toContain(`reserving ${virtual(c.stackBytes)}`);
          expect(cap, id).toContain(c.threads === 1 ? '1 thread' : `${n(c.threads)} threads`);
        }
      }
    }
  });

  it('the work slider is the only control that feeds the overhead percentage: the counters do not move with it', () => {
    const schedule = makeSchedule(1000, 2, 11);
    const c = runModel('select', 1000, schedule);
    const low = text(modelsCaption(c, 1000, 2, 1));
    const high = text(modelsCaption(c, 1000, 2, 20));
    const strip = (s: string) => s.replace(/\d+% of the CPU ticks/, '');
    expect(strip(low)).toBe(strip(high));
    expect(low).not.toBe(high);
  });

  it('the trace caption names the call it points at, for every model and step', () => {
    for (const model of MODELS) {
      const e = echoTrace(model, TRACE_WORK);
      e.calls.forEach((c, i) => {
        const cap = text(traceCaption(model, e, i));
        expect(cap).toContain(`Call ${i + 1} of ${e.calls.length} is ${c.name} at tick ${c.t}`);
        expect(cap).toContain(`${e.calls.length} calls for the 6 events`);
      });
    }
    expect(TRACE_ROUNDS.flat()).toHaveLength(6);
  });

  it('the edge frames walk the run: one frame per event plus intro and verdict, bytes read agree with each event, for every trigger and size class', () => {
    for (const trigger of ['level', 'edge'] as Trigger[]) {
      for (const drain of [false, true]) {
        for (const readBytes of [1, 7, 50, 100, 150, 299, 300]) {
          const input = { trigger, drain, readBytes };
          const run = runEdge(input);
          const frames = edgeFrames(input, run);
          expect(frames).toHaveLength(run.events.length + 2);
          expect(text(frames[0].say!)).toBe(text(edgeIntro(input)));
          frames.forEach((f, i) => {
            const s = edgeStateAt(run, f.now);
            if (i > 0 && i <= run.events.length) expect(s.readSoFar).toBe(run.events[i - 1].readSoFar);
            expect(s.hung).toBe(i >= run.events.length && run.verdict === 'hung');
          });
          expect(text(frames.at(-1)!.say!)).toBe(edgeSummary(run));
          expect(run.readTotal + run.remaining).toBe(MESSAGE_BYTES);
        }
      }
    }
  });

  it('the files caption reflects the queues and the target', () => {
    let r = emptyRings();
    for (let i = 0; i < 3; i++) r = queueRead(r);
    const cap = text(filesCaption('file', r));
    expect(cap).toContain('refused by epoll_ctl with EPERM');
    expect(cap).toContain('3 requests queued, 0 in flight');
    expect(text(filesCaption('socket', enter(r)))).toContain('0 requests queued, 3 in flight');
    expect(text(filesCaption('socket', enter(r)))).toContain('1 call into the kernel');
    expect(stackOf(1)).toBe(8 * 1024 * 1024);
    expect(CONNECTION_STEPS).toHaveLength(7);
  });
});

describe('lesson content', () => {
  it('has five try-this entries and five questions', () => {
    expect(lesson.tryThis).toHaveLength(5);
    expect(lesson.quiz).toHaveLength(5);
  });
  it('the correct quiz option is the strictly longest in at most half of the questions', () => {
    expect(correctStrictlyLongest(lesson.quiz)).toBeLessThanOrEqual(Math.floor(lesson.quiz.length / 2));
  });
});
