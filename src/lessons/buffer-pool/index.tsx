import type { LessonModule } from '../../core/types';
import { pctText } from '../../core/format';
import { DEFAULT_SEED, KNEE_SHARE, MEASURE, SKEW, hitRatio, knee, newPool, request, scanExperiment, sizeCurve, take, workload } from './pool';
import { BATCH } from './usePoolState';
import { Stage } from './Stage';

/** The numbers the try-this entries quote, from the model at the default seed and skew. */
const SERVED = 4 * BATCH;
let served = newPool('lru');
for (const page of take(workload(DEFAULT_SEED, SKEW.initial), SERVED)) served = request(served, { page });
const servedRatio = hitRatio(served.count)!;
const lru = scanExperiment('lru', DEFAULT_SEED, SKEW.initial);
const ring = scanExperiment('ring', DEFAULT_SEED, SKEW.initial);
const KNEE = knee(sizeCurve('lru', DEFAULT_SEED, SKEW.initial));

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A database keeps hot pages in a small pool of memory frames. A request is a hit if its page is in a frame, otherwise a miss that reads the disk and evicts something; which page it evicts is the policy, and a pinned page is never a candidate.',
    what: 'Disk pages are fetched into frames. When every frame is taken, a policy chooses a victim: LRU evicts the page used longest ago, a clock sweep decrements a usage count on each pass and evicts the first frame at zero, and a scan ring confines one big sequential read to a few frames so it cannot flush the rest. Pages being used by a running query are pinned and skipped. Pages that were changed are dirty and cost a write-back when evicted, or when a checkpoint flushes them. A bigger pool helps until it holds the working set, and then it stops helping.',
    analogy: 'A workbench with eight clear spots in front of a warehouse of 24 crates. The crates you keep reaching for stay on the bench. When you fetch a new one you must send an old one back, but never one a colleague is holding, and a crate you scribbled on has to be filed properly before it goes.',
    useCases: [
      'Reading buffer-hit ratios on a database dashboard and knowing what moves them',
      'Explaining why a nightly full-table scan slows the morning queries',
      'Sizing the shared buffer memory of a database against its working set',
      'Understanding why a checkpoint writes a burst of dirty pages to disk',
    ],
    why: 'The pool is where memory meets disk for a database, so its hit ratio sets query latency. Seniors are expected to say why a scan hurts, why more memory has diminishing returns, and what a pin or a dirty page does to eviction, instead of just raising a size setting.',
    watch:
      'The frame table has one row per frame, with its page, pin count, a dirty dot and (for the clock policies) its usage count. The rail beside a row is yellow for the frame holding the page just requested, with the words hit or miss, violet for a pinned frame, grey for a free one, and blue marks the clock hand. A dirty dot is orange, and a page in the pool is blue in the disk strip below. The meter is the hit ratio, red when poor, orange when fair and green when good. In the size plot each policy is a curve, the violet line is the knee and the yellow line is the pool size you chose. The chips say what is simulated, a toy or from memory.',
  },
  tryThis: [
    `Press Run ${BATCH} four times: LRU serves ${SERVED} requests of the seeded workload at a hit ratio of ${pctText(servedRatio, 1)}.`,
    `In "The scan pollutes the pool" the table (seed ${DEFAULT_SEED}) shows the hit ratio of the next ${MEASURE} requests before and after a full scan: LRU ${pctText(lru.before, 0)} to ${pctText(lru.after, 0)}, the scan ring ${pctText(ring.before, 0)} to ${pctText(ring.after, 0)}.`,
    `In "Pins and dirty pages" press Run ${BATCH}, click each of the eight frames to pin it, then click a disk page that is not blue: the request has no unpinned frame and fails.`,
    'In "Pins and dirty pages" switch clicking to "writes it", click disk page 5 (it loads and turns dirty), then press Checkpoint: the write-backs read 1.',
    `In "Size it" LRU reaches ${pctText(KNEE_SHARE, 0)} of its 16-frame hit ratio at ${KNEE} frames on seed ${DEFAULT_SEED}: the violet line.`,
  ],
  keyIdeas: [
    'In this model a hit costs nothing and a miss costs a disk read, so the hit ratio is the number to watch.',
    'LRU is not scan-proof: one full scan evicts the hot pages, and a scan ring confines the scan to a few frames.',
    'A pinned page is skipped when a victim is chosen, and a dirty page costs a write-back when it is evicted or checkpointed.',
    'A bigger pool helps until it holds the working set; past that knee the extra frames buy little.',
  ],
  quiz: [
    {
      q: 'A nightly job scans a whole table, then the morning queries run against the hot pages. With plain LRU, what do the first morning queries see?',
      options: [
        'Mostly misses: the scan pushed the hot pages out, so they are read from disk again',
        'Mostly hits: LRU keeps the pages used most often, however long the scan was',
        'The same hit ratio as before, since the scan pages are the least recently used',
        'Errors, because the pool is full of pages that no query has asked for',
      ],
      answer: 0,
      why: 'Each scan page becomes the newest page in the pool, so the hot pages age out and are evicted. LRU looks at recency alone, and a scan is pure recency with no reuse.',
    },
    {
      q: 'What does a scan ring do?',
      options: [
        'It confines a big sequential scan to a few frames, so the rest of the pool keeps its hot pages',
        'It reads the scan pages ahead of the query, so that they are already in memory when the query asks',
        'It orders the frames in a circle so the clock hand can reach each frame in turn',
        'It copies every scanned page to a second pool so that the first one is never touched',
      ],
      answer: 0,
      why: 'The scan reuses its own small set of frames instead of claiming a new one for each page. The hot pages in the other frames survive, which is why the measured hit ratio after the scan barely moves.',
    },
    {
      q: 'The pool needs a frame and the page in one candidate is pinned. What happens?',
      options: [
        'That frame is skipped, because a running query is using the page',
        'The page is written back and evicted, since a pin only delays the eviction',
        'The pin is cleared so the policy can pick that frame like any other',
        'The request waits for the pin to expire after a fixed number of requests',
      ],
      answer: 0,
      why: 'A pin says a query is reading or writing that page right now. If each frame is pinned and the page is missing, the request has no victim and waits or fails.',
    },
    {
      q: 'A pool grows from 12 to 16 frames and the hit ratio hardly changes. Why?',
      options: [
        'The working set already fits, so the extra frames hold pages that are rarely requested',
        'A bigger pool always evicts more pages, which cancels out the extra memory',
        'Hit ratio depends on the eviction policy and on nothing else, such as the size of the pool',
        'The clock hand takes longer to go round, so the extra frames are slower to reuse',
      ],
      answer: 0,
      why: 'Past the knee of the curve the pool already holds the pages that get the bulk of the requests. More frames help just by keeping pages that are asked for rarely.',
    },
    {
      q: 'What does evicting a dirty page cost that evicting a clean page does not?',
      options: [
        'A write-back: its changes go to disk before the frame can be reused',
        'A second disk read, to check that the page on disk still matches the frame',
        'A pin, so that no other request can touch the page while it is flushed',
        'Nothing, because a checkpoint has already written every dirty page',
      ],
      answer: 0,
      why: 'A dirty page differs from the copy on disk, so dropping it would lose the change. The write-back is counted separately from the disk reads, and a checkpoint flushes the dirty pages in a batch instead.',
    },
  ],
};

export default lesson;
