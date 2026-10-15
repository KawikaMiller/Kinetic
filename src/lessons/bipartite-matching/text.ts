import { assignmentCost, findAugmenting, hallViolator, jobName, maximumMatching, matchingSize, minimumVertexCover, workerName, type Bipartite, type CostMatrix, type Matching, type PathStep, type Search } from './model';

/** "W2-J1-W1-J2-W4-J4": the nodes of an augmenting path in order. */
export function pathNodes(path: readonly PathStep[]): string {
  return path.flatMap((s) => [workerName(s.worker), jobName(s.job)]).join('-');
}

/** The same path in the unit network: forward arrows on unmatched edges, a backward arrow where it passes back through a matched edge. */
export function flowPathText(path: readonly PathStep[]): string {
  const parts = ['s', '→', workerName(path[0].worker)];
  path.forEach((s, i) => {
    parts.push('→', jobName(s.job));
    if (i + 1 < path.length) parts.push('⇠', workerName(path[i + 1].worker));
  });
  parts.push('→', 't');
  return parts.join(' ');
}

const setText = (names: readonly string[]) => `{${names.join(', ')}}`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What the matching scenes say about the search on screen, or about the matching when there is no search. */
export function matchCaption(g: Bipartite, m: Matching, found: Search | null): string {
  const size = matchingSize(m);
  if (found) {
    const from = workerName(found.start);
    if (found.path) {
      const edges = found.path.length * 2 - 1;
      return `Search from ${from}: ${pathNodes(found.path)}. The edges alternate unmatched and matched, ${edges} in all, and end at ${jobName(found.path[found.path.length - 1].job)}, which is free. Flipping it takes the matching from ${size} to ${size + 1}.`;
    }
    return `Search from ${from} reached ${setText(found.workers.map(workerName))} and the jobs ${setText(found.jobs.map(jobName))}: every one of those jobs is held, and none of those workers can move to a free job, so there is no augmenting path from ${from}.`;
  }
  const free = m.flatMap((j, w) => (j < 0 ? [w] : []));
  const target = matchingSize(maximumMatching(g));
  if (free.length === 0) return `Every worker has a job: ${plural(size, 'pair')}, a perfect matching on the workers' side.`;
  const stuck = free.every((w) => !findAugmenting(g, m, w).path);
  return stuck
    ? `${size} of ${plural(g.workers, 'worker')} matched, and no free worker has an augmenting path, so ${size} is the most any matching can reach here (the maximum is ${target}).`
    : `${size} of ${plural(g.workers, 'worker')} matched, but a larger matching exists (${target}). Press Find path to look for an augmenting path from a free worker.`;
}

/** What the Hall scene says: the violator, or that none exists, plus the cover when it is on. */
export function hallCaption(g: Bipartite, showCover: boolean): string {
  const m = maximumMatching(g);
  const size = matchingSize(m);
  const v = hallViolator(g);
  const lead = v
    ? `${setText(v.workers.map(workerName))} ${v.workers.length === 1 ? 'likes' : 'like'} only ${setText(v.neighbourhood.map(jobName))}: ${plural(v.workers.length, 'worker')} cannot fit ${plural(v.neighbourhood.length, 'job')}, so no matching covers every worker. The largest matching has ${size}.`
    : `A largest matching has ${size} and gives every worker a job, so no set of workers is short of jobs.`;
  if (!showCover) return lead;
  const c = minimumVertexCover(g, m);
  const names = [...c.workers.map(workerName), ...c.jobs.map(jobName)];
  return `${lead} A vertex cover of ${plural(names.length, 'node')}, ${setText(names)}, touches every edge; for a bipartite graph the least possible cover is exactly the size of the largest matching.`;
}

/** The costs scene: greedy against optimal, from the two assignments on screen. */
export function costCaption(costs: CostMatrix, greedyA: readonly number[], bestA: readonly number[]): string {
  const g = assignmentCost(costs, greedyA);
  const b = assignmentCost(costs, bestA);
  const pairs = (a: readonly number[]) => a.map((j, w) => `${workerName(w)}-${jobName(j)}`).join(', ');
  return g === b
    ? `Greedy per row costs ${g} and so does the optimum: ${pairs(bestA)}. On this matrix greedy happens to be optimal.`
    : `Greedy per row costs ${g} (${pairs(greedyA)}); the optimal assignment costs ${b} (${pairs(bestA)}), ${g - b} less.`;
}

/** The unit-network scene: the flow value and, when a search is showing, the path as the network's augmenting path. */
export function flowCaption(m: Matching, found: Search | null): string {
  const size = matchingSize(m);
  if (found?.path) return `Augmenting path ${flowPathText(found.path)}: the same alternating path, now drawn as the network's augmenting path. Pushing 1 along it raises the flow from ${size} to ${size + 1}.`;
  if (found) return `Searching from ${workerName(found.start)} finds no path to t: every job it can reach is held, and none of those workers can move to a free job.`;
  return `Flow ${size}: one unit for each matched pair, along s → worker → job → t. The flow value always equals the matching size.`;
}
