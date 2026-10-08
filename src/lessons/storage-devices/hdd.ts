// A toy hard disk: one platter, a seeking arm, a fixed rotation speed. Pure logic only.
//
// Time inside the model is counted in "sector times" (how long one sector takes to pass
// under the head), so a sequential read lands exactly on the next sector with no float
// drift; everything shown to the learner is converted to milliseconds.

export const RPM = 7200;
/** Toy geometry: real drives have hundreds of thousands of tracks and thousands of sectors per track. */
export const TRACKS = 1000;
export const SECTORS_PER_TRACK = 64;
/** Illustrative seek times: one track over, and the whole way across. */
export const SEEK_TRACK_TO_TRACK_MS = 1;
export const SEEK_FULL_STROKE_MS = 16;
/** What one toy sector holds, for the throughput readout (real sectors are 512 B or 4 KiB). */
export const SECTOR_BYTES = 4096;

/** One full turn of the platter, in ms. */
export const rotationMs = (rpm: number) => 60_000 / rpm;
/** Average wait for the wanted sector to come round: half a turn (60 / rpm / 2 seconds). */
export const avgRotationalLatencyMs = (rpm: number) => rotationMs(rpm) / 2;
/** How long one sector takes to pass under the head. */
export const sectorMs = (rpm: number) => rotationMs(rpm) / SECTORS_PER_TRACK;

/**
 * Seek time for an arm move of `distance` tracks: nothing for 0, the track-to-track time
 * for 1, the full stroke for the whole disk, growing like a square root in between (the
 * arm accelerates, coasts and settles, so long seeks are cheaper per track). Illustrative.
 */
export function seekMs(distance: number): number {
  if (distance <= 0) return 0;
  const span = (distance - 1) / (TRACKS - 2);
  return SEEK_TRACK_TO_TRACK_MS + (SEEK_FULL_STROKE_MS - SEEK_TRACK_TO_TRACK_MS) * Math.sqrt(span);
}

export interface DiskRequest {
  id: string;
  track: number;
  sector: number;
}

export interface ServedRequest {
  req: DiskRequest;
  /** Tracks the arm moved for this request. */
  distance: number;
  /** All in ms from the start of the run. */
  start: number;
  seekEnd: number;
  rotateEnd: number;
  end: number;
  seek: number;
  rotate: number;
  transfer: number;
}

export type QueueOrder = 'fcfs' | 'elevator';

/**
 * The elevator order for one fixed queue (the LOOK variant of SCAN: the arm turns at the
 * last request instead of running to the disk's edge). It sweeps toward the nearer end of
 * the queue first, then back, so the arm covers the queue's span plus the shorter leg.
 */
export function elevatorOrder(queue: readonly DiskRequest[], head: number): DiskRequest[] {
  if (queue.length === 0) return [];
  const tracks = queue.map((r) => r.track);
  const lo = Math.min(...tracks);
  const hi = Math.max(...tracks);
  const up = [...queue].filter((r) => r.track >= head).sort((a, b) => a.track - b.track);
  const down = [...queue].filter((r) => r.track < head).sort((a, b) => b.track - a.track);
  const upFirst = down.length === 0 || (up.length > 0 && hi - head <= head - lo);
  return upFirst ? [...up, ...down] : [...down, ...up];
}

/** Total tracks the arm travels to visit `order` from `head`. */
export function seekDistance(order: readonly DiskRequest[], head: number): number {
  let at = head;
  let sum = 0;
  for (const r of order) {
    sum += Math.abs(r.track - at);
    at = r.track;
  }
  return sum;
}

export interface DiskRun {
  served: ServedRequest[];
  total: number;
  seekTracks: number;
  order: QueueOrder;
  /** Where the arm started. */
  head: number;
}

/**
 * Serve a queue one request (one sector) at a time: seek to the track, wait for the
 * sector to come round under the head, read it. The platter's sector 0 is under the head
 * at time 0 and it never stops turning.
 */
export function serveQueue(queue: readonly DiskRequest[], head: number, order: QueueOrder, rpm = RPM): DiskRun {
  const tick = sectorMs(rpm);
  const list = order === 'elevator' ? elevatorOrder(queue, head) : [...queue];
  let ticks = 0;
  let at = head;
  const served = list.map((req) => {
    const start = ticks;
    const distance = Math.abs(req.track - at);
    const seekTicks = seekMs(distance) / tick;
    const afterSeek = start + seekTicks;
    const under = afterSeek % SECTORS_PER_TRACK;
    const wait = (((req.sector - under) % SECTORS_PER_TRACK) + SECTORS_PER_TRACK) % SECTORS_PER_TRACK;
    const rotateEnd = afterSeek + wait;
    const end = rotateEnd + 1;
    ticks = end;
    at = req.track;
    return {
      req,
      distance,
      start: start * tick,
      seekEnd: afterSeek * tick,
      rotateEnd: rotateEnd * tick,
      end: end * tick,
      seek: seekTicks * tick,
      rotate: wait * tick,
      transfer: tick,
    };
  });
  return { served, total: ticks * tick, seekTracks: seekDistance(list, head), order, head };
}

/** Requests per second over the whole run. */
export const iops = (run: DiskRun) => (run.total === 0 ? 0 : (run.served.length * 1000) / run.total);
/** Bytes per second over the whole run. */
export const throughput = (run: DiskRun) => (run.total === 0 ? 0 : (run.served.length * SECTOR_BYTES * 1000) / run.total);

export const HEAD_START = 120;

/** Consecutive sectors on one track: only the first read pays a seek and a rotational wait. */
export function sequentialQueue(n = 32, track = 640): DiskRequest[] {
  return Array.from({ length: n }, (_, i) => ({ id: `s${i}`, track, sector: i }));
}

/** A fixed scatter of reads across the disk (hand-picked, so the walkthrough is reproducible). */
export const RANDOM_QUEUE: readonly DiskRequest[] = [
  { id: 'r0', track: 812, sector: 40 },
  { id: 'r1', track: 95, sector: 7 },
  { id: 'r2', track: 530, sector: 22 },
  { id: 'r3', track: 960, sector: 51 },
  { id: 'r4', track: 210, sector: 33 },
  { id: 'r5', track: 688, sector: 12 },
  { id: 'r6', track: 37, sector: 60 },
  { id: 'r7', track: 404, sector: 3 },
];

/**
 * The mean seek between two independent, uniformly random tracks: distance d turns up
 * with probability 2(T − d) / T² (and 0 with probability 1 / T).
 */
export function averageRandomSeekMs(): number {
  let sum = 0;
  for (let d = 1; d < TRACKS; d++) sum += ((2 * (TRACKS - d)) / (TRACKS * TRACKS)) * seekMs(d);
  return sum;
}

/** A typical random read: average seek, half a turn, one sector. */
export const randomReadMs = (rpm = RPM) => averageRandomSeekMs() + avgRotationalLatencyMs(rpm) + sectorMs(rpm);
