import type { ReactNode } from 'react';
import { superscript } from '../../core/format';
import { RACK_DOWN, chance, fracText, replicaRisk, suiteRed, type Rules } from './model';

const fmt = (n: number) => n.toLocaleString('en-US');

/** Caption for the chosen events: P(A), and the union and independence verdicts when B is set. */
export function eventCaption(aLabel: string, r: Rules, bLabel: string | null): ReactNode {
  const pa = <><span className="hl info">{aLabel}</span> happens in {r.a} of {r.total} equally likely outcomes: P = {fracText({ num: r.a, den: r.total })}.</>;
  if (bLabel === null) return <>{pa} Click cells to build your own event.</>;
  return <>{pa} With B = {bLabel}, they overlap in <span className="hl violet">{r.both}</span>{' '}
    {r.both === 1 ? 'cell' : 'cells'}, so P(A ∪ B) = ({r.a} + {r.b} − {r.both})/{r.total} = {r.either}/{r.total}.{' '}
    {r.independent
      ? <>Independent: {r.both}/{r.total} equals {r.a}/{r.total} × {r.b}/{r.total}.</>
      : <>Not independent: {r.both}/{r.total} isn't {r.a}/{r.total} × {r.b}/{r.total}.</>}</>;
}

/** Caption after rolling: the simulated frequency, always next to the exact value. */
export function rollCaption(label: string, rolls: number, hits: number, r: Pick<Rules, 'a' | 'total'>): ReactNode {
  const freq = hits / rolls;
  const exact = r.a / r.total;
  const gap = Math.abs(freq - exact) * 100;
  return <>{fmt(rolls)} {rolls === 1 ? 'roll' : 'rolls'}: {label} came up {fmt(hits)} {hits === 1 ? 'time' : 'times'}, a frequency of{' '}
    <span className="hl info">{chance(freq)}</span>. The exact chance is <span className="hl ok">{chance(exact)}</span>, {gap < 0.05 ? 'a gap under 0.05 points' : `${gap.toFixed(1)} points away`}.
    {rolls < 1000 ? ' Small samples wander; keep rolling.' : ' The more rolls, the closer the frequency tends to sit.'}</>;
}

/** Caption for the replica calculator: every number from replicaRisk, the verdict from the target. */
export function replicaCaption(n: number, p: number, budget: number, correlated: boolean): ReactNode {
  const { allDown, anyDown } = replicaRisk(n, p, correlated);
  const ok = allDown <= budget;
  const verdict = ok ? <>meets the target (at most {chance(budget)}).</> : <>misses the target of {chance(budget)}.</>;
  if (correlated) {
    const independent = replicaRisk(n, p, false).allDown;
    const rackShare = RACK_DOWN / allDown;
    return <>Shared rack, down {chance(RACK_DOWN)} of the time: P(all down) = {chance(RACK_DOWN)} + (1 − {chance(RACK_DOWN)}) × ({chance(p)})
      {superscript(n)} = <span className="hl orange">{chance(allDown)}</span>, against {chance(independent)} if they were independent.{' '}
      {rackShare > 0.5 ? 'The rack is most of that, so more replicas in the same rack barely help.' : "Here the replicas' own failures still dominate."}
      {' '}That {verdict}</>;
  }
  return <>{n} independent {n === 1 ? 'replica' : 'replicas'}, each down {chance(p)} of the time: P(all down) = ({chance(p)}){superscript(n)} ={' '}
    <span className={`hl ${ok ? 'ok' : 'bad'}`}>{chance(allDown)}</span>, which {verdict} But P(at least one down) = 1 − (1 − {chance(p)}){superscript(n)} ={' '}
    {chance(anyDown)}: more machines, more pages.</>;
}

/** Caption for the flaky suite: exact chance, and the simulated rate once there are runs. */
export function flakyCaption(n: number, f: number, runs: number, red: number): ReactNode {
  const exact = suiteRed(n, f);
  const head = <>{fmt(n)} tests, each flaky {chance(f)} of the time: P(suite red) = 1 − (1 − {chance(f)}){superscript(n)} ={' '}
    <span className="hl bad">{chance(exact)}</span>.</>;
  if (runs === 0) return <>{head} Run the suite to see it happen.</>;
  return <>{head} Simulated: {fmt(red)} of {fmt(runs)} {runs === 1 ? 'run' : 'runs'} went red ({chance(red / runs)}).</>;
}
