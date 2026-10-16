import { describe, expect, it } from 'vitest';
import { expectCaption } from '../../core/testing/captions';
import { correctStrictlyLongest } from '../../core/testing/quiz';
import { sceneElements, sharedSceneComponents } from '../../core/testing/sceneKeys';
import { coherenceCaption, cpuBreakdown, mmioCaption, n, ringCaption, transferCaption } from './captions';
import { DEFAULT_COHERENCE, KERNEL_WORD, NEW_WORD, OLD_WORD, dmaScenario } from './coherence';
import { brokenFacts, cacheFacts, coalescingFacts, transferFacts } from './facts';
import lesson from './index';
import {
  DEFAULT_ADDRESS, DEFAULT_SPACE, DEVICE_BASE, access, deviceStatus, freshMachine, registerAddress, type Outcome,
} from './mmio';
import { BROKEN_CONFIG, DEFAULT_CONFIG, RING_TICKS, createRing, runRing, toggleBroken, type RingConfig } from './ring';
import { BUS_MODES, DEFAULT_BUS, DEFAULT_MODE, DEFAULT_SIZE_INDEX, MODES, SIZES, plan } from './transfer';

const text = (node: Parameters<typeof expectCaption>[0]) => expectCaption(node);

describe('scene switches', () => {
  it('every scene is its own component and carries its own key, so no scene opens on another scene\'s state', () => {
    expect(sceneElements('dma-io-devices')).toHaveLength(4);
    expect(sharedSceneComponents('dma-io-devices')).toEqual([]);
    expect(sceneElements('dma-io-devices').every((e) => e.keyed)).toBe(true);
  });

  it('each scene\'s opening state is the one its try-this assumes', () => {
    expect([DEFAULT_MODE, SIZES[DEFAULT_SIZE_INDEX], DEFAULT_BUS]).toEqual(['pio', 65536, 'burst']);
    expect([DEFAULT_SPACE, DEFAULT_ADDRESS]).toEqual(['mem', DEVICE_BASE]);
    expect(freshMachine().ready).toBe(true);
    expect(DEFAULT_CONFIG).toMatchObject({ broken: false, coalesceN: 1, ratePct: 30, driverTicks: 2 });
    expect(DEFAULT_COHERENCE).toEqual({ coherent: false, driverInvalidates: false, iommu: false });
  });
});

