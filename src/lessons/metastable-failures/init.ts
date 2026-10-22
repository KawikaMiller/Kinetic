/** What each scene opens in (pure), plus the sentences the captions and panels are built from. */
import { decimal } from '../../core/format';
import {
  BROKEN_SEED, CAPACITY, LONG_OUTAGE, QMAX, RATIO, RECOVERY_HORIZON, RUN_TICKS, TRIGGER_START, TRIGGER_CAPACITY, JITTER, budgetedLoad, crossoverLoad, defaultParams, drainTime,
  effectiveLoad, firstOrderTipping, measuredTipping, shedCrossover, slowDrainTicks, sustainVerdict,
  type MetaParams, type MetaRun, type Phase,
} from './model';

export interface LoopState {
  params: MetaParams;
  /** Ticks of the run shown so far. */
  shown: number;
  /** Collapse share per load, measured on request. */
  sweep: { retries: number; timeout: number; points: { lambda: number; share: number }[] } | null;
}
export const STEP_TICKS = 10;
export const initialLoop = (): LoopState => ({ params: { ...defaultParams(), seed: BROKEN_SEED }, shown: 0, sweep: null });

export interface FixState {
  seed: number;
  cancel: boolean;
  budgetOn: boolean;
  ratio: number;
  jitterOn: boolean;
  jitter: number;
  shedOn: boolean;
  qmax: number;
  long: boolean;
  /** Collapse share per trigger length, with and without the chosen mitigations, measured on request. */
  sweep: { key: string; points: { trigger: number; none: number; chosen: number }[] } | null;
}
export const initialFix = (): FixState => ({
  seed: BROKEN_SEED, cancel: false, budgetOn: false, ratio: RATIO.default, jitterOn: false, jitter: JITTER.default, shedOn: false, qmax: QMAX.default, long: false, sweep: null,
});

/** The params a fix scene runs: the defaults of scene 1 plus whichever mitigations are on (and the long-outage preset). */
export function fixParams(f: FixState): MetaParams {
  return {
    ...defaultParams(),
    seed: f.seed,
    trigger: f.long ? LONG_OUTAGE : defaultParams().trigger,
    cancel: f.cancel,
    budget: f.budgetOn ? f.ratio : null,
    jitter: f.jitterOn ? f.jitter : null,
    shed: f.shedOn ? f.qmax : null,
  };
}

export const noMitigation = (f: FixState): MetaParams => ({ ...fixParams(f), cancel: false, budget: null, jitter: null, shed: null });

export const anyMitigation = (f: FixState): boolean => f.cancel || f.budgetOn || f.jitterOn || f.shedOn;

export function phaseText(phase: Phase, recoveredAt: number | null, ticks = RUN_TICKS): string {
  if (phase === 'no trigger') return 'no trigger';
  if (phase === 'recovered') return `recovered at tick ${recoveredAt}`;
  if (phase === 'collapsed') return `still collapsed at tick ${ticks}`;
  return `still recovering at tick ${ticks}`;
}

/** The sustaining test, from the model: the load the queue sees when everything times out, against capacity. */
export function sustainText(p: Pick<MetaParams, 'lambda' | 'retries'>): string {
  const eff = effectiveLoad(p.lambda, p.retries);
  const head = `${p.lambda} x (1 + ${p.retries}) = ${eff} arrivals a tick against a capacity of ${CAPACITY}:`;
  const verdict = sustainVerdict(p.lambda, p.retries);
  if (verdict === 'drains') return `${head} below it, so on average the queue drains on its own.`;
  if (verdict === 'near') return `${head} close to it, so noise decides: some runs drain and some keep the loop going.`;
  const harmless = p.lambda <= TRIGGER_CAPACITY ? ` At a load of ${p.lambda} the trigger's capacity of ${TRIGGER_CAPACITY} is not even overloaded, so nothing starts the loop.` : '';
  return `${head} above it, so the loop can sustain itself once the queue is long enough that everything times out.${harmless}`;
}

/** The slow-drain note under the load sweep: dots left of the crossover that are above zero are long drains, not the loop. */
export function sweepDrainNote(points: readonly { lambda: number; share: number }[], retries: number, trigger: number): string {
  const crossover = crossoverLoad(retries);
  const slow = points.filter((p) => p.lambda < crossover && p.share > 0 && (slowDrainTicks(p.lambda, trigger) ?? 0) > RECOVERY_HORIZON);
  const line = crossover > points.reduce((m, p) => Math.max(m, p.lambda), 0) ? `There is no crossover in this range at R = ${retries}: the loop cannot sustain itself below a load of ${decimal(crossover, 0)}. ` : '';
  if (slow.length === 0) return line;
  const parts = slow.map((p) => `load ${p.lambda} (backlog ${trigger * (p.lambda - TRIGGER_CAPACITY)}, about ${decimal(slowDrainTicks(p.lambda, trigger) ?? 0, 0)} ticks to drain)`);
  return `${line}Dots above zero left of the line are slow drains, not the loop: ${parts.join(', ')}, longer than the ${RECOVERY_HORIZON}-tick horizon that "recovered" is judged at.`;
}

