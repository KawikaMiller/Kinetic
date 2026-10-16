import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { GRAPH, LEAKER, ORIGIN, ORIGIN_PREFIX, asName, type Asn } from './asgraph';
import { DECIDED_TEXT, decidedBy, linkLoads, type BgpRun, type Candidate, type Route } from './bgp';
import { prefixLabel, type HijackResult, type HijackSetup } from './hijack';
import { capacityOf } from './asgraph';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** An AS_PATH as routers write it: numbers separated by spaces; empty for the origin's own route. */
export const pathText = (path: readonly Asn[]) => (path.length === 0 ? '(own route)' : path.join(' '));

// ---- scene 1: announcements ------------------------------------------------------------------

export interface AnnounceFrame extends Frame {
  round: number;
}

export function announceFrames(run: BgpRun): AnnounceFrame[] {
  const frames: AnnounceFrame[] = [
    {
      round: 0,
      say: (
        <>
          <span className="hl ok">{asName(ORIGIN)}</span> owns {ORIGIN_PREFIX}. It announces the prefix to its neighbours in an UPDATE whose AS_PATH starts with its own number. Each AS that passes the route on puts its own number in front.
        </>
      ),
    },
  ];
  run.rounds.forEach((r, k) => {
    if (k === 0) return;
    const quiet = r.changed.length === 0;
    const learned = r.changed.slice(0, 3).map((a) => `${asName(a)} now holds ${pathText(r.best[a]?.path ?? [])}`);
    const loops = Object.values(r.candidates).reduce((n, list) => n + list.filter((c) => c.status === 'loop').length, 0);
    frames.push({
      round: k,
      say: quiet ? (
        <>
          Round {k}: <span className="hl ok">nothing changed</span>. {plural(GRAPH.ases.filter((a) => r.best[a]).length, 'AS', 'ASes')} hold a route, and {plural(loops, 'received path')} {loops === 1 ? 'was' : 'were'} discarded because the receiver's own number was already in it.
        </>
      ) : (
        <>
          Round {k}: {plural(r.updates.length, 'UPDATE')} in flight, {plural(r.changed.length, 'AS', 'ASes')} changed their best route. {learned.join('; ')}
          {r.changed.length > 3 ? ` and ${r.changed.length - 3} more` : ''}.
        </>
      ),
    });
  });
  return frames;
}

// ---- scene 2: decision process ---------------------------------------------------------------

/** Why the chosen candidate beat the runner-up, from the candidates themselves; null with fewer than two usable candidates. */
export function explainChoice(list: readonly Candidate[]): { winner: Candidate; rival: Candidate; by: ReturnType<typeof decidedBy> } | null {
  const usable = list.filter((c) => c.status === 'chosen' || c.status === 'candidate');
  const winner = usable.find((c) => c.status === 'chosen');
  if (!winner || usable.length < 2) return null;
  const asRoute = (c: Candidate): Route => ({ path: c.path, via: c.from, rel: c.rel, pref: c.pref });
  const rival = usable
    .filter((c) => c !== winner)
    .sort((a, b) => (b.pref - a.pref) || (a.path.length - b.path.length) || (a.from - b.from))[0];
  return { winner, rival, by: decidedBy(asRoute(winner), asRoute(rival)) };
}

export function policyIntro(as: Asn, list: readonly Candidate[], prefsEdited: boolean): ReactNode {
  const e = explainChoice(list);
  const chosen = list.find((c) => c.status === 'chosen');
  if (!chosen) return <>{asName(as)} has no usable route to {ORIGIN_PREFIX} under these preferences.</>;
  return (
    <>
      {asName(as)} picks the route through {asName(chosen.from)} ({pathText(chosen.path)}).{' '}
      {e ? (
        <>
          It beat the route through {asName(e.rival.from)} on <span className="hl">{DECIDED_TEXT[e.by]}</span>: the decision looks at local preference first, so path length
          {e.by === 'local-pref' ? ' was never compared' : ' decided it only because local preference was tied'}. Latency appears nowhere in the decision.
        </>
      ) : (
        <>It is the only usable route, so there is nothing to compare.</>
      )}
      {prefsEdited ? ' Some local preferences have been edited.' : ''}
    </>
  );
}

// ---- scene 3: export policy ------------------------------------------------------------------

export function leakIntro(policy: 'valley-free' | 'leak', best: Record<Asn, Route | null>): ReactNode {
  const loads = linkLoads({ graph: GRAPH }, best);
  const thin = GRAPH.edges.filter((e) => e.a === LEAKER || e.b === LEAKER);
  const over = thin.filter((e) => (loads.get(e.a < e.b ? `${e.a}-${e.b}` : `${e.b}-${e.a}`) ?? 0) > capacityOf(e.a, e.b));
  const p99 = best[64499];
  if (policy === 'valley-free') {
    return (
      <>
        Valley-free, the common commercial export convention: customer routes go to everyone, peer and provider routes go to customers only. {asName(64499)} reaches {asName(ORIGIN)} through its {p99?.rel ?? 'neighbour'} ({pathText(p99?.path ?? [])}), and{' '}
        {over.length === 0 ? `neither access link of ${asName(LEAKER)} is overloaded` : `${plural(over.length, 'access link')} of ${asName(LEAKER)} ${over.length === 1 ? 'is' : 'are'} overloaded`}.
      </>
    );
  }
  return (
    <>
      <span className="hl bad">A route leak</span>: {asName(LEAKER)} passes the route it learned from one provider to its other provider. {asName(64499)} now sees a customer route and prefers it by local preference, so it sends through {asName(LEAKER)} ({pathText(p99?.path ?? [])}).{' '}
      {over.length > 0 ? `${plural(over.length, 'thin link')} overflow${over.length === 1 ? 's' : ''}.` : 'No thin link overflows.'}
    </>
  );
}

// ---- scene 4: hijack and anycast -------------------------------------------------------------

/** How many of the eight ASes end up at the origin, at the second announcer, or nowhere. */
export function reachCounts(r: HijackResult): { origin: number; second: number; lost: number } {
  const count = (o: 'origin' | 'other' | 'lost') => GRAPH.ases.filter((a) => r.reach[a].outcome === o).length;
  return { origin: count('origin'), second: count('other'), lost: count('lost') };
}

export function hijackIntro(s: HijackSetup, r: HijackResult): ReactNode {
  const second = asName(s.announcer);
  const c = reachCounts(r);
  const equal = r.extra === null;
  return (
    <>
      {second} announces {prefixLabel(r.announced)}
      {s.kind === 'anycast' ? ', and the ROA lists it as a legitimate origin' : s.forged ? ', with the true origin forged at the end of its path' : ''}. Packets to {ipText(r.destination)} from the eight ASes (themselves included): {c.origin}{' '}
      end at {asName(ORIGIN)}, {c.second} at {second}
      {c.lost > 0 ? `, ${c.lost} are lost` : ''}. {equal ? 'Same length: each AS runs its normal decision (local preference first, then path length) on the two origins, so the map splits, and an AS can pick the longer path when a relationship says so.' : 'A more specific prefix wins the longest-prefix match wherever it is heard, whatever the path length.'}{' '}
      {r.validating.length > 0 ? `${plural(r.validating.length, 'AS', 'ASes')} validate origins.` : 'No AS validates origins.'}
    </>
  );
}

export const ipText = (n: number) => [24, 16, 8, 0].map((sh) => (n >>> sh) & 255).join('.');
