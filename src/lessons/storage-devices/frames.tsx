import { bytes, plural } from '../../core/format';
import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { avgRotationalLatencyMs, iops, RPM, throughput, type DiskRun } from './hdd';

export interface HddFrame extends Frame {
  /** Requests served so far (served[0..upto-1]). */
  upto: number;
  /** Indices of the requests this frame serves. */
  current: number[];
}

/** Two decimals below 1 ms, one below 100 ms, whole ms above (the readouts and captions share it). */
export const msText = (v: number) => `${v < 100 ? v.toFixed(v < 1 ? 2 : 1) : Math.round(v)} ms`;
export const rateText = (v: number) => `${Math.round(v).toLocaleString('en-US')}/s`;

/** Requests that need neither a seek nor a rotational wait: they stream straight off the track. */
const streams = (run: DiskRun, i: number) => run.served[i].seek === 0 && run.served[i].rotate === 0;

/**
 * One frame per request, except that a run of back-to-back reads (no seek, no wait) is one
 * frame: they cost nothing but the sector passing under the head.
 */
export function hddFrames(run: DiskRun, fcfsTracks: number): HddFrame[] {
  const rec = createRecorder<HddFrame>({ upto: 0, current: [] }, { transient: { current: [] } });
  rec.snap(
    <>
      {plural(run.served.length, 'read')} queued; the arm is parked at track {run.head}. The platter spins at {RPM.toLocaleString('en-US')} rpm, so a whole turn takes{' '}
      {msText(avgRotationalLatencyMs(RPM) * 2)}.
    </>,
  );
  let i = 0;
  while (i < run.served.length) {
    if (i > 0 && streams(run, i)) {
      let j = i;
      while (j + 1 < run.served.length && streams(run, j + 1)) j++;
      const each = run.served[i].transfer;
      const count = j - i + 1;
      rec.snap(
        <>
          {count === 1 ? <>The next sector is</> : <>The next {count} sectors are</>} on the same track, right behind the last: no seek and no wait, just{' '}
          {msText(each)} each as {count === 1 ? 'it passes' : 'they pass'} under the head.
        </>,
        1.4,
        { upto: j + 1, current: range(i, j) },
      );
      i = j + 1;
      continue;
    }
    const s = run.served[i];
    rec.snap(
      <>
        Read track {s.req.track}, sector {s.req.sector}: seek {s.distance === 0 ? <>none (already on the track)</> : <>{plural(s.distance, 'track')}, {msText(s.seek)}</>}, then wait{' '}
        {msText(s.rotate)} for the sector to come round, then {msText(s.transfer)} to read it.{' '}
        <span className="hl">{movingPct(s.seek + s.rotate, s.end - s.start)}% of this read was moving parts.</span>
      </>,
      1.2,
      { upto: i + 1, current: [i] },
    );
    i++;
  }
  const moving = run.served.reduce((sum, s) => sum + s.seek + s.rotate, 0);
  rec.close(
    <>
      {plural(run.served.length, 'read')} in {msText(run.total)}: {rateText(iops(run))}, {bytes(throughput(run), { base: 1000 })}/s. Seeking and waiting took{' '}
      {movingPct(moving, run.total)}% of the time.{' '}
      {run.order === 'elevator' ? (
        <>The elevator order moved the arm {plural(run.seekTracks, 'track')}; first-come-first-served would move it {plural(fcfsTracks, 'track')}.</>
      ) : (
        <>The arm moved {plural(run.seekTracks, 'track')} in arrival order.</>
      )}
    </>,
    2,
  );
  return rec.frames;
}

/** Whole percent, rounded down, so a read that is 99.6% waiting never reads as 100%. */
export const movingPct = (part: number, whole: number) => (whole === 0 ? 0 : Math.floor((part / whole) * 100));

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, k) => a + k);
