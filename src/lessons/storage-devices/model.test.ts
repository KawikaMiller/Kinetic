import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/random';
import {
  BLOCKS, createFtl, hostTrace, hostWrite, logicalPages, MAX_SPARE, MIN_SPARE, PAGES, readPage, runTrace, trim, writeAmplification,
} from './ftl';
import {
  avgRotationalLatencyMs, elevatorOrder, iops, RANDOM_QUEUE, rotationMs, RPM, SECTORS_PER_TRACK, seekDistance, seekMs, sequentialQueue, serveQueue,
  TRACKS, type DiskRequest,
} from './hdd';
import { AHCI_QUEUE_DEPTH, channelCeiling, CHANNELS, FLASH_READ_US, linkCeiling, linkUs, OVERHEAD_US, queueRun } from './nvme';

describe('HDD timing', () => {
  it('rotational latency is 60 / rpm / 2 seconds: 4.17 ms at 7,200 rpm', () => {
    expect(avgRotationalLatencyMs(7200)).toBeCloseTo(60 / 7200 / 2 * 1000, 10);
    expect(avgRotationalLatencyMs(7200).toFixed(2)).toBe('4.17');
    expect(avgRotationalLatencyMs(5400).toFixed(2)).toBe('5.56');
    expect(avgRotationalLatencyMs(15000).toFixed(2)).toBe('2.00');
  });

  it('the rotational wait averages half a turn over every sector the head could land on', () => {
    // Land the arm at every sector-time offset and ask for every sector: the mean wait is (S-1)/2 sector times.
    let sum = 0;
    let n = 0;
    for (let s = 0; s < SECTORS_PER_TRACK; s++) {
      const run = serveQueue([{ id: 'x', track: 0, sector: s }], 0, 'fcfs');
      sum += run.served[0].rotate;
      n++;
    }
    const tick = rotationMs(RPM) / SECTORS_PER_TRACK;
    expect(sum / n).toBeCloseTo(((SECTORS_PER_TRACK - 1) / 2) * tick, 9);
    expect(Math.abs(sum / n - avgRotationalLatencyMs(RPM))).toBeLessThan(tick);
  });

  it('seek time: 0 for no move, track-to-track for 1, full stroke across the disk, and it never shrinks with distance', () => {
    expect(seekMs(0)).toBe(0);
    expect(seekMs(1)).toBe(1);
    expect(seekMs(TRACKS - 1)).toBeCloseTo(16, 10);
    for (let d = 1; d < TRACKS - 1; d++) expect(seekMs(d + 1)).toBeGreaterThanOrEqual(seekMs(d));
  });

  it('a sequential run pays one seek and one rotational wait, then reads back to back', () => {
    const run = serveQueue(sequentialQueue(), 120, 'fcfs');
    expect(run.served[0].seek).toBeGreaterThan(0);
    run.served.slice(1).forEach((s) => {
      expect(s.seek).toBe(0);
      expect(s.rotate).toBe(0);
    });
    expect(iops(run)).toBeGreaterThan(1000);
  });

  it('random reads manage about a hundred a second (tens to low hundreds), sequential ones thousands', () => {
    const r = iops(serveQueue(RANDOM_QUEUE, 120, 'fcfs'));
    expect(r).toBeGreaterThan(40);
    expect(r).toBeLessThan(200);
    const seqSteady = 1000 / (rotationMs(RPM) / SECTORS_PER_TRACK);
    expect(seqSteady).toBeGreaterThan(1000);
  });

  it('times add up: start + seek + rotate + transfer = end, and each request starts when the last ended', () => {
    const run = serveQueue(RANDOM_QUEUE, 120, 'elevator');
    let t = 0;
    for (const s of run.served) {
      expect(s.start).toBeCloseTo(t, 9);
      expect(s.start + s.seek + s.rotate + s.transfer).toBeCloseTo(s.end, 9);
      expect(s.rotate).toBeLessThan(rotationMs(RPM));
      t = s.end;
    }
    expect(run.total).toBeCloseTo(t, 9);
  });
});

/** Every order of a small queue, to find the true shortest arm path. */
function bestDistance(queue: DiskRequest[], head: number): number {
  if (queue.length === 0) return 0;
  let best = Infinity;
  queue.forEach((r, i) => {
    const rest = queue.filter((_, j) => j !== i);
    best = Math.min(best, Math.abs(r.track - head) + bestDistance(rest, r.track));
  });
  return best;
}

