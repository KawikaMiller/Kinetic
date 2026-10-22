/**
 * The relay's price: how much longer the path is and how much bandwidth the relay pays for. Pure.
 * Every number is an illustrative constant (a made-up round-trip time, bitrate and egress price), not a measurement.
 */
export const ONE_WAY_MS = { direct: 30, toRelay: 45 } as const;
export const BITRATE_MBPS = 2;
/** An illustrative price per gigabyte sent out of the relay, in dollars. */
export const PRICE_PER_GB = 0.05;
export const CALLS = { min: 100, max: 10_000, step: 100, initial: 1_000 } as const;
export const SHARE = { min: 0, max: 100, step: 5, initial: 20 } as const;
const DIRECTIONS = 2;
const SECONDS_PER_HOUR = 3600;
const BITS_PER_BYTE = 8;
const MBIT_PER_GB = 1000 * BITS_PER_BYTE;

/** One-way delay of the direct path, and of the relayed path (to the relay and from it). */
export const latencies = () => {
  const relayed = ONE_WAY_MS.toRelay * 2;
  return { direct: ONE_WAY_MS.direct, relayed, extra: relayed - ONE_WAY_MS.direct };
};

export interface RelayLoad {
  relayedCalls: number;
  directCalls: number;
  /** What leaves the relay: each relayed call sends one stream each way. */
  egressMbps: number;
  gbPerHour: number;
  costPerHour: number;
}

export function relayLoad(calls: number, sharePercent: number): RelayLoad {
  const relayedCalls = Math.round((calls * sharePercent) / 100);
  const egressMbps = relayedCalls * DIRECTIONS * BITRATE_MBPS;
  const gbPerHour = (egressMbps * SECONDS_PER_HOUR) / MBIT_PER_GB;
  return { relayedCalls, directCalls: calls - relayedCalls, egressMbps, gbPerHour, costPerHour: gbPerHour * PRICE_PER_GB };
}
