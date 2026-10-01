// The "change two things at once" trap: the discount bug, a real fix for it, and an
// unrelated change (round → floor) shipped in the same attempt.

import { COMPONENTS, INPUT, OTHER_INPUT, runPipeline, type Order } from './model';

/** The bug in this scenario. */
export const TRAP_FAULT = COMPONENTS.indexOf('discount');
const DISCOUNT = 0.9;

/** The real fix: apply the discount once. */
const fixDiscount = (o: Order): Order => ({ ...o, total: o.total * DISCOUNT });
/** The unrelated change: round down instead of to nearest. */
const floorRound = (o: Order): Order => ({ ...o, total: Math.floor(o.total) });

export interface TrapRow {
  fix: boolean;
  extra: boolean;
  main: string;
  mainOk: boolean;
  other: string;
  otherOk: boolean;
}

/** All four combinations of the two changes, on the failing order and on another order. */
export function trapRows(): TrapRow[] {
  const healthyMain = runPipeline(null, INPUT).at(-1)!.text;
  const healthyOther = runPipeline(null, OTHER_INPUT).at(-1)!.text;
  return [false, true].flatMap((fix) =>
    [false, true].map((extra) => {
      const patch = { ...(fix ? { discount: fixDiscount } : {}), ...(extra ? { round: floorRound } : {}) };
      const main = runPipeline(TRAP_FAULT, INPUT, patch).at(-1)!.text;
      const other = runPipeline(TRAP_FAULT, OTHER_INPUT, patch).at(-1)!.text;
      return { fix, extra, main, mainOk: main === healthyMain, other, otherOk: other === healthyOther };
    }),
  );
}
