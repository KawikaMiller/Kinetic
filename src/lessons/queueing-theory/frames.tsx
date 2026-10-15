import type { ReactNode } from 'react';
import { pctText, sig } from '../distributions/fmt';
import {
  BOUNDARY_NAME, MU, POOL_SERVERS, SHAPE_CV2, SHAPE_KENDALL, TOPOLOGIES, TOPOLOGY_NAME, mm1Multiple, theory, topologyTheory, type Boundary, type LittleRun,
  type ServiceShape, type Topology,
} from './model';

const pct0 = (rho: number) => pctText(rho, 0);

export function liveCaption(rho: number, shape: ServiceShape): ReactNode {
  const t = theory(rho, shape);
  const lambda = rho * MU;
  if (t === null) {
    return (
      <>
        At ρ = {pct0(rho)} arrivals come at {sig(lambda)} jobs/s against a service rate of {MU}/s, so there is{' '}
        <span className="hl bad">no steady state</span>: the {SHAPE_KENDALL[shape]} queue has no average to settle on
        {rho > 1 ? <>, and it keeps growing by about {sig((rho - 1) * MU)} jobs/s once the server never idles</> : <> (it wanders and drifts upward)</>}.
        No formula is printed, because none applies.
      </>
    );
  }
  return (
    <>
      At ρ = {pct0(rho)} with {SHAPE_KENDALL[shape]} (CV² = {SHAPE_CV2[shape]}), theory says a job spends{' '}
      <span className="hl violet">W = {sig(t.W)} s</span> in the system ({sig(t.W * MU)} service times), of which{' '}
      <span className="hl violet">{sig(t.Wq)} s</span> is waiting, with {sig(t.L)} jobs in the system on average.
      {shape !== 'exp' && <> The Pollaczek-Khinchine factor (1 + CV²)/2 = {sig(t.factor)} makes the wait {sig(t.factor)}× the M/M/1 wait.</>}
    </>
  );
}

export function littleCaption(run: LittleRun): ReactNode {
  const gap = Math.abs(run.area - run.sum);
  return (
    <>
      {BOUNDARY_NAME[run.boundary]}: over {sig(run.window, 4)} s and {run.jobs.toLocaleString('en-US')} jobs, the area under N(t) is {sig(run.area, 6)} job·s and the sum of the
      jobs&apos; times is {sig(run.sum, 6)} job·s: they differ by {gap.toExponential(1)}. So L = {sig(run.L)} = λ·W = {sig(run.lambda)} × {sig(run.W)}.
    </>
  );
}

export function sizingCaption(rate: number, seconds: number, inFlight: number): ReactNode {
  return (
    <>
      {sig(rate)} requests/s × {sig(seconds)} s each is <span className="hl">{sig(inFlight)}</span> requests in flight on average: that is the number of connections
      or workers busy at once, before any allowance for bursts.
    </>
  );
}

const topologiesLongestFirst = (values: Record<Topology, number>): Topology[] => [...TOPOLOGIES].sort((a, b) => values[b] - values[a]);

export function poolCaption(rho: number): ReactNode {
  const theories = Object.fromEntries(TOPOLOGIES.map((t) => [t, topologyTheory(t, rho)])) as Record<Topology, ReturnType<typeof topologyTheory>>;
  const W = Object.fromEntries(TOPOLOGIES.map((t) => [t, theories[t].W])) as Record<Topology, number>;
  const Wq = Object.fromEntries(TOPOLOGIES.map((t) => [t, theories[t].Wq])) as Record<Topology, number>;
  const bySystem = topologiesLongestFirst(W);
  const byWait = topologiesLongestFirst(Wq);
  const worst = bySystem[0];
  const best = bySystem[bySystem.length - 1];
  const bestWait = byWait[byWait.length - 1];
  return (
    <>
      At ρ = {pct0(rho)} per server, the mean time in system is longest for {TOPOLOGY_NAME[worst]} ({sig(W[worst])} s) and shortest for {TOPOLOGY_NAME[best]}{' '}
      ({sig(W[best])} s), {sig(W[worst] / W[best])}× less. For waiting alone the order, longest to shortest, is{' '}
      {byWait.map((t) => TOPOLOGY_NAME[t]).join(', then ')}.
      {best === 'fast' && bestWait === 'pool' && (
        <> The shared queue waits least, but the fast server finishes each job {POOL_SERVERS}× sooner, which is why it wins overall.</>
      )}
    </>
  );
}

export function curveCaption(rho: number): ReactNode {
  const here = mm1Multiple(rho);
  const next = rho + 0.1 < 1 ? mm1Multiple(rho + 0.1) : null;
  return (
    <>
      At ρ = {pct0(rho)} an M/M/1 job spends <span className="hl violet">{sig(here)}×</span> its service time in the system.
      {next !== null && <> Ten more points of utilisation make that {sig(next)}× ({sig(next / here)}× as long).</>} There is no corner on the curve: the knee is
      wherever you decide the wait stops being acceptable.
    </>
  );
}

export function boundaryNote(boundary: Boundary): string {
  return {
    system: 'L = λ·W for jobs anywhere in the system.',
    queue: 'Lq = λ·Wq for jobs waiting in the queue.',
    server: 'Jobs in service: L = λ·E[S], the server\'s utilisation.',
  }[boundary];
}
