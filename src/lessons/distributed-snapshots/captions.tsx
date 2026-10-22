import type { ReactNode } from 'react';
import { integer, plural } from '../../core/format';
import { TOTAL_TOKENS } from './snapshot';
import type { Offence, Result } from './sim';

/** The offending message of a failed closure check, in words that name both cuts. */
export function offenceText(o: Offence): string {
  if (o.kind === 'marker') return `a marker sent by ${o.from} after ${o.from}'s cut was received by ${o.to} before ${o.to}'s cut`;
  return `${plural(o.amount ?? 0, 'token')} sent by ${o.from} after ${o.from}'s cut, received by ${o.to} before ${o.to}'s cut: ${o.to}'s record includes tokens ${o.from}'s record still holds`;
}

/** What the two independent checks say about a finished snapshot. */
export function verdictWords(r: Result): ReactNode {
  const total = `${r.total} of ${TOTAL_TOKENS}`;
  if (!r.finished) return <>The snapshot has not finished in this run.</>;
  if (r.conservation && r.closure.closed) return <>This run&apos;s snapshot passed both checks: the record sums to {total} and the cut is closed.</>;
  return (
    <>
      The record sums to {total}
      {r.difference === 0 ? '' : r.difference < 0 ? `: ${-r.difference} missing` : `: ${r.difference} counted twice`}.{' '}
      {r.closure.offence
        ? <span className="hl bad wrap">{offenceText(r.closure.offence)}</span>
        : r.mismatched.length > 0
          ? <span className="hl bad wrap">The channel from {r.mismatched[0].from} to {r.mismatched[0].to} held {r.mismatched[0].inFlight} tokens at the cut but the record has {r.mismatched[0].recorded}: a marker overtook them</span>
          : r.method === 'naive'
            ? <>The cut is closed, but a naive cut records no channel contents: tokens in flight at the cut are in nobody&apos;s record{r.lostInCut > 0 ? `, and C dropped ${plural(r.lostInCut, 'token')} inside it` : ''}.</>
            : <>The recorded channel contents match what was in flight at the cut, so on these channels the difference is not a recording artefact.</>}
    </>
  );
}

/** Scene 2. */
export function fifoCaption(a: { sends: number; fifoStates: number; counterexample: number | null; failing: number; seeds: number }): ReactNode {
  return (
    <>
      Two processes, 2 tokens each, up to {a.sends} transfer{a.sends === 1 ? '' : 's'} each. With FIFO channels the search visited {integer(a.fifoStates)} states and conserved the total in all of them; without FIFO it found a counterexample of {a.counterexample} steps.
      Sampled on three processes, non-FIFO channels fail on {a.failing} of {a.seeds} seeds.
    </>
  );
}

/** Scene 3. */
export function bugCaption(a: { bug: boolean; method: 'naive' | 'markers'; result: Result }): ReactNode {
  const { result } = a;
  if (!a.bug) return <>No bug in this run. {verdictWords(result)}</>;
  if (a.method === 'markers' && result.closure.closed && result.difference < 0) {
    return <>C drops some of the tokens it receives. On these FIFO channels a cut that passes the closure check makes the shortfall of {plural(-result.difference, 'token')} <span className="hl bad">real</span>: they are missing, not in flight.</>;
  }
  if (a.method === 'naive') {
    if (result.difference === 0) {
      return <>The naive cut records {result.total} of {TOTAL_TOKENS} on this seed, but only because its errors cancel (C dropped {result.lostInCut} inside the cut): that is luck, not a pass. Try another seed.</>;
    }
    return <>The naive cut records {result.total} of {TOTAL_TOKENS}. The {Math.abs(result.difference)} difference mixes tokens in flight, double counts and what C dropped ({result.lostInCut} inside the cut), and nothing in the record tells them apart.</>;
  }
  return <>C drops some of the tokens it receives, but this run lost none inside the cut. {verdictWords(result)}</>;
}
