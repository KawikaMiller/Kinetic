/**
 * stream-windowing: every caption, built from the model on screen.
 */
import type { ReactNode } from 'react';
import { droppedCount, heldWindows, refusedPlacements, type Stream } from './engine';
import { EVENT_COUNT, MINUTE, type Evt } from './events';
import { clockLabel } from './layout';
import { disagreeing, type MinuteRow } from './processing';
import type { ResultRow } from './results';
import { membershipCounts, type WindowSpec } from './windows';

const hl = (tone: string, text: ReactNode) => <span className={`hl ${tone}`}>{text}</span>;
const noun = (n: number, one: string, many = `${one}s`): string => (n === 1 ? one : many);
const minuteName = (row: MinuteRow) => `${clockLabel(row.start)} to ${clockLabel(row.end)}`;

export const crossingCount = (events: readonly Evt[]): number => events.filter((e) => Math.floor(e.time / MINUTE) !== Math.floor(e.arrival / MINUTE)).length;

export function disorderCaption(events: readonly Evt[], rows: readonly MinuteRow[], maxDelay: number): ReactNode {
  const crossing = crossingCount(events);
  const wrong = disagreeing(rows);
  const worst = [...wrong].sort((a, b) => Math.abs(b.processing - b.event) - Math.abs(a.processing - a.event))[0];
  return (
    <>
      Each line joins when a click happened (top) to when it arrived (bottom), with delays up to {hl('', `${maxDelay} s`)}. {hl(crossing > 0 ? 'bad' : 'ok', `${crossing} of ${events.length}`)} {noun(events.length, 'click')} cross a minute boundary on the way.{' '}
      {worst ? (
        <>
          Counting by arrival, {minuteName(worst)} gets {hl('info', worst.processing)}; counting by when it happened, {hl('ok', worst.event)}. {wrong.length} of {rows.length} {noun(rows.length, 'minute')} {noun(wrong.length, 'disagrees', 'disagree')}.
        </>
      ) : (
        <>Both clocks give the same count in every minute: with no crossing there is nothing to disagree about.</>
      )}
    </>
  );
}

export function windowsCaption(o: { spec: WindowSpec; arrived: number; events: readonly Evt[]; windows: number }): ReactNode {
  const { spec } = o;
  const progress = <>{o.arrived} of {EVENT_COUNT} events have arrived and sit in {hl('', o.windows)} {noun(o.windows, 'window')}.</>;
  if (spec.kind === 'tumbling') return <>Tumbling windows of {spec.size} s tile the line, so each event lands in exactly {hl('ok', 1)} window. {progress}</>;
  if (spec.kind === 'sliding') {
    const counts = membershipCounts(o.events, spec);
    const text = counts.length === 1 ? `exactly ${counts[0]}` : `between ${counts[0]} and ${counts.at(-1)}`;
    return (
      <>
        A window of {spec.size} s starts every {spec.slide} s, so each event lands in {hl('info', `${text} ${noun(counts.at(-1)!, 'window')}`)}.
        {counts.includes(0) && <> With a slide longer than the size some events land in none: a gap, allowed.</>} {progress}
      </>
    );
  }
  return <>Session windows per key close up a burst: events less than {spec.gap} s apart share one, and an event that bridges two sessions merges them. {progress}</>;
}

export interface WatermarkView {
  stream: Stream;
  rows: readonly ResultRow[];
  n: number;
}

export function watermarkCaption(v: WatermarkView): ReactNode {
  const { stream: s } = v;
  const dropped = droppedCount(s);
  const late = Object.values(s.fates).filter((f) => f === 'late').length;
  const fired = s.windows.filter((w) => w.fired).length;
  return (
    <>
      After {s.k} of {v.n} arrivals the watermark is {Number.isFinite(s.watermark) ? hl('hi', s.watermark) : hl('', 'not set yet')}: the largest event time seen minus the bound of {s.cfg.bound} s. {fired} {noun(fired, 'window')} {noun(fired, 'has', 'have')} fired
      and {heldWindows(s).length} {noun(heldWindows(s).length, 'window')} {noun(heldWindows(s).length, 'is', 'are')} still held. {late > 0 && <>{hl('info', `${late} late ${noun(late, 'event')}`)} counted after firing. </>}
      {dropped > 0 ? <>{hl('bad', `${dropped} ${noun(dropped, 'event')} dropped`)} {s.cfg.sideOutput ? '(kept in the side output)' : '(gone)'}{refusedPlacements(s) > dropped && <>, {refusedPlacements(s)} window placements lost in all</>}: too far behind the watermark for its window.</> : <>Nothing has been dropped.</>}
    </>
  );
}

export function processingCaption(o: { rows: readonly MinuteRow[]; job: 'processing' | 'event'; replay: boolean; maxDelay: number }): ReactNode {
  const wrong = disagreeing(o.rows);
  const worst = [...wrong].sort((a, b) => Math.abs(b.processing - b.event) - Math.abs(a.processing - a.event))[0];
  if (o.job === 'event') {
    return <>An event-time job that keeps every event until the stream ends gives the same answer however the log arrives{o.replay ? ', even read backwards' : ''}: {hl('ok', 'every minute matches the truth')}. A real job cannot wait forever: the Watermarks scene shows what a finite wait drops.</>;
  }
  if (!worst) return <>With a delay bound of {o.maxDelay} s nothing crosses a minute on this seed, so counting by arrival happens to be right here.</>;
  return (
    <>
      Counting by arrival {o.replay ? 'in a replay of the log read backwards ' : ''}is {hl('bad wrap', `wrong in ${wrong.length} of ${o.rows.length} minutes`)}: {minuteName(worst)} says {hl('bad', worst.processing)}, the truth is {hl('ok', worst.event)}.
    </>
  );
}
