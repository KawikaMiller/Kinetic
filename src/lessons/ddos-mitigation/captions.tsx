import type { ReactNode } from 'react';
import { integer, pct, plural, sig } from '../../core/format';
import { CLASS_NAME, DEFENCES, DEFENCE_NAME, LEGIT_RATE, RESOURCE, TARGET, UNIT_NAME, type OriginInput, type OriginResult } from './origin';
import { LEGIT_TOTAL, type PopsResult, type ScrubPoint } from './pops';
import { MODE_NAME, SLOTS, type SynState, type Mode } from './syn';

export const listWords = (items: readonly string[]): string => (items.length < 3 ? items.join(' and ') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);

const article = (word: string): string => (/^[aeiou]/i.test(word) ? 'An' : 'A');
/** Lower-cases a resource name but keeps an acronym such as CPU. */
const noun = (name: string): string => (/^[A-Z]{2}/.test(name) ? name : name.toLowerCase());

export function originCaption(input: OriginInput, r: OriginResult): ReactNode {
  const res = RESOURCE[TARGET[input.cls]];
  const on = DEFENCES.filter((d) => input.defences[d]).map((d) => DEFENCE_NAME[d]);
  if (input.rate === 0) return <>No unwanted load: all {LEGIT_RATE} legitimate requests a second are served.</>;
  return (
    <>
      {article(CLASS_NAME[input.cls])} {CLASS_NAME[input.cls]} stream of {integer(input.rate)} {UNIT_NAME[input.cls]} (an abstract rate, nothing is sent) {on.length ? `with ${listWords(on)}` : 'with no defence'}: {integer(Math.round(r.admittedRate))} {UNIT_NAME[input.cls]} gets through.{' '}
      {r.saturated.length === 0 ? (
        <span className="hl ok wrap">{noun(res.name)} holds, and all {LEGIT_RATE} legitimate requests a second are served</span>
      ) : (
        <span className="hl bad wrap">
          {listWords(r.saturated.map((id) => noun(RESOURCE[id].name)))} saturated: {sig(r.goodput)} of {LEGIT_RATE} legitimate requests a second are served ({pct(r.goodputShare, 0)})
        </span>
      )}
      .
    </>
  );
}

export function popsCaption(attack: number, skewPct: number, p: PopsResult): ReactNode {
  return (
    <>
      {integer(attack)} Mbit/s of unwanted load and {LEGIT_TOTAL} of legitimate load, against {integer(p.sites.reduce((a, s) => a + s.capacity, 0))} of total capacity, with the catchment {skewPct === 0 ? 'matching each site\'s capacity' : `skewed ${skewPct}% towards site 1`}.{' '}
      {p.overloaded.length === 0 ? (
        <span className="hl ok wrap">no site is overloaded: no legitimate traffic is dropped</span>
      ) : (
        <span className="hl bad wrap">
          {plural(p.overloaded.length, 'site')} overloaded, so {sig(p.legitDropped)} Mbit/s of legitimate traffic is dropped{attack + LEGIT_TOTAL <= p.sites.reduce((a, s) => a + s.capacity, 0) ? ' even though the total capacity covers the whole load' : ''}
        </span>
      )}
      .
    </>
  );
}

export function scrubCaption(p: ScrubPoint): ReactNode {
  return (
    <>
      Dropping flows scored {sig(p.threshold)} or more removes {pct(p.attackRemoved, 0)} of the unwanted flows and drops {pct(p.legitDropped, 0)} of the legitimate ones: {integer(p.confusion.tp)} caught, {integer(p.confusion.fp)} legitimate flows lost, {integer(p.confusion.fn)} unwanted flows missed.
    </>
  );
}

export function synCaption(mode: Mode, s: SynState, tick: number): ReactNode {
  return (
    <>
      Tick {tick}, {MODE_NAME[mode]}: {s.table.length} of {SLOTS} half-open slots in use, {plural(s.started, 'legitimate handshake')} started, {s.completed} completed, {s.dropped} refused.{' '}
      {mode === 'cookies' ? (
        <span className="hl ok wrap">no state is kept after the SYN-ACK, so the flood has nothing to fill</span>
      ) : mode === 'broken' && s.table.length > 0 ? (
        <span className="hl bad wrap">
          the cookie handshake runs, but each SYN took a slot before any cookie was checked, so the flood still fills the table{s.dropped > 0 ? ' and a legitimate SYN found no slot' : ''}
        </span>
      ) : s.dropped > 0 ? (
        <span className="hl bad wrap">the table filled and a legitimate SYN found no slot</span>
      ) : s.table.length === SLOTS ? (
        <span className="hl orange wrap">the table is full of entries that will never complete</span>
      ) : (
        <>The table has room.</>
      )}
    </>
  );
}
