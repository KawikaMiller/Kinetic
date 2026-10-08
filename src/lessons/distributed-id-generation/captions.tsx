import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { FORMAT_NAMES } from './anatomy';
import type { FormatId } from './formats';
import { BURST_LIMIT, type Attempt, type BurstRun } from './limits';
import type { SortKey, TradeoffRow } from './tradeoffs';
import { formatCount, formatProbability } from './odds';
import type { Snapshot } from './btree';

const WHAT: Record<FormatId, ReactNode> = {
  autoincrement: <>one counter, so every ID is the last one plus one. Nothing to coordinate inside one database, and anyone can see how many rows came before.</>,
  uuidv4: <>122 random bits with <span className="hl">version</span> and variant bits laid over them. Nothing is shared between machines, and nothing in the ID says when it was made.</>,
  uuidv7: <>a 48-bit <span className="hl info">millisecond timestamp</span> first, then <span className="hl">version</span> and variant bits, a 12-bit counter and random bits. Newer IDs sort after older ones.</>,
  ulid: <>a 48-bit <span className="hl info">millisecond timestamp</span> then 80 random bits, written in 26 Crockford base32 characters that sort as text.</>,
  snowflake: <>a <span className="hl info">41-bit timestamp</span>, a <span className="hl violet">10-bit machine ID</span> and a <span className="hl orange">12-bit sequence</span> in 64 bits. Uniqueness comes from giving every machine its own ID.</>,
};

export const anatomyCaption = (format: FormatId): ReactNode => <><b>{FORMAT_NAMES[format]}</b>: {WHAT[format]}</>;

export function indexCaption(format: FormatId, s: Snapshot): ReactNode {
  const name = FORMAT_NAMES[format];
  if (s.inserts === 0) return <>Press a format and drag the slider: each cell is one leaf page of the index, and the inserts have not started.</>;
  return <>After <b>{s.inserts.toLocaleString('en-US')}</b> {name} inserts the index has <b>{s.pages.length}</b> pages. The last 100 inserts wrote to{' '}
    <span className="hl">{plural(s.touched, 'page')}</span>, and <span className="hl bad">{plural(s.middleSplits, 'page split')}</span> moved keys around so far.
    {s.touched <= 3 ? ' New keys sort after every old one, so they pile onto the right-hand edge.' : ' New keys land anywhere, so each insert may need a page that is not in memory.'}</>;
}

export function burstCaption(run: BurstRun): ReactNode {
  const last = run.perMs.at(-1)!;
  return <>One machine asked for <b>{run.total.toLocaleString('en-US')}</b> IDs at once. A millisecond holds <b>{BURST_LIMIT.toLocaleString('en-US')}</b>, so it filled {run.perMs.length === 1 ? 'one millisecond' : `${run.perMs.length} milliseconds`}
    {run.waits > 0 ? <>, <span className="hl orange">waiting {plural(run.waits, 'time')}</span> for the clock to reach the next one, and the last millisecond holds {last.count.toLocaleString('en-US')}</> : ' with room to spare'}. All {run.unique.toLocaleString('en-US')} are different.</>;
}

export function clockCaption(policy: 'refuse' | 'wait' | 'ignore', run: readonly Attempt[]): ReactNode {
  const dups = run.filter((a) => a.duplicate).length;
  if (policy === 'ignore') return <>The clock stepped back from 104 to 102 and this generator carried on. It now repeats the IDs of milliseconds 102 to 104: <span className="hl bad">{plural(dups, 'duplicate')}</span> in this run.</>;
  const held = run.filter((a) => a.id === null).length;
  return <>The clock stepped back from 104 to 102. The generator <span className="hl orange">{policy === 'refuse' ? 'refuses' : 'waits'}</span> for {plural(held, 'attempt')} until the clock reads 104 again, so there are <span className="hl ok">{dups} duplicates</span>.</>;
}

export function machineCaption(a: number, b: number, run: readonly Attempt[]): ReactNode {
  const dups = run.filter((x) => x.duplicate).length;
  return a === b
    ? <>Both machines have ID <b>{a}</b>, so with the same clock and the same sequence they make the same IDs: <span className="hl bad">{plural(dups, 'duplicate')}</span>. Nothing but the machine ID tells them apart.</>
    : <>Machines <b>{a}</b> and <b>{b}</b> read the same clock and count the same sequence, and their IDs still differ: <span className="hl ok">{dups} duplicates</span>. The machine ID has to be handed out uniquely, which is the coordination this design needs.</>;
}

export function oddsCaption(n: number, p32: number, p122: number): ReactNode {
  return <>With <b>{formatCount(n)}</b> IDs, a <span className="hl orange">32-bit</span> random ID has a <b>{formatProbability(p32)}</b> chance of at least one repeat. A <span className="hl ok">122-bit</span> one has {formatProbability(p122)}.</>;
}

const SORT_WORDS: Record<SortKey, string> = {
  format: 'name',
  size: 'size',
  sortable: 'whether IDs sort in creation order',
  leaks: 'whether the ID reveals when it was made',
  coordination: 'what has to be agreed between machines',
  locality: 'where new keys land in an index',
};
export const tradeoffCaption = (key: SortKey, rows: readonly TradeoffRow[]): ReactNode =>
  <>Sorted by <b>{SORT_WORDS[key]}</b>: {rows.map((r) => r.format).join(', ')}. No format wins every column: pick the trade-off that fits.</>;
