/** Scene 3's state and everything it shows, as one pure function: only the controls a preset shows can reach its numbers. */
import { bytes } from '../../core/format';
import { HUGE_PAGE_BYTES, PAGE_BYTES } from './mmu';
import {
  DEFAULT_SNAPSHOT_WRITES, DEFAULT_WORKERS, DEFAULT_WORKER_WRITES, SERVER_PAGES, SNAPSHOT_SEED, copyRatio, forkExecRun, preforkRun, snapshotRun,
} from './uses';

export type Preset = 'snapshot' | 'prefork' | 'exec';

export interface UsesState {
  preset: Preset;
  /** Snapshot only. */
  huge: boolean;
  snapshotWrites: number;
  /** Pre-fork only. */
  workers: number;
  workerWrites: number;
}

export const DEFAULT_USES: UsesState = { preset: 'snapshot', huge: false, snapshotWrites: DEFAULT_SNAPSHOT_WRITES, workers: DEFAULT_WORKERS, workerWrites: DEFAULT_WORKER_WRITES };

export interface UsesView {
  /** Two sized things compared in one unit, as a bar each. */
  bars: { label: string; value: number; tone: 'ok' | 'bad' | 'violet' | 'muted'; unit: string }[];
  barMax: number;
  stats: { label: string; value: string; sub: string }[];
  caption: string;
}

const size = (b: number) => bytes(b, { dp: 1 });
const pagesText = (n: number) => `${n.toLocaleString('en-US')} ${n === 1 ? 'page' : 'pages'}`;

export function usesView(s: UsesState): UsesView {
  if (s.preset === 'snapshot') {
    const pageBytes = s.huge ? HUGE_PAGE_BYTES : PAGE_BYTES;
    const r = snapshotRun(pageBytes, s.snapshotWrites, SNAPSHOT_SEED);
    return {
      bars: [{ label: 'data set before the fork', value: r.baselineBytes, tone: 'muted', unit: 'bytes' }, { label: 'extra memory the writes cost', value: r.growthBytes, tone: 'bad', unit: 'bytes' }],
      barMax: r.baselineBytes,
      stats: [
        { label: 'Pages copied', value: r.copiedPages.toLocaleString('en-US'), sub: `of ${r.pages.toLocaleString('en-US')}, one per distinct page dirtied` },
        { label: 'Memory growth', value: size(r.growthBytes), sub: `on top of the ${size(r.baselineBytes)} data set` },
        { label: 'One write copies', value: size(pageBytes), sub: s.huge ? `${copyRatio()}x a 4 KB page` : 'one 4 KB page' },
        { label: 'Expected by formula', value: r.expectedPages.toFixed(1), sub: 'N x (1 - (1 - 1/N)^w), pages' },
      ],
      caption: `Snapshot: the parent takes ${s.snapshotWrites} writes while the child walks the data set, and ${pagesText(r.copiedPages)} of ${r.pages.toLocaleString('en-US')} had to be copied, so memory grew by ${size(r.growthBytes)}. A naive fork would have copied ${size(r.naiveForkBytes)} at once. The formula expects ${r.expectedPages.toFixed(1)} pages.`,
    };
  }
  if (s.preset === 'prefork') {
    const r = preforkRun(s.workers, s.workerWrites);
    return {
      bars: [{ label: 'frames with copy-on-write', value: r.frames, tone: 'ok', unit: 'frames' }, { label: 'frames a naive fork needs', value: r.naiveFrames, tone: 'bad', unit: 'frames' }],
      barMax: r.naiveFrames,
      stats: [
        { label: 'Frames in use', value: String(r.frames), sub: `${SERVER_PAGES} loaded once, plus ${s.workers} x ${s.workerWrites} private` },
        { label: 'Naive fork would use', value: String(r.naiveFrames), sub: `${s.workers + 1} copies of ${SERVER_PAGES} pages` },
        { label: 'Still shared', value: String(r.sharedFrames), sub: 'frames with more than one mapper' },
      ],
      caption: `Pre-fork server: ${s.workers} workers share the loaded code and data, and each writes ${s.workerWrites} private ${s.workerWrites === 1 ? 'page' : 'pages'}, so ${r.frames} frames are in use where a naive fork would hold ${r.naiveFrames}.`,
    };
  }
  const r = forkExecRun();
  return {
    bars: [{ label: 'frames after fork then exec', value: r.frames, tone: 'ok', unit: 'frames' }, { label: 'frames a naive fork would hold', value: r.naiveFrames, tone: 'bad', unit: 'frames' }],
    barMax: r.naiveFrames,
    stats: [
      { label: 'Entries forked', value: String(r.forkedEntries), sub: 'table entries, not data' },
      { label: 'Pages copied', value: String(r.copiedPages), sub: 'exec replaced the mappings first' },
      { label: 'Frames in use', value: String(r.frames), sub: `${SERVER_PAGES} parent + ${r.newPages} loaded for the new program` },
    ],
    caption: `Fork then exec: the child's ${r.forkedEntries} inherited entries are dropped before it writes anything, so ${r.copiedPages} pages were copied and ${r.newPages} new pages were loaded.`,
  };
}