/** The note on the trigger-length sweep: the first-order estimate against where the unmitigated curve actually crosses 50%. */
export function tippingText(points: readonly { trigger: number; none: number }[] | null): string {
  const estimate = firstOrderTipping(defaultParams().lambda, defaultParams().timeout);
  const head = `First-order estimate for the tipping point: d = capacity x timeout / (load - ${TRIGGER_CAPACITY}) = ${decimal(estimate, 0)} ticks, the backlog at which a wait passes the timeout.`;
  if (points === null) return `${head} Measure to see where the unmitigated curve crosses 50%.`;
  const measured = measuredTipping(points);
  if (measured === null) return `${head} The unmitigated curve does not reach 50% in this range.`;
  return `${head} Measured: the unmitigated curve crosses 50% at d = ${measured}. The estimate ignores the retries sent while the trigger runs, which add to the backlog, so the real tipping point comes earlier.`;
}

/** The shedding crossover line: the measured Qmax against the naive capacity x timeout. */
export function shedText(): string {
  const naive = CAPACITY * defaultParams().timeout;
  return `Shedding stops working above a Qmax of about ${shedCrossover()} here (measured: the share of seeds not recovered passes 50%); the naive guess, capacity x timeout = ${naive}, is not exact.`;
}

const ticksText = (n: number): string => `${n} tick${n === 1 ? '' : 's'}`;

export function loopCaption(p: MetaParams, shown: number, phase: Phase, recoveredAt: number | null): string {
  if (shown === 0) return `${sustainText(p)} A trigger of ${p.trigger} ticks cuts capacity to 20 from tick ${TRIGGER_START}. Press Run ${RUN_TICKS} ticks.`;
  if (shown < RUN_TICKS) return `Tick ${shown} of ${RUN_TICKS}. Keep stepping, or press Run ${RUN_TICKS} ticks.`;
  return `After ${RUN_TICKS} ticks: ${phaseText(phase, recoveredAt)}. ${sustainText(p)}`;
}

/** The effective load while the system is collapsed, under the chosen mitigations; null when the formula does not apply (shedding bounds the queue itself). */
export function effectiveFor(p: MetaParams): number | null {
  if (p.shed !== null) return null;
  if (p.cancel) return p.lambda;
  if (p.budget !== null) return budgetedLoad(p.lambda, p.budget);
  return effectiveLoad(p.lambda, p.retries);
}

/** Items queued at the end of the trigger's last tick (0 with no trigger). */
export const backlogAtTriggerEnd = (run: MetaRun): number => (run.params.trigger > 0 ? run.stats[TRIGGER_START + run.params.trigger - 1].queue : 0);

export function fixCaption(p: MetaParams, run: MetaRun, phase: Phase, recoveredAt: number | null): string {
  const backlog = backlogAtTriggerEnd(run);
  const eff = effectiveFor(p);
  const drain = eff === null ? null : drainTime(backlog, eff);
  const after = recoveredAt === null ? 0 : recoveredAt - (TRIGGER_START + p.trigger);
  const longOutage = p.trigger >= LONG_OUTAGE ? ' That is a long outage that drained, not a metastable failure.' : '';
  const measured = phase === 'recovered' && recoveredAt !== null && p.trigger > 0 ? ` This run recovered ${ticksText(after)} after the trigger ended.${longOutage}` : '';
  const shedTail =
    phase === 'collapsed'
      ? `Shedding at Qmax ${p.shed} did not keep the queue short enough, so the loop held. ${shedText()}`
      : 'Shedding bounds the queue itself, so the drain formula does not apply.';
  const tail =
    eff === null
      ? shedTail
      : drain === null
        ? `The effective load ${decimal(eff, 0)} is not below ${CAPACITY}: the backlog does not drain.`
        : `Backlog ${backlog} over (${CAPACITY} - ${decimal(eff, 0)}) is about ${decimal(drain, 0)} ticks to drain (a first-order estimate: the formula ignores that part of the queue is abandoned work).`;
  return `${phaseText(phase, recoveredAt, run.stats.length - 1)}. ${tail}${measured}`;
}
