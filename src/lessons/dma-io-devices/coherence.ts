/**
 * Scene 4: DMA and the CPU cache, and DMA and the IOMMU. A one-line cache over one RAM buffer is simulated
 * for real, so a stale read is a result, not a script. Values are invented.
 */

export const OLD_WORD = 0x11;
export const NEW_WORD = 0x22;
/** An unrelated buffer the device must never touch. */
export const KERNEL_WORD = 0x77;

export interface CoherenceInput {
  /** The platform keeps DMA writes coherent with CPU caches. */
  coherent: boolean;
  /** Without coherence: the driver invalidates the cache line after the DMA and before reading. */
  driverInvalidates: boolean;
  /** The IOMMU only lets the device reach the buffer it was given. */
  iommu: boolean;
}

/** The scene opens with a platform that is not coherent, a driver that does not invalidate and no IOMMU. */
export const DEFAULT_COHERENCE: CoherenceInput = { coherent: false, driverInvalidates: false, iommu: false };

/** One narrated step; `bad` marks where the CPU or the machine goes wrong. */
export interface Step {
  text: string;
  bad: boolean;
}

export interface CoherenceResult {
  /** What the CPU's second read of the buffer returned. */
  cpuSaw: number;
  /** What RAM actually holds in the buffer after the DMA. */
  ramHolds: number;
  /** The CPU read something other than what the device wrote. */
  stale: boolean;
  /** Whether the line was still in the cache when the CPU read again. */
  servedFromCache: boolean;
  /** The unrelated buffer after the device was handed a wrong address. */
  kernelBufferAfter: number;
  overwritten: boolean;
  blocked: boolean;
  steps: Step[];
}

interface Line {
  valid: boolean;
  value: number;
}

const hex2 = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, '0')}`;

export function dmaScenario({ coherent, driverInvalidates, iommu }: CoherenceInput): CoherenceResult {
  const steps: Step[] = [];
  const say = (text: string, bad = false) => steps.push({ text, bad });
  let ram = OLD_WORD;
  let line: Line = { valid: true, value: ram };
  say(`CPU reads the buffer: a miss, so the line is filled with ${hex2(line.value)} from RAM`);

  ram = NEW_WORD;
  say(`the device DMAs ${hex2(NEW_WORD)} into the buffer: RAM now holds ${hex2(ram)}`);
  if (coherent) {
    line = { ...line, valid: false };
    say('the platform keeps DMA coherent: the old line is invalidated for you');
  } else if (driverInvalidates) {
    line = { ...line, valid: false };
    say('the driver invalidates the line after the DMA, by hand');
  } else {
    say('nothing tells the CPU cache: the line still holds the old word', true);
  }

  const servedFromCache = line.valid;
  const cpuSaw = servedFromCache ? line.value : ram;
  const stale = cpuSaw !== NEW_WORD;
  say(servedFromCache ? `CPU reads the buffer again: a hit, it sees ${hex2(cpuSaw)}` : `CPU reads the buffer again: a miss, it refills from RAM and sees ${hex2(cpuSaw)}`, stale);

  let kernel = KERNEL_WORD;
  if (iommu) say('the device is given a wrong address: the IOMMU has no mapping for it, blocks the write and logs a fault');
  else {
    kernel = NEW_WORD;
    say(`the device is given a wrong address and writes ${hex2(NEW_WORD)} over an unrelated buffer that held ${hex2(KERNEL_WORD)}`, true);
  }

  return { cpuSaw, ramHolds: ram, stale, servedFromCache, kernelBufferAfter: kernel, overwritten: kernel !== KERNEL_WORD, blocked: iommu, steps };
}
