import { describe, expect, it } from 'vitest';
import { isInstant } from '../../core/gantt';
import { MODELS, runModel } from './serve';
import { ROUND_TICKS, TRACE_CONNECTIONS, TRACE_ROUNDS, callRows, echoTrace, revealed } from './trace';

const WORKS = [1, 4, 10, 20];

describe('the three-connection echo trace', () => {
  it('serves the 6 scripted events in every model: 6 reads that return data and 6 writes, none lost', () => {
    expect(TRACE_ROUNDS.flat()).toHaveLength(6);
    for (const model of MODELS) {
      for (const work of WORKS) {
        const e = echoTrace(model, work);
        const reads = e.calls.filter((c) => c.name === 'read').length;
        const writes = e.calls.filter((c) => c.name === 'write').length;
        const workBars = e.bars.filter((b) => b.label === 'work').length;
        if (model === 'uring') expect([reads, writes]).toEqual([0, 0]);
        else expect([reads, writes], `${model} work ${work}`).toEqual([6, 6]);
        expect(workBars, `${model} work ${work}`).toBe(6);
      }
    }
  });

  it('the call counts equal the counters of scene 1 on the same schedule: syscalls, wasted EAGAINs, wait calls', () => {
    for (const model of MODELS) {
      const e = echoTrace(model, 4);
      const c = runModel(model, TRACE_CONNECTIONS, TRACE_ROUNDS);
      expect(e.calls.length, model).toBe(c.syscalls);
      expect(e.calls.filter((x) => x.name === 'EAGAIN').length, model).toBe(c.wasted);
      const waits = e.calls.filter((x) => ['select', 'epoll_wait', 'io_uring_enter'].includes(x.name)).length;
      expect(waits, model).toBe(model === 'select' || model === 'epoll' || model === 'uring' ? c.busyRounds : 0);
    }
  });

  it('a thread-per-connection run has three lanes that all sit blocked while one epoll loop fans the events out on a single lane', () => {
    expect(echoTrace('blocking', 4).lanes).toHaveLength(3);
    expect(echoTrace('epoll', 4).lanes).toHaveLength(1);
    const blocked = echoTrace('blocking', 4).bars.filter((b) => b.kind === 'blocked');
    expect(blocked.length).toBeGreaterThanOrEqual(3);
  });

  it('calls are in time order with consecutive ids, and every bar sits inside the chart and does not overlap another on its lane', () => {
    for (const model of MODELS) {
      for (const work of WORKS) {
        const e = echoTrace(model, work);
        e.calls.forEach((c, i) => {
          expect(c.id).toBe(i);
          if (i > 0) expect(c.t).toBeGreaterThanOrEqual(e.calls[i - 1].t);
        });
        for (const lane of e.lanes) {
          const spans = e.bars.filter((b) => b.lane === lane.id && !isInstant(b)).sort((a, b) => a.start - b.start);
          spans.forEach((b, i) => {
            expect(b.start).toBeGreaterThanOrEqual(0);
            expect(b.end).toBeLessThanOrEqual(e.end);
            if (i > 0) expect(b.start, `${model} work ${work} ${lane.id}`).toBeGreaterThanOrEqual(spans[i - 1].end);
          });
        }
        expect(callRows(e)).toHaveLength(e.calls.length);
      }
    }
    expect(ROUND_TICKS).toBeGreaterThan(3 * (20 + 1) + 1);
  });

  it('revealing up to call k shows exactly calls 0..k as instants and clips every bar to that call\'s tick', () => {
    for (const model of MODELS) {
      const e = echoTrace(model, 4);
      e.calls.forEach((c, k) => {
        const r = revealed(e, k);
        const instantIds = r.bars.filter((b) => b.id.startsWith('call-')).map((b) => b.id).sort();
        expect(instantIds, `${model} ${k}`).toEqual(e.calls.slice(0, k + 1).map((x) => `call-${x.id}`).sort());
        expect(r.now).toBe(c.t);
        for (const b of r.bars.filter((x) => !x.id.startsWith('call-'))) {
          expect(b.start).toBeLessThanOrEqual(c.t);
          if (b.progress !== undefined) expect(b.progress).toBeLessThan(1);
        }
      });
      expect(revealed(e, e.calls.length - 1).bars.filter((b) => !b.id.startsWith('call-')).length).toBeGreaterThan(0);
    }
  });

  it('the epoll_wait line lists exactly the ready fds, and select names them too', () => {
    const e = echoTrace('epoll', 4);
    const waits = e.calls.filter((c) => c.name === 'epoll_wait');
    expect(waits.map((w) => w.text.match(/u32=(\d+)/g)?.length)).toEqual(TRACE_ROUNDS.map((r) => r.length));
    expect(waits[0].text).toContain('{u32=4}');
    expect(waits[0].text).toContain('{u32=6}');
    expect(echoTrace('select', 4).calls.find((c) => c.name === 'select')!.text).toContain('(in [4 6])');
  });
});
