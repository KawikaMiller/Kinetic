import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { ALGOS, SAFETY, VIDEO_SECONDS, bufferMap, score, type AlgoId, type Run, type Seg, type Weights } from './abr';
import { POPULAR_RANK, TAIL_RANK, titleRatio, type Replay } from './cdn';
import type { LadderResult } from './ladder';

const f1 = (x: number) => x.toFixed(1);
const f2 = (x: number) => x.toFixed(2);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const algoLabel = (a: AlgoId) => ALGOS.find((x) => x.id === a)!.label;

export interface PlayFrame extends Frame {
  /** Index of the segment that has just landed, or -1 before the first. */
  k: number;
  /** The wall time the frame stands at. */
  now: number;
}

function decision(algo: AlgoId, s: Seg): ReactNode {
  if (algo === 'naive') return <>the naive player always asks for the top rendition, {s.bitrate} Mbit/s</>;
  if (algo === 'rate') {
    if (s.estimateBefore === null) return <>there is no throughput estimate yet, so it asks for the lowest rendition, {s.bitrate} Mbit/s</>;
    const cap = SAFETY * s.estimateBefore;
    return (
      <>
        the estimate is {f1(s.estimateBefore)} Mbit/s and {SAFETY} of it is {f2(cap)}, so it asks for {s.bitrate} Mbit/s{s.bitrate > cap ? ' (nothing fits, so the lowest)' : ''}
      </>
    );
  }
  return (
    <>
      the buffer holds {f1(s.bufferBefore)} s, which the buffer map turns into {f2(bufferMap(s.bufferBefore))} Mbit/s, so it asks for {s.bitrate} Mbit/s
    </>
  );
}

export function playFrames(run: Run, algo: AlgoId): PlayFrame[] {
  const intro: PlayFrame = {
    k: -1,
    now: 0,
    say: (
      <>
        A {VIDEO_SECONDS}-second video is cut into {plural(run.count, 'segment')} of {run.S} s. The {algoLabel(algo)} player asks for them one at a time, and the <span className="hl info">buffer</span> counts the seconds already downloaded.
      </>
    ),
  };
  if (run.stuckAt !== null && run.segs.length === 0) {
    return [
      intro,
      {
        k: -1,
        now: 0,
        say: (
          <>
            <span className="hl bad">Stalled, no data arriving</span>: the throughput is zero, so segment {run.stuckAt + 1} never finishes. The player is not slow: it is waiting for bytes that do not come.
          </>
        ),
      },
    ];
  }
  const frames: PlayFrame[] = [intro];
  run.segs.forEach((s, k) => {
    frames.push({
      k,
      now: s.end,
      say: (
        <>
          Segment {k + 1} of {run.count}: {decision(algo, s)}. It takes {f1(s.end - s.start)} s ({f1(s.sample)} Mbit/s).{' '}
          {s.waited > 0 ? <>The buffer was full, so the request waited {f1(s.waited)} s first. </> : null}
          {k === 0 ? (
            <>
              Playback starts after a <span className="hl">startup delay of {f1(run.startup)} s</span>.
            </>
          ) : s.stall > 0 ? (
            <>
              The buffer ran dry {f1(s.stall)} s before it landed: <span className="hl bad">a stall of {f1(s.stall)} s</span>.
            </>
          ) : (
            <>The buffer is now {f1(s.bufferAfter)} s.</>
          )}
        </>
      ),
    });
  });
  const last = run.segs[run.segs.length - 1];
  frames.push({
    k: run.segs.length - 1,
    now: last.end,
    say: run.wall === null ? (
      <>
        <span className="hl bad">Stalled, no data arriving</span> from segment {run.stuckAt! + 1} on: the throughput is zero, so it never finishes.
      </>
    ) : (
      <>
        The whole video played in {f1(run.wall)} s: startup {f1(run.startup)} s, <span className={run.stallCount > 0 ? 'hl bad' : 'hl ok'}>{plural(run.stallCount, 'stall')} totalling {f1(run.stallTime)} s</span>, average bitrate {f2(run.avgBitrate)} Mbit/s, {plural(run.switches, 'switch', 'switches')}.
      </>
    ),
  });
  return frames;
}

export function compareCaption(runs: { algo: AlgoId; run: Run }[], w: Weights): ReactNode {
  if (runs.every((r) => r.run.wall === null)) return <><span className="hl bad">Stalled, no data arriving</span>: every player waits at the first segment, so there is nothing to compare.</>;
  const scored = runs.map((r) => ({ ...r, score: score(r.run, w) }));
  const best = scored.reduce((m, x) => (x.score > m.score ? x : m));
  const switches = (a: AlgoId) => scored.find((x) => x.algo === a)?.run.switches ?? 0;
  const switchNote =
    switches('buffer') > switches('rate') ? <> The buffer-based player switched {switches('buffer')} times against {switches('rate')}: its rule steps through the ladder as the buffer level moves between the reservoir and the cushion.</> : null;
  return (
    <>
      By your weights the <span className="hl ok">{algoLabel(best.algo)}</span> player scores highest ({f2(best.score)}). Stalled time: {scored.map((x) => `${algoLabel(x.algo)} ${f1(x.run.stallTime)} s`).join(', ')}. Change a weight and the winner can change: there is no correct set.
      {switchNote}
    </>
  );
}

export function cdnCaption(r: Replay): ReactNode {
  const pop = titleRatio(r, POPULAR_RANK);
  const tail = titleRatio(r, TAIL_RANK);
  return (
    <>
      The most popular title hit <span className="hl ok">{pop.ratio === null ? 'no requests' : pct(pop.ratio)}</span> of its {plural(pop.requests, 'request')}; title {TAIL_RANK}, deep in the long tail, hit{' '}
      <span className="hl bad">{tail.ratio === null ? 'none (it was never requested)' : pct(tail.ratio)}</span> of its {plural(tail.requests, 'request')}. Overall {pct(r.hitRatio)} hit, so the origin served {r.misses.toLocaleString('en-US')} of {r.requests.toLocaleString('en-US')} requests.
    </>
  );
}

export function ladderCaption(results: readonly LadderResult[], slow: number): ReactNode {
  const by = (n: number) => results.find((r) => r.size === n)!;
  return (
    <>
      With {slow}% slow viewers, a one-rendition ladder lets {pct(by(1).share)} of all viewers play, three renditions {pct(by(3).share)} and five renditions {pct(by(5).share)}, at average bitrates, among the viewers who can play, of {f2(by(1).avgBitrate)}, {f2(by(3).avgBitrate)} and {f2(by(5).avgBitrate)} Mbit/s. The storage per title grows {f1(by(1).storageGb)}, {f1(by(3).storageGb)}, {f1(by(5).storageGb)} GB.
    </>
  );
}