describe('try-this entries, from each scene\'s default state, as written', () => {
  it('try-this 1: 64 KB by PIO costs the CPU 32,968 ticks (32,768 copying + 200 polling), by DMA 100, and contention goes from 0 to 8,192', () => {
    const f = transferFacts();
    expect(f).toEqual({ pioCpu: 32768 + 200, dmaCpu: 100, pioContention: 0, dmaContention: 8192 });
    const pio = plan('pio', 65536, 'burst');
    const dma = plan('dma', 65536, 'burst');
    expect(pio.copyTicks).toBe((65536 / 8) * 4);
    expect([dma.setupTicks, dma.irqTicks]).toEqual([40, 60]);
    expect(lesson.tryThis[0]).toContain('32,968 to 100');
    expect(lesson.tryThis[0]).toContain('from 0 to 8,192');
    expect(text(transferCaption(pio, 'burst'))).toContain('32,768 ticks copying');
    expect(text(transferCaption(dma, 'burst'))).toContain('stalls for 8,192 of them');
  });

  it('try-this 2: STATUS reads 1 then 0 uncached, and 1 then 1 cached with the second never reaching the device', () => {
    const status = registerAddress('STATUS', 'mem');
    const read = (m = freshMachine(), cached = false) => access(m, { op: 'read', space: 'mem', addr: status, value: 0 }, cached);
    const a = read();
    const b = read(a.m);
    expect([a.out, b.out].map((o) => ('value' in o ? o.value : -1))).toEqual([1, 0]);
    expect(lesson.tryThis[1]).toContain('0x00000001 then 0x00000000');
    // The written order: the learner switches to Cached, presses Reset the device (a fresh machine), then loads twice.
    const c = read(freshMachine(), true);
    const d = read(c.m, true);
    expect([c.out, d.out].map((o) => ('value' in o ? o.value : -1))).toEqual([1, 1]);
    expect(d.out.kind).toBe('cache');
    expect(d.m.deviceReads).toBe(1);
    expect(deviceStatus(d.m)).toBe(0);
    expect(lesson.tryThis[1]).toContain('both answers are 0x00000001');
  });

  it('try-this 3: the default ring run has 55 packets and 55 interrupts; N = 4 gives 13 and a worst wait of 22 against 4', () => {
    const f = coalescingFacts();
    expect(f).toEqual({ irqsOne: 55, irqsFour: 13, waitOne: 4, waitFour: 22, packets: 55 });
    expect(lesson.tryThis[2]).toContain('from 55 to 13');
    expect(lesson.tryThis[2]).toContain('from 4 to 22 ticks');
    const four = runRing({ ...DEFAULT_CONFIG, coalesceN: 4 }).state;
    expect(four.produced).toBe(55);
  });

  it('try-this 4: the real toggle path (default, then broken, then back to correct) loads seed 8 with a 3-tick driver, stops with a packet overwritten, and switching back keeps that ring and only drops', () => {
    const f = brokenFacts();
    expect(f.seed).toBe(8);
    const on = toggleBroken(DEFAULT_CONFIG, true);
    const sim = runRing(on);
    expect(sim.ticks).toBe(f.tick);
    expect(sim.ticks).toBeLessThan(RING_TICKS);
    expect(sim.state.overwritten).toBe(1);
    const good = runRing(toggleBroken(on, false)).state;
    expect(good.overwritten).toBe(0);
    expect(good.dropped).toBe(f.dropsWhenCorrect);
    expect(good.dropped).toBeGreaterThan(0);
    expect(lesson.tryThis[3]).toContain(`tick ${n(f.tick)} the full ring has a packet waiting, so the driver re-posts descriptor ${f.descriptor} while it still holds packet ${f.lost}`);
    expect(lesson.tryThis[3]).toContain(`drops ${n(f.dropsWhenCorrect)} packets instead`);
    expect(text(ringCaption(sim.state, BROKEN_CONFIG))).toContain(`packet ${f.lost} was overwritten`);
  });

  it('try-this 5: not coherent reads 0x11 not 0x22 and overwrites the unrelated 0x77 with 0x22; coherence reads 0x22; the IOMMU keeps 0x77', () => {
    expect(cacheFacts()).toEqual({ stale: OLD_WORD, right: NEW_WORD, kernelAfter: KERNEL_WORD, kernelWhenOff: NEW_WORD });
    expect(lesson.tryThis[4]).toContain('reads 0x11 instead of the 0x22');
    expect(lesson.tryThis[4]).toContain('overwritten with 0x22');
    expect(lesson.tryThis[4]).toContain('keeps 0x77');
  });
});

