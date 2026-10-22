/** What each scene opens in (pure), plus the sentences the captions and panels are built from. */
import { decimal } from '../../core/format';
import {
  BROKEN_SEED, CAPACITY, LONG_OUTAGE, QMAX, RATIO, RUN_TICKS, TRIGGER_START, JITTER, budgetedLoad, canSustain, defaultParams, drainTime, effectiveLoad,
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
  return canSustain(p.lambda, p.retries)
    ? `${p.lambda} x (1 + ${p.retries}) = ${eff} arrivals a tick against a capacity of ${CAPACITY}: the loop can sustain itself.`
    : `${p.lambda} x (1 + ${p.retries}) = ${eff} arrivals a tick against a capacity of ${CAPACITY}: the queue drains on its own.`;
}

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
  const measured = phase === 'recovered' && recoveredAt !== null && p.trigger > 0 ? ` This run recovered ${recoveredAt - (TRIGGER_START + p.trigger)} ticks after the trigger ended.` : '';
  const tail =
    eff === null
      ? 'Shedding keeps the backlog bounded, so the drain formula does not apply.'
      : drain === null
        ? `The effective load ${decimal(eff, 0)} is not below ${CAPACITY}: the backlog does not drain.`
        : `Backlog ${backlog} over (${CAPACITY} - ${decimal(eff, 0)}) is about ${decimal(drain, 0)} ticks to drain.`;
  return `${phaseText(phase, recoveredAt, run.stats.length - 1)}. ${tail}${measured}`;
}