describe('elevator (LOOK) scheduling', () => {
  it('never travels further than first-come-first-served, on 300 seeded queues', () => {
    const rnd = mulberry32(11);
    for (let k = 0; k < 300; k++) {
      const n = 2 + Math.floor(rnd() * 10);
      const q = Array.from({ length: n }, (_, i) => ({ id: `q${i}`, track: Math.floor(rnd() * TRACKS), sector: 0 }));
      const head = Math.floor(rnd() * TRACKS);
      expect(seekDistance(elevatorOrder(q, head), head)).toBeLessThanOrEqual(seekDistance(q, head));
    }
  });

  it('matches the brute-force shortest path over every ordering of small queues', () => {
    const rnd = mulberry32(5);
    for (let k = 0; k < 120; k++) {
      const n = 1 + Math.floor(rnd() * 6);
      const q = Array.from({ length: n }, (_, i) => ({ id: `q${i}`, track: Math.floor(rnd() * TRACKS), sector: 0 }));
      const head = Math.floor(rnd() * TRACKS);
      expect(seekDistance(elevatorOrder(q, head), head)).toBe(bestDistance(q, head));
    }
  });

  it('visits every request exactly once', () => {
    const order = elevatorOrder(RANDOM_QUEUE, 120);
    expect(order.map((r) => r.id).sort()).toEqual(RANDOM_QUEUE.map((r) => r.id).sort());
  });
});

/** A shadow of what the host believes each logical page holds, kept apart from the FTL. */
function checkReadsBack(workload: 'sequential' | 'random', spare: number, useTrim: boolean, n: number, seed: number) {
  const f = createFtl(spare);
  const ops = hostTrace(workload, f.logical, n, seed);
  const truth = new Map<number, number>();
  ops.forEach((op, i) => {
    if (op.kind === 'write') {
      hostWrite(f, op.lpn, i + 1);
      truth.set(op.lpn, i + 1);
    } else {
      if (useTrim) trim(f, op.lpn);
      truth.delete(op.lpn);
    }
    if (i % 97 === 0 || i === n - 1) {
      for (const [lpn, v] of truth) expect(readPage(f, lpn)).toBe(v);
    }
  });
  // Conservation: every physical page is free, valid or stale, and valid pages are exactly the mapped ones.
  const valid = f.blocks.flatMap((b) => b.pages).filter((p) => p.kind === 'valid').length;
  expect(valid).toBe(f.map.size);
  expect(f.blocks.length).toBe(BLOCKS);
  return f;
}