describe('captions are computed from the model', () => {
  it('the transfer caption states the plan\'s own numbers at every mode, size and bus mode', () => {
    for (const bytes of SIZES) {
      for (const mode of MODES) {
        for (const bus of BUS_MODES) {
          const p = plan(mode, bytes, bus);
          const c = text(transferCaption(p, bus));
          const id = `${mode} ${bus} ${bytes}`;
          expect(c, id).toContain(`The job finishes at tick ${n(p.finish)}.`);
          expect(c, id).toContain(`${n(p.words)} words`);
          if (mode === 'pio') expect(c).toContain(`${n(p.copyTicks)} ticks copying and ${n(p.spinTicks)} polling`);
          if (mode === 'irq-pio') expect(c).toContain(`the job runs for ${n(p.jobTicksDuringTransfer)} ticks`);
          if (mode === 'dma') {
            expect(c).toContain(`${n(p.cpuTransferTicks)} in all`);
            expect(c).toContain(bus === 'burst' ? `the job stalls for ${n(p.contentionTicks)} of them` : `the job loses ${n(p.contentionTicks)} cycles`);
          }
        }
      }
    }
  });

  it('the bus-sharing switch is hidden state for the PIO modes: their captions and breakdowns do not change with it', () => {
    for (const bytes of SIZES) {
      for (const mode of ['pio', 'irq-pio'] as const) {
        expect(transferCaption(plan(mode, bytes, 'burst'), 'burst')).toBe(transferCaption(plan(mode, bytes, 'steal'), 'steal'));
        expect(cpuBreakdown(plan(mode, bytes, 'burst'))).toBe(cpuBreakdown(plan(mode, bytes, 'steal')));
      }
    }
  });

  it('the breakdown names only the parts that exist: PIO copies and polls, DMA sets up and takes one interrupt', () => {
    expect(cpuBreakdown(plan('pio', 64, 'burst'))).toBe('32 copying + 200 polling');
    expect(cpuBreakdown(plan('dma', 64, 'burst'))).toBe('40 setup + 60 interrupt');
    expect(cpuBreakdown(plan('irq-pio', 64, 'burst'))).toBe('32 copying + 60 interrupt');
  });

  it('the address-map caption quotes what the device holds and what the last STATUS read returned', () => {
    const status = registerAddress('STATUS', 'mem');
    let m = freshMachine();
    let last: Outcome | null = null;
    for (const cached of [false, true]) {
      m = freshMachine();
      for (let i = 0; i < 3; i++) {
        const r = access(m, { op: 'read', space: 'mem', addr: status }, cached);
        m = r.m;
        last = r.out;
        const c = text(mmioCaption({ space: 'mem', cached, machine: m, last }));
        expect(c).toContain(`READY = ${deviceStatus(m)}`);
        expect(c).toContain(`the last STATUS read returned ${m.lastStatus}`);
        expect(c.includes('mapped cached, which is the mistake')).toBe(cached);
      }
    }
    expect(text(mmioCaption({ space: 'port', cached: true, machine: freshMachine(), last: null }))).not.toContain('cached');
  });

  it('the ring caption states the state\'s own counts at every tick of several runs', () => {
    const configs: RingConfig[] = [DEFAULT_CONFIG, { ...DEFAULT_CONFIG, coalesceN: 4 }, { ...DEFAULT_CONFIG, ratePct: 90, driverTicks: 12 }, BROKEN_CONFIG];
    for (const cfg of configs) {
      const sim = runRing(cfg);
      sim.history.forEach((s) => {
        const c = text(ringCaption(s, cfg));
        expect(c).toContain(`Tick ${n(s.tick)}: ${n(s.produced)}`);
        expect(c).toContain(`${n(s.consumed)} consumed, ${n(s.dropped)} dropped`);
        expect(c.includes('Broken driver')).toBe(s.overwritten > 0);
        expect(c.includes('no interrupt has announced')).toBe(s.pending > 0 && s.overwritten === 0);
      });
    }
  });

  it('the coherence caption follows the switches over all 8 combinations', () => {
    for (const coherent of [false, true]) {
      for (const driverInvalidates of [false, true]) {
        for (const iommu of [false, true]) {
          const r = dmaScenario({ coherent, driverInvalidates, iommu });
          const c = text(coherenceCaption(r));
          expect(c.includes('stale word')).toBe(!coherent && !driverInvalidates);
          expect(c.includes('IOMMU: the IOMMU blocked')).toBe(iommu);
        }
      }
    }
  });
});

describe('quiz facts, checked against the model', () => {
  it('a 64 KB block is 8,192 words, and 10 packets with N = 4 and no time limit give 2 interrupts and 2 unannounced', () => {
    expect(plan('pio', 65536, 'burst').words).toBe(8192);
    const sim = createRing({ ...DEFAULT_CONFIG, ratePct: 100, driverTicks: 1, coalesceN: 4 });
    sim.run(10);
    const s = sim.state;
    expect([s.produced, s.dropped, s.irqs, s.pending]).toEqual([10, 0, 2, 2]);
    expect(lesson.quiz[3].options[0]).toContain('Two interrupts');
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
