import { describe, expect, it } from 'vitest';
import { captionText } from '../../core/testing/captions';
import { hddFrames, movingPct, msText, rateText } from './frames';
import { MAX_SPARE, MIN_SPARE, runTrace, type Workload } from './ftl';
import { HEAD_START, iops, RANDOM_QUEUE, seekDistance, sequentialQueue, serveQueue, type QueueOrder } from './hdd';
import { CHANNELS, MAX_QD, queueRun } from './nvme';
import { queueCaption, queueVerdict } from './queueText';
import { batchSummary, ssdCaption, waText } from './ssdText';

describe('hard disk frames, every workload × queue order', () => {
  for (const workload of ['random', 'sequential'] as const) {
    for (const order of ['fcfs', 'elevator'] as QueueOrder[]) {
      it(`${workload}, ${order}: every request is shown once and the captions carry the model's numbers`, () => {
        const queue = workload === 'random' ? RANDOM_QUEUE : sequentialQueue();
        const run = serveQueue(queue, HEAD_START, order);
        const fcfs = seekDistance(queue, HEAD_START);
        const frames = hddFrames(run, fcfs);
        const served = frames.flatMap((f) => f.current);
        expect(served).toEqual(run.served.map((_, i) => i));
        frames.forEach((f) => {
          if (f.current.length === 1) {
            const s = run.served[f.current[0]];
            const text = captionText(f.say);
            expect(text).toContain(`track ${s.req.track}, sector ${s.req.sector}`);
            expect(text).toContain(`wait ${msText(s.rotate)}`);
            expect(text).toContain(`${movingPct(s.seek + s.rotate, s.end - s.start)}% of this read`);
            expect(movingPct(s.seek + s.rotate, s.end - s.start)).toBeLessThan(100);
          }
          if (f.current.length > 1) f.current.forEach((i) => expect(run.served[i].seek + run.served[i].rotate).toBe(0));
        });
        const last = captionText(frames.at(-1)!.say);
        expect(last).toContain(rateText(iops(run)));
        expect(last).toContain(msText(run.total));
        if (order === 'elevator') expect(last).toContain(`would move it ${fcfs} tracks`);
        expect(last).toContain(order === 'elevator' ? `moved the arm ${run.seekTracks} tracks` : `The arm moved ${run.seekTracks} tracks`);
      });
    }
  }

  it('the percentage of time spent seeking and waiting is computed, not typed', () => {
    const run = serveQueue(RANDOM_QUEUE, HEAD_START, 'fcfs');
    const moving = run.served.reduce((s, x) => s + x.seek + x.rotate, 0);
    const last = captionText(hddFrames(run, seekDistance(RANDOM_QUEUE, HEAD_START)).at(-1)!.say);
    expect(last).toContain(`${Math.floor((moving / run.total) * 100)}% of the time`);
  });
});

describe('SSD captions, every workload × TRIM × spare setting × batch', () => {
  for (const workload of ['random', 'sequential'] as Workload[]) {
    for (const trim of [false, true]) {
      for (let spare = MIN_SPARE; spare <= MAX_SPARE; spare++) {
        it(`${workload}, TRIM ${trim ? 'on' : 'off'}, ${spare} spare`, () => {
          let n = 0;
          for (const k of [1, 10, 100, 100, 100]) {
            n += k;
            const r = runTrace({ workload, trim, spare }, n, k);
            const s = batchSummary(r);
            const text = captionText(ssdCaption(s, workload, trim));
            expect(s.writes + s.deletes).toBe(k);
            expect(text).toContain(waText(s.wa));
            expect(text.includes('Garbage collection ran')).toBe(s.gcRuns > 0);
            expect(text.includes('No garbage collection')).toBe(s.gcRuns === 0);
            if (s.gcRuns > 0) expect(s.erased.length).toBe(s.gcRuns);
            expect(text.includes('TRIM told the drive')).toBe(trim && s.deletes > 0);
            expect(text.includes('never heard about the delete')).toBe(!trim && s.deletes > 0);
            for (const b of s.erased) expect(text).toContain(String(b));
            if (workload === 'sequential') expect(s.deletes).toBe(0);
          }
        });
      }
    }
  }
});

describe('queue captions, every depth × interface', () => {
  it('name the right bottleneck from the run itself', () => {
    for (const iface of ['sata', 'nvme'] as const) {
      const qd1 = queueRun(1, iface);
      for (let qd = 1; qd <= MAX_QD; qd++) {
        const run = queueRun(qd, iface);
        const text = captionText(queueCaption(run, qd1));
        const v = queueVerdict(run);
        expect(text).toContain(`${Math.round(run.iops).toLocaleString('en-US')} reads/s`);
        expect(text.includes('SATA link is the bottleneck')).toBe(v === 'link');
        expect(text.includes('nearly all busy')).toBe(v === 'channels');
        if (v === 'link') expect(iface).toBe('sata');
        if (v === 'room') expect(text).toContain(`${run.busyChannels.toFixed(1)} of ${CHANNELS}`);
        if (qd > 1) expect(text).toContain(`${(run.iops / qd1.iops).toFixed(1)}×`);
      }
    }
  });
});