describe('flash translation layer', () => {
  it('never loses a page: every logical page reads back its latest write over 10,000 seeded operations', () => {
    for (const spare of [MIN_SPARE, 3, MAX_SPARE]) {
      for (const t of [false, true]) {
        checkReadsBack('random', spare, t, 10_000, 3);
        checkReadsBack('sequential', spare, t, 10_000, 3);
      }
    }
  });

  it('write amplification is NAND page writes divided by host page writes', () => {
    const { ftl } = runTrace({ workload: 'random', spare: 2, trim: false }, 3000);
    expect(writeAmplification(ftl)).toBe(ftl.nandWrites / ftl.hostWrites);
    // NAND writes are host writes plus pages GC copied.
    const f = createFtl(2);
    let copies = 0;
    const ops = hostTrace('random', f.logical, 3000);
    ops.forEach((op, i) => {
      if (op.kind !== 'write') return;
      for (const e of hostWrite(f, op.lpn, i + 1)) if (e.kind === 'gc') copies += e.moved.length;
    });
    expect(f.nandWrites).toBe(f.hostWrites + copies);
  });

  it('is exactly 1.0 for a purely sequential workload, at every over-provisioning setting', () => {
    for (let spare = MIN_SPARE; spare <= MAX_SPARE; spare++) {
      const { ftl } = runTrace({ workload: 'sequential', spare, trim: false }, 5000);
      expect(writeAmplification(ftl)).toBe(1);
      expect(ftl.gcRuns).toBeGreaterThan(0);
    }
  });

  it('climbs well above 1 for random overwrites once the drive is full', () => {
    const { ftl } = runTrace({ workload: 'random', spare: MIN_SPARE, trim: false }, 4000);
    expect(writeAmplification(ftl)).toBeGreaterThan(1.5);
  });

  it('TRIM never increases write amplification on the same trace (40 seeds × every spare setting)', () => {
    for (let seed = 1; seed <= 40; seed++) {
      for (let spare = MIN_SPARE; spare <= MAX_SPARE; spare++) {
        const ops = hostTrace('random', logicalPages(spare), 3000, seed);
        const wa = (useTrim: boolean) => {
          const f = createFtl(spare);
          ops.forEach((op, i) => (op.kind === 'write' ? hostWrite(f, op.lpn, i + 1) : useTrim && trim(f, op.lpn)));
          return writeAmplification(f);
        };
        expect(wa(true)).toBeLessThanOrEqual(wa(false));
      }
    }
  });

  it('more over-provisioning lowers write amplification on random overwrites', () => {
    const was = [];
    for (let spare = MIN_SPARE; spare <= MAX_SPARE; spare++) was.push(writeAmplification(runTrace({ workload: 'random', spare, trim: true }, 4000).ftl));
    for (let i = 1; i < was.length; i++) expect(was[i]).toBeLessThan(was[i - 1]);
  });

  it('pages in a block are programmed in order and a block is only rewritten after an erase', () => {
    const f = createFtl(3);
    const ops = hostTrace('random', f.logical, 2000, 9);
    ops.forEach((op, i) => {
      if (op.kind !== 'write') return;
      hostWrite(f, op.lpn, i + 1);
      for (const b of f.blocks) {
        b.pages.forEach((p, j) => expect(p.kind === 'free').toBe(j >= b.next));
      }
    });
    expect(f.erases).toBe(f.blocks.reduce((s, b) => s + b.erases, 0));
    expect(PAGES).toBe(8);
  });
});

describe('queue depth', () => {
  it('at queue depth 1 a read takes overhead + flash read + transfer, exactly', () => {
    for (const iface of ['sata', 'nvme'] as const) {
      const run = queueRun(1, iface);
      const each = OVERHEAD_US[iface] + FLASH_READ_US + linkUs(iface);
      expect(run.deviceLatencyUs).toBeCloseTo(each, 6);
      expect(run.iops).toBeGreaterThan((1e6 / each) * 0.98);
      expect(run.iops).toBeLessThan((1e6 / each) * 1.02);
    }
  });

  it('IOPS never decrease with queue depth and never pass the channel or link ceiling', () => {
    for (const iface of ['sata', 'nvme'] as const) {
      let last = 0;
      for (let qd = 1; qd <= 64; qd++) {
        const r = queueRun(qd, iface);
        expect(r.iops).toBeGreaterThanOrEqual(last * 0.995);
        expect(r.iops).toBeLessThanOrEqual(Math.min(channelCeiling(), linkCeiling(iface)) * 1.001);
        expect(r.busyChannels).toBeLessThanOrEqual(CHANNELS + 1e-9);
        last = r.iops;
      }
    }
  });

  it('deep queues reach the ceiling: SATA stops at its link, NVMe fills every flash channel', () => {
    expect(queueRun(64, 'sata').iops).toBeGreaterThan(linkCeiling('sata') * 0.97);
    expect(queueRun(64, 'nvme').iops).toBeGreaterThan(channelCeiling() * 0.97);
    expect(linkCeiling('sata')).toBeLessThan(channelCeiling());
  });

  it("Little's law: average busy channels = IOPS × flash read time", () => {
    for (const qd of [1, 4, 16, 40]) {
      const r = queueRun(qd, 'nvme');
      expect(r.busyChannels).toBeCloseTo((r.iops * FLASH_READ_US) / 1e6, 0);
    }
  });

  it('AHCI holds 32 commands: deeper queues on SATA wait in the OS and only add latency', () => {
    expect(AHCI_QUEUE_DEPTH).toBe(32);
    const a = queueRun(32, 'sata');
    const b = queueRun(64, 'sata');
    expect(b.iops).toBeCloseTo(a.iops, 6);
    expect(b.latencyUs).toBeGreaterThan(a.latencyUs * 1.9);
  });
});
