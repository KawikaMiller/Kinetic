/**
 * Scene 4: one slow station. DCF gives every station about the same number of chances to send, so with equal frame sizes each
 * station sends one frame per round and a round lasts as long as every station's frame. A frame at 6 Mbit/s holds the air far longer
 * than one at 54, and everyone's throughput is frame size over the round. The rates and the per-frame overhead are illustrative.
 */
export const FRAME_BYTES = 1500;
/** Backoff, DIFS, preamble, SIFS and ACK for one frame, lumped (illustrative). */
export const OVERHEAD_US = 100;
export const RATES: readonly number[] = [6, 54];
export const SLOW_RATE = 6;
export const FAST_RATE = 54;
export const COUNT_RANGE = { min: 2, max: 6 } as const;

/** Microseconds one frame holds the air at a rate in Mbit/s: bits over Mbit/s is microseconds. */
export const frameUs = (rateMbps: number): number => (FRAME_BYTES * 8) / rateMbps + OVERHEAD_US;

export interface StationShare {
  rate: number;
  frameUs: number;
  /** Share of the airtime this station holds, 0 to 1. */
  airtime: number;
  /** Its throughput in Mbit/s: one frame per round. */
  mbps: number;
}

export interface Shares {
  roundUs: number;
  stations: StationShare[];
  totalMbps: number;
}

export function shares(rates: readonly number[]): Shares {
  const roundUs = rates.reduce((s, r) => s + frameUs(r), 0);
  const stations = rates.map((rate) => ({ rate, frameUs: frameUs(rate), airtime: frameUs(rate) / roundUs, mbps: (FRAME_BYTES * 8) / roundUs }));
  return { roundUs, stations, totalMbps: stations.reduce((s, x) => s + x.mbps, 0) };
}

/** `count` stations at the fast rate except those flagged slow (by index). */
export const ratesFor = (count: number, slow: readonly boolean[]): number[] => Array.from({ length: count }, (_, i) => (slow[i] ? SLOW_RATE : FAST_RATE));
