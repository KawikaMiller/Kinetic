import { createRecorder } from '../../core/recorder';
import type { Frame } from '../../core/types';
import { findDuplicate, floyd, hashSetWalk, meetSteps, proof, rho } from './model';

export interface FloydFrame extends Frame {
  phase: 0 | 1 | 2 | 3;
  slow: number;
  /** Null once fast has run off the end of the list. */
  fast: number | null;
  meet: number | null;
  start: number | null;
  /** Phase 3: loop nodes counted so far. */
  measured: number[];
  slowSteps: number;
  fastSteps: number;
  /** Show the "why phase 2 works" numbers. */
  proof: boolean;
}

const blank = (): Omit<FloydFrame, 'say' | 'hold'> => ({ phase: 0, slow: 0, fast: 0, meet: null, start: null, measured: [], slowSteps: 0, fastSteps: 0, proof: false });

/** The linked list: tail mu, loop lambda (or no loop at all). */
export function listFrames(mu: number, lambda: number, loop: boolean): FloydFrame[] {
  const next = rho(mu, lambda, loop);
  const run = floyd((i) => next[i]);
  const rec = createRecorder<FloydFrame>(blank(), { transient: { proof: false } });
  const n = next.length;
  const offset = (x: number) => x - mu;

  rec.snap(<>Slow (S) moves one node per step and fast (F) moves two. If the list loops, fast can never escape, so it must land on slow eventually.</>, undefined, { phase: 1 });

  run.phase1.slice(1).forEach((p, i) => {
    const k = i + 1;
    const patch = { slow: p.slow, fast: p.fast, slowSteps: k, fastSteps: p.fast === null ? rec.get().fastSteps : 2 * k };
    if (p.fast === null) {
      rec.snap(<>Fast hits <b>null</b>: the list has an end, so there's no loop. Slow only got to node {p.slow}.</>, undefined, patch);
    } else if (p.slow === p.fast) {
      rec.snap(
        <>
          <span className="hl">They meet</span> at node {p.slow} after {k} slow steps, within the bound μ + λ = {mu + lambda}.
          {p.slow === mu ? <> Here that's also where the loop starts, but only because μ is a multiple of λ.</> : <> But the loop starts at node {mu}, not here: meeting isn't the start.</>}
        </>,
        undefined,
        { ...patch, meet: p.slow },
      );
    } else if (loop && p.slow >= mu) {
      const gap = (((offset(p.slow) - offset(p.fast)) % lambda) + lambda) % lambda;
      rec.snap(
        <>Both are in the loop. Fast is {gap} step{gap === 1 ? '' : 's'} behind slow and gains exactly 1 per step, so it can't jump over: it lands on slow when the gap hits 0.</>,
        undefined,
        patch,
      );
    } else {
      rec.snap(
        p.fast >= mu && loop
          ? <>Slow is still on the tail at node {p.slow}; fast is already going round the loop at node {p.fast}.</>
          : <>Slow at node {p.slow}, fast at node {p.fast}: fast pulls ahead by one node per step.</>,
        undefined,
        patch,
      );
    }
  });

  if (run.meet === null) {
    rec.close(<>No cycle: fast reached the end of the {n}-node list. Floyd answers "no loop" exactly when the list ends in null, using just two pointers.</>, 2);
    return rec.frames;
  }

  const pr = proof(run, mu);
  rec.snap(
    <>
      Why phase 2 works: slow took k = {pr.k} steps, which is μ + a = {mu} + {pr.a} (a = how many of slow's steps were inside the loop). Fast took 2k = {2 * pr.k}, so its extra k = {pr.k} steps are
      whole laps: {pr.laps} × λ = {pr.laps} × {pr.lambda}. So μ ≡ −a (mod λ): μ more steps from the meeting point land exactly on the loop's start.
    </>,
    2,
    { proof: true },
  );

  rec.snap(<>Phase 2: S goes back to the head, F stays at the meeting point, and now both move one step at a time.</>, undefined, {
    phase: 2, slow: run.phase2[0].slow, fast: run.phase2[0].fast,
  });
  run.phase2.slice(1).forEach((p, i) => {
    const done = p.slow === p.fast;
    rec.snap(
      done
        ? <>They meet at node {p.slow}: that's the <span className="hl ok">start of the loop</span>, reached after μ = {i + 1} step{i === 0 ? '' : 's'}.</>
        : <>One step each: S at node {p.slow}, F at node {p.fast}.</>,
      undefined,
      { slow: p.slow, fast: p.fast, slowSteps: rec.get().slowSteps + 1, fastSteps: rec.get().fastSteps + 1, ...(done && { start: p.slow }) },
    );
  });
  if (run.phase2.length === 1) {
    rec.snap(<>S is already where F is: with μ = 0 the head itself is the <span className="hl ok">start of the loop</span>.</>, undefined, { start: run.start });
  }

  rec.snap(<>Phase 3: keep S at the start and walk F once round the loop, counting nodes.</>, undefined, { phase: 3, measured: [run.start!], fast: run.start });
  run.loop.slice(1).forEach((x, i) => {
    rec.snap(<>Counting the loop: {i + 2}.</>, undefined, { fast: x, measured: run.loop.slice(0, i + 2), fastSteps: rec.get().fastSteps + 1 });
  });
  rec.snap(<>Back at the start: the loop has λ = {run.loop.length} node{run.loop.length === 1 ? '' : 's'}.</>, undefined, { fast: run.start, fastSteps: rec.get().fastSteps + 1 });
  rec.close(
    <>
      Found it: a tail of μ = {run.start} nodes, then a loop of λ = {run.loop.length}. Slow met fast after {meetSteps(run)} steps, and the whole search used two pointers, however long the list.
    </>,
    2,
  );
  return rec.frames;
}

/** Find the duplicate: the array read as a linked list i → a[i], starting at index 0. */
export function arrayFrames(values: readonly number[]): FloydFrame[] {
  const { dup, run } = findDuplicate(values);
  const hash = hashSetWalk(values);
  const count = values.filter((v) => v === dup).length;
  const rec = createRecorder<FloydFrame>(blank());

  rec.snap(<>Read the array as a linked list: from index i, go to index a[i]. Values are 1 … {values.length - 1}, so nothing points back to 0 and the walk must loop.</>, undefined, { phase: 1 });
  run.phase1.slice(1).forEach((p, i) => {
    const met = p.slow === p.fast;
    rec.snap(
      met ? <>S and F meet at index {p.slow}. Now find where the loop is entered.</> : <>S jumps to index {p.slow}; F jumps twice, to index {p.fast}.</>,
      undefined,
      { slow: p.slow, fast: p.fast, slowSteps: i + 1, fastSteps: 2 * (i + 1), ...(met && { meet: p.slow }) },
    );
  });
  rec.snap(<>Phase 2: S back to index 0, F stays; both move one jump at a time.</>, undefined, { phase: 2, slow: 0, fast: run.meet });
  run.phase2.slice(1).forEach((p) => {
    const done = p.slow === p.fast;
    rec.snap(
      done ? <>They meet at index {p.slow}. Two different indices point here, so <b>{p.slow}</b> is a value that appears twice.</> : <>S at index {p.slow}, F at index {p.fast}.</>,
      undefined,
      { slow: p.slow, fast: p.fast, ...(done && { start: p.slow }) },
    );
  });
  rec.close(
    <>
      Duplicate: <span className="hl ok">{dup}</span>. Counting check: {dup} appears {count} times. A hash set walking the same chain stores {hash.stored} indices before it sees a repeat;
      Floyd kept two numbers and never changed the array.
    </>,
    2,
  );
  return rec.frames;
}
