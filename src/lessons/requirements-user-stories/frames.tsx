// Frames for "Skip refinement": the team builds straight from the one-line request
// and every unasked question turns up later as rework.
import type { Frame } from '../../core/types';
import { BUILD_DAYS, MATERIAL, REFINEMENT_DAYS, REQUEST, skipCost, stageOf } from './model';

export interface SkipFrame extends Frame {
  /** Days spent so far. */
  days: number;
  /** The question whose absence just bit (null on the other frames). */
  surprise: string | null;
  /** Questions that have bitten so far. */
  found: string[];
}

const fmtDays = (d: number) => `${Number.isInteger(d) ? d : d.toFixed(1)} day${d === 1 ? '' : 's'}`;

export function buildSkipFrames(): SkipFrame[] {
  const frames: SkipFrame[] = [
    {
      days: 0, surprise: null, found: [],
      say: <>No questions asked. The team builds exactly what the sentence says: <i>"{REQUEST}"</i></>,
    },
    {
      days: BUILD_DAYS, surprise: null, found: [], hold: 1.4,
      say: <>{fmtDays(BUILD_DAYS)} later it works: type your email, get a link, choose a new password. Demo day.</>,
    },
  ];
  let days = BUILD_DAYS;
  const found: string[] = [];
  // In the order they'd really surface (demo before release before incidents), not question order.
  for (const q of [...MATERIAL].sort((a, b) => stageOf(a) - stageOf(b))) {
    days += q.reworkDays;
    found.push(q.id);
    frames.push({
      days, surprise: q.id, found: [...found], hold: 1.3,
      say: <>{q.surprise} <span className="hl bad">+{fmtDays(q.reworkDays)}</span></>,
    });
  }
  const cost = skipCost();
  frames.push({
    days: cost.skipped, surprise: null, found: [...found], hold: 2.5,
    say: (
      <>
        Skipping took <span className="hl bad">{fmtDays(cost.skipped)}</span>; asking the questions first would have taken about{' '}
        <span className="hl ok">{fmtDays(cost.refined)}</span> ({fmtDays(REFINEMENT_DAYS)} of refinement + the same build). Illustrative numbers.
      </>
    ),
  });
  return frames;
}
