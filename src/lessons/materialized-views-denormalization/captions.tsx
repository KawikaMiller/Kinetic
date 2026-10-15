import type { ReactNode } from 'react';
import { ratioText, sig } from '../../core/format';
import { STRATEGIES, inconsistentCopies, type Config, type Difference, type State, type Strategy } from './shop';
import { cheapestRight, crossover } from './workload';
import type { World } from './shop';

const hl = (cls: string, text: ReactNode): ReactNode => <span className={`hl ${cls}`}>{text}</span>;
const rows = (n: number): string => `${n} ${n === 1 ? 'row' : 'rows'}`;

export interface CaptionInput {
  strategy: Strategy;
  cfg: Config;
  state: State;
  last: { label: string; touched: number } | null;
  differences: readonly Difference[];
}

/** What the strategy on screen just did, and whether what it shows is right: all from the engine's own counts. */
export function playCaption({ strategy, cfg, state, last, differences }: CaptionInput): ReactNode {
  const name = STRATEGIES.find((s) => s.value === strategy)!.label;
  const stale = differences.length > 0;
  const first = differences[0];
  return (
    <>
      {name}: {last ? <>you {last.label}, touching {hl('info', rows(last.touched))}.</> : <>press an operation to see how many rows it touches.</>}{' '}
      {strategy === 'live' ? <>The answer is computed from the base tables on every read, so it is {hl('ok wrap', 'equal to the live query by construction')} and each read costs the same as scanning them.</> : null}
      {strategy === 'full' ? <>The view is rebuilt every {cfg.refreshEvery} operations; it is {state.writesSince} {state.writesSince === 1 ? 'write' : 'writes'} behind and {stale ? <>{hl('bad', 'differs from the live query')} ({first.what}: shown {first.shown ?? 'none'}, live {first.live ?? 'none'})</> : hl('ok', 'equals the live query right now')}.</> : null}
      {strategy === 'incremental' ? <>Every write also updates the aggregate rows it affects, so the view {stale ? hl('bad', 'differs from the live query') : hl('ok', 'equals the live query')} after each write.{cfg.brokenRefund ? <> The refund rule is the planted bug: it forgets to subtract the refunded item{stale ? <> ({first.what}: shown {first.shown ?? 'none'}, live {first.live ?? 'none'}), and no error is raised.</> : <>, so the first refund will drift it without any error.</>}</> : null}</> : null}
      {strategy === 'copy' ? <>The product name is copied into each item when it is written. {inconsistentCopies(state.world) > 0 ? <>{hl('bad', `${inconsistentCopies(state.world)} ${inconsistentCopies(state.world) === 1 ? 'copy has' : 'copies have'} an old name`)}, so the dashboard shows two names for one product.</> : <>Every copy matches its product ({hl('ok', 'consistent')}).</>} Fix: {cfg.fix === 'none' ? 'none' : cfg.fix === 'update' ? 'update every copy in the same transaction' : 'recompute from the source on read'}.</> : null}
    </>
  );
}

/** The crossover sentence of the workload scene. */
export function crossoverCaption(w: World, cfg: Config, ratio: number, totals: readonly { label: string; total: number; right: boolean }[]): ReactNode {
  const x = crossover('incremental', 'live', cfg, w);
  const best = cheapestRight(totals);
  const cheaperWrong = totals.filter((t) => !t.right && t.total < best.total);
  const worst = totals.reduce((a, b) => (b.total > a.total ? b : a));
  return (
    <>
      At {sig(ratio, 3)} reads per write the cheapest right answer is {hl('ok', best.label)} at {best.total.toLocaleString('en-US')} rows touched and the dearest is {hl('bad', worst.label)} at {worst.total.toLocaleString('en-US')}.{cheaperWrong.length > 0 ? <> {cheaperWrong.map((t) => t.label).join(' and ')} cost{cheaperWrong.length === 1 ? 's' : ''} less, but {cheaperWrong.length === 1 ? 'its answer differs' : 'their answers differ'} from the live query at the end.</> : null}
      {x === null ? null : x === 0 ? <> The incremental view is cheaper than the live join from the first read.</> : <> The incremental view starts to beat the live join at {hl('violet', `${ratioText(x)} reads per write`)}.</>}
    </>
  );
}
