/** The numbers the try-this entries quote, computed from each scene's default state by the same models the scenes draw. */
import { DEFAULT_COHERENCE, dmaScenario } from './coherence';
import { BROKEN_CONFIG, DEFAULT_CONFIG, runRing, toggleBroken } from './ring';
import { DEFAULT_BUS, DEFAULT_MODE, DEFAULT_SIZE_INDEX, SIZES, plan } from './transfer';

export function transferFacts() {
  const bytes = SIZES[DEFAULT_SIZE_INDEX];
  const pio = plan(DEFAULT_MODE, bytes, DEFAULT_BUS);
  const dma = plan('dma', bytes, DEFAULT_BUS);
  return { pioCpu: pio.cpuTransferTicks, dmaCpu: dma.cpuTransferTicks, pioContention: pio.contentionTicks, dmaContention: dma.contentionTicks };
}

export function coalescingFacts() {
  const one = runRing(DEFAULT_CONFIG).state;
  const four = runRing({ ...DEFAULT_CONFIG, coalesceN: 4 }).state;
  return { irqsOne: one.irqs, irqsFour: four.irqs, waitOne: one.worstLatency, waitFour: four.worstLatency, packets: one.produced };
}

export function brokenFacts() {
  const sim = runRing(BROKEN_CONFIG);
  const tick = sim.violation!.tick;
  return {
    seed: BROKEN_CONFIG.seed,
    tick,
    lost: sim.state.lastOverwritten,
    descriptor: sim.history[tick - 1].head,
    driverTicks: BROKEN_CONFIG.driverTicks,
    dropsWhenCorrect: runRing(toggleBroken(BROKEN_CONFIG, false)).state.dropped,
  };
}

export function cacheFacts() {
  const stale = dmaScenario(DEFAULT_COHERENCE);
  const fixed = dmaScenario({ ...DEFAULT_COHERENCE, coherent: true });
  const guarded = dmaScenario({ ...DEFAULT_COHERENCE, iommu: true });
  return { stale: stale.cpuSaw, right: fixed.cpuSaw, kernelAfter: guarded.kernelBufferAfter, kernelWhenOff: stale.kernelBufferAfter };
}
