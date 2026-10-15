import { GanttLanes, type GanttBar } from '../../components/GanttLanes';
import { WideRegion } from '../../components/WideRegion';
import { barsAt } from '../../core/gantt';
import { clientTone, type HistoryBar } from './historyBars';
import { CLIENTS, barLabel } from './model';

/** The narrowest container that keeps the bars wide enough to read their labels. */
const HISTORY_MIN_WIDTH = 480;
const LABEL_MIN_PX = 26;
const CLIENT_LABEL_W = 44;

/**
 * A read-only timeline of a history, the twin of the editor in scene 1: a write is a solid bar, a read an outlined one, and
 * the bars in `ringed` (the smallest violating subset) wear a `--hi` ring. With `now`, bars still running are drawn part way over their dashed plan.
 */
export function HistoryGantt({
  bars, domain, now, ringed = [], unit = '', ariaLabel,
}: {
  bars: readonly HistoryBar[];
  domain: readonly [number, number];
  now?: number;
  ringed?: readonly string[];
  unit?: string;
  ariaLabel: string;
}) {
  const all: GanttBar[] = bars.map((b) => ({
    id: b.id,
    lane: b.client,
    start: b.start,
    end: b.end,
    tone: clientTone(b.client),
    kind: b.kind === 'write' ? 'work' : 'blocked',
    label: b.label ?? barLabel({ kind: b.kind, value: b.value }),
    ...(ringed.includes(b.id) ? { ring: 'hi' as const } : {}),
  }));
  return (
    <WideRegion minWidth={HISTORY_MIN_WIDTH} label={`${ariaLabel}: scroll sideways to see all of it`}>
      <GanttLanes
        lanes={CLIENTS.map((c) => ({ id: c, label: c }))}
        bars={now === undefined ? all : barsAt(all, now)}
        domain={domain}
        now={now}
        unit={unit}
        axis
        size="md"
        labelWidth={CLIENT_LABEL_W}
        labelMinPx={LABEL_MIN_PX}
        ariaLabel={ariaLabel}
      />
    </WideRegion>
  );
}
