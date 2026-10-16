import { Bars, Curve, HLine, Plot2D, VLine } from '../../components/Plot2D';
import { EVENT_TONE, PHASE_TONE, queueTop, rttTop, windowTop } from './chartMath';
import { bdpOf, bufferOf, thresholdOf, type LinkSetup, type RoundRec } from './model';

const TINT_SHARE = 0.035;

interface Props {
  recs: readonly RoundRec[];
  /** Draw rounds up to and including this one. */
  upTo: number;
  link: LinkSetup;
  ariaLabel: string;
  /** y axis title for the window chart. */
  yLabel?: string;
  width?: number;
}

const shown = (recs: readonly RoundRec[], upTo: number) => recs.filter((r) => r.round <= upTo);

/** The window (or BBR's sending rate) per round, with the pipe and the overflow line, phases as tints along the x axis and loss ticks. */
export function WindowChart({ recs, upTo, link, ariaLabel, yLabel = 'segments per round', width }: Props) {
  const top = windowTop(recs, link);
  const some = shown(recs, upTo);
  return (
    <Plot2D x={{ domain: [0, Math.max(1, recs.length - 1)], label: 'round trips', ticks: 6 }} y={{ domain: [0, top], label: yLabel, ticks: 4 }} width={width} height={170} ariaLabel={ariaLabel}>
      <Bars bars={some.map((r) => ({ x0: r.round, x1: r.round + 1, y: top * TINT_SHARE, tone: PHASE_TONE[r.phase] }))} />
      <HLine at={bdpOf(link)} label="BDP" tone="ok" dashed={false} />
      <HLine at={thresholdOf(link)} label="BDP + buffer" tone="bad" />
      {some.filter((r) => r.event).map((r) => (
        <VLine key={r.round} at={r.round + 0.5} tone={EVENT_TONE[r.event as 'loss' | 'timeout']} dashed />
      ))}
      <Curve points={some.map((r) => [r.round, r.sent] as const)} tone="hi" />
    </Plot2D>
  );
}

/** Segments waiting in the buffer, per round. */
export function QueueChart({ recs, upTo, link, ariaLabel, width }: Props) {
  const top = queueTop(link);
  return (
    <Plot2D x={{ domain: [0, Math.max(1, recs.length - 1)], label: 'round trips', ticks: 6 }} y={{ domain: [0, top], label: 'queue, segments', ticks: 3 }} width={width} height={120} ariaLabel={ariaLabel}>
      <HLine at={bufferOf(link)} label="buffer full" tone="bad" />
      <Curve points={shown(recs, upTo).map((r) => [r.round, r.queue] as const)} tone="info" />
    </Plot2D>
  );
}

/** The round trip the sender measures: the base round trip plus the queue's wait. */
export function RttChart({ recs, upTo, link, ariaLabel, width }: Props) {
  const top = rttTop(recs, link);
  return (
    <Plot2D x={{ domain: [0, Math.max(1, recs.length - 1)], label: 'round trips', ticks: 6 }} y={{ domain: [0, top], label: 'round trip, ms', ticks: 3 }} width={width} height={120} ariaLabel={ariaLabel}>
      <HLine at={link.rttMs} label="base" tone="dim" />
      <Curve points={shown(recs, upTo).map((r) => [r.round, r.rttMs] as const)} tone="violet" />
    </Plot2D>
  );
}
