import type { Tone } from '../../core/tone';
import { bufferOf, thresholdOf, type LinkSetup, type Phase, type RoundRec } from './model';

/** A y-axis top that stays put while the learner scrubs: the biggest value of the whole run, rounded up to a tidy number. */
export function niceTop(max: number): number {
  const step = max <= 60 ? 10 : max <= 300 ? 50 : 100;
  return Math.max(step, Math.ceil(max / step) * step);
}

export const windowTop = (recs: readonly RoundRec[], link: LinkSetup): number => niceTop(Math.max(thresholdOf(link) * 1.1, ...recs.map((r) => r.sent)));
export const queueTop = (link: LinkSetup): number => niceTop(bufferOf(link) * 1.1);
export const rttTop = (recs: readonly RoundRec[], link: LinkSetup): number => niceTop(Math.max(link.rttMs * 1.1, ...recs.map((r) => r.rttMs)));

/** The plain tint of the phase a round was in: ramp-up amber, steady sky, BBR's drain pink. */
export const PHASE_TONE: Record<Phase, Tone> = {
  'slow-start': 'amber',
  avoidance: 'sky',
  startup: 'amber',
  drain: 'pink',
  'probe-bw': 'sky',
};

export const PHASE_LABEL: Record<Phase, string> = {
  'slow-start': 'slow start',
  avoidance: 'congestion avoidance',
  startup: 'BBR startup',
  drain: 'BBR drain',
  'probe-bw': 'BBR ProbeBW',
};

export const EVENT_TONE = { loss: 'bad', timeout: 'orange' } as const;
