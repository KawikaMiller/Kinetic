import { describe, expect, it } from 'vitest';
import {
  BUS_MODES, BUS_WORD_TICKS, DEVICE_READY_TICKS, DMA_SETUP_TICKS, IRQ_TICKS, JOB_TICKS, MODES, PIO_WORD_TICKS, SIZES, STEAL_PERIOD, WORD_BYTES,
  chartEnd, plan, type BusMode, type Mode,
} from './transfer';

/**
 * An independent reference: walk the clock one tick at a time and decide, from the rules alone, what the CPU
 * does in that tick. It shares only the constants with the planner, none of its segment arithmetic.
 */
function tickByTick(mode: Mode, bytes: number, bus: BusMode) {
  const words = bytes / WORD_BYTES;
  const out = { copy: 0, spin: 0, setup: 0, irq: 0, contention: 0, jobDone: 0, jobFinish: 0, jobDuring: 0, transferEnd: 0, finish: 0 };
  const busStart = Math.max(DMA_SETUP_TICKS, DEVICE_READY_TICKS);
  const windowLen = bus === 'burst' ? words * BUS_WORD_TICKS : words * BUS_WORD_TICKS * STEAL_PERIOD;
  const windowEnd = busStart + windowLen;
  const transferEnd = mode === 'pio'
    ? DEVICE_READY_TICKS + PIO_WORD_TICKS * words
    : mode === 'irq-pio'
      ? DEVICE_READY_TICKS + IRQ_TICKS + PIO_WORD_TICKS * words
      : windowEnd + IRQ_TICKS;
  out.transferEnd = transferEnd;
  let jobLeft = JOB_TICKS;
  for (let t = 0; jobLeft > 0 || t < transferEnd; t++) {
    let action: 'spin' | 'copy' | 'setup' | 'irq' | 'job';
    let deviceOwnsBus = false;
    if (mode === 'pio') {
      action = t < DEVICE_READY_TICKS ? 'spin' : t < transferEnd ? 'copy' : 'job';
    } else if (mode === 'irq-pio') {
      action = t < DEVICE_READY_TICKS ? 'job' : t < DEVICE_READY_TICKS + IRQ_TICKS ? 'irq' : t < transferEnd ? 'copy' : 'job';
    } else if (t < DMA_SETUP_TICKS) {
      action = 'setup';
    } else if (t >= windowEnd && t < transferEnd) {
      action = 'irq';
    } else {
      action = 'job';
      if (t >= busStart && t < windowEnd) deviceOwnsBus = bus === 'burst' ? true : (t - busStart) % STEAL_PERIOD === 0;
    }
    if (action === 'job') {
      if (jobLeft > 0 && deviceOwnsBus) out.contention++;
      else if (jobLeft > 0) {
        jobLeft--;
        out.jobDone++;
        if (t < transferEnd) out.jobDuring++;
        if (jobLeft === 0) out.jobFinish = t + 1;
      }
    } else {
      out[action]++;
    }
  }
  out.finish = Math.max(out.jobFinish, transferEnd);
  return out;
}

describe('the planner against a tick-by-tick reference, every mode, size and bus mode', () => {
  for (const mode of MODES) {
    for (const bus of BUS_MODES) {
      it(`${mode} / ${bus}: CPU ticks, job ticks, contention and finish time match at all ${SIZES.length} sizes`, () => {
        for (const bytes of SIZES) {
          const p = plan(mode, bytes, bus);
          const ref = tickByTick(mode, bytes, bus);
          const id = `${mode} ${bus} ${bytes} B`;
          expect([p.copyTicks, p.spinTicks, p.setupTicks, p.irqTicks], id).toEqual([ref.copy, ref.spin, ref.setup, ref.irq]);
          expect(p.jobTicksDuringTransfer, id).toBe(ref.jobDuring);
          expect(p.contentionTicks, id).toBe(ref.contention);
          expect(p.transferEnd, id).toBe(ref.transferEnd);
          expect(p.finish, id).toBe(ref.finish);
          const jobFromSegments = p.segments.filter((s) => s.kind === 'job').reduce((sum, s) => sum + (s.jobTicks ?? 0), 0);
          expect(jobFromSegments, id).toBe(JOB_TICKS);
        }
      });
    }
  }
});

describe('closed forms', () => {
  it('PIO copies exactly words x PIO_WORD_TICKS and DMA costs the CPU exactly DMA_SETUP_TICKS + IRQ_TICKS, at every size', () => {
    for (const bytes of SIZES) {
      const words = bytes / 8;
      for (const bus of BUS_MODES) {
        expect(plan('pio', bytes, bus).copyTicks).toBe(words * PIO_WORD_TICKS);
        expect(plan('irq-pio', bytes, bus).copyTicks).toBe(words * PIO_WORD_TICKS);
        const dma = plan('dma', bytes, bus);
        expect(dma.cpuTransferTicks).toBe(DMA_SETUP_TICKS + IRQ_TICKS);
        expect(dma.copyTicks).toBe(0);
        expect(dma.busHeldTicks).toBe(words * BUS_WORD_TICKS);
      }
    }
  });

  it('a 64 KiB block is 8,192 words, 32,768 CPU copy ticks under PIO, 100 under DMA', () => {
    expect(SIZES.at(-1)).toBe(65536);
    expect(plan('pio', 65536, 'burst').words).toBe(8192);
    expect(plan('pio', 65536, 'burst').copyTicks).toBe(32768);
    expect(plan('dma', 65536, 'burst').cpuTransferTicks).toBe(100);
  });

  it('every mode delivers exactly the bytes asked for', () => {
    for (const bytes of SIZES) for (const mode of MODES) for (const bus of BUS_MODES) expect(plan(mode, bytes, bus).bytesDelivered).toBe(bytes);
  });

  it('the bus mode is hidden state for PIO: it changes nothing in either PIO mode', () => {
    for (const bytes of SIZES) for (const mode of ['pio', 'irq-pio'] as const) expect(plan(mode, bytes, 'burst')).toEqual(plan(mode, bytes, 'steal'));
  });

  it('contention only exists for DMA, the stolen cycles equal the bus ticks, and a burst loses exactly the bus window', () => {
    for (const bytes of SIZES) {
      expect(plan('pio', bytes, 'burst').contentionTicks).toBe(0);
      expect(plan('irq-pio', bytes, 'burst').contentionTicks).toBe(0);
      const burst = plan('dma', bytes, 'burst');
      const steal = plan('dma', bytes, 'steal');
      expect(burst.contentionTicks).toBe(burst.busHeldTicks);
      expect(steal.contentionTicks).toBe(Math.min(steal.busHeldTicks, JOB_TICKS - (DEVICE_READY_TICKS - DMA_SETUP_TICKS)));
    }
  });

  it('the chart edge covers every plan at that size', () => {
    for (const bytes of SIZES) for (const m of MODES) for (const b of BUS_MODES) expect(chartEnd(bytes)).toBeGreaterThanOrEqual(plan(m, bytes, b).finish);
  });
});
