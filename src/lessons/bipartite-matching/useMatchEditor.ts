import { useState } from 'react';
import {
  addJob, addWorker, emptyMatching, findAugmenting, flip, greedy, hasEdge, jobName, maximumMatching, presetById, removeJob, removeWorker, toggleEdge, workerName, type Bipartite, type Matching,
  type PresetId, type Result, type Search,
} from './model';

/** Keep only the matched pairs that are still edges between existing nodes. */
const sanitise = (g: Bipartite, m: Matching): Matching => Array.from({ length: g.workers }, (_, w) => (m[w] !== undefined && m[w] >= 0 && m[w] < g.jobs && hasEdge(g, w, m[w]) ? m[w] : -1));

export interface Flipped {
  worker: number;
  job: number;
}

/**
 * The learner's bipartite graph and matching, shared by the first three scenes: a preset, edits by clicking a worker and
 * then a job, a greedy or Kuhn-built matching, the search being shown and the edges the last flip changed.
 */
export function useMatchEditor(scene: string) {
  const [presetId, setPresetId] = useState<PresetId>('greedy');
  const [graph, setGraph] = useState<Bipartite>(presetById('greedy').graph);
  const [matching, setMatching] = useState<Matching>(emptyMatching(presetById('greedy').graph));
  const [selected, setSelected] = useState<number | null>(null);
  const [found, setFound] = useState<Search | null>(null);
  const [flipped, setFlipped] = useState<Flipped[]>([]);
  const [written, setWritten] = useState({ text: '', scene });
  const note = written.scene === scene ? written.text : '';
  const setNote = (text: string) => setWritten({ text, scene });

  const settle = (g: Bipartite, m: Matching, message: string) => {
    setGraph(g);
    setMatching(sanitise(g, m));
    setFound(null);
    setFlipped([]);
    setNote(message);
  };
  const edit = (r: Result<Bipartite>, message: string) => {
    if (r.ok) settle(r.value, matching, message);
    else setNote(r.error);
  };

  return {
    presetId, graph, matching, selected, found, flipped, note,
    load: (id: PresetId) => {
      const g = presetById(id).graph;
      setPresetId(id);
      setSelected(null);
      settle(g, emptyMatching(g), `Loaded ${presetById(id).label}.`);
    },
    clickWorker: (w: number) => {
      setSelected(w);
      setNote(`${workerName(w)} selected: click a job to add or remove the edge between them.`);
    },
    clickJob: (j: number) => {
      if (selected === null) {
        setNote('Click a worker first, then a job.');
        return;
      }
      const had = hasEdge(graph, selected, j);
      settle(toggleEdge(graph, selected, j), matching, `${had ? 'Removed' : 'Added'} the edge ${workerName(selected)}-${jobName(j)}.`);
    },
    runGreedy: () => {
      setMatching(greedy(graph));
      setFound(null);
      setFlipped([]);
      setNote('Greedy: each worker, in order, takes the first free job it likes.');
    },
    clearMatching: () => {
      setMatching(emptyMatching(graph));
      setFound(null);
      setFlipped([]);
      setNote('Matching cleared.');
    },
    /** Search for an augmenting path from the selected worker if it is free, else from the first free one. */
    find: () => {
      const free = matching.flatMap((j, w) => (j < 0 ? [w] : []));
      const from = selected !== null && matching[selected] < 0 ? selected : free[0];
      if (from === undefined) {
        setNote('Every worker already has a job.');
        return;
      }
      setSelected(from);
      setFlipped([]);
      setFound(findAugmenting(graph, matching, from));
    },
    flipFound: () => {
      if (!found?.path) return;
      setMatching(flip(matching, found.path));
      setFlipped(found.path.map((s) => ({ worker: s.worker, job: s.job })));
      setFound(null);
      setNote('Flipped: every edge on the path swapped between matched and unmatched.');
    },
    augmentAll: () => {
      setMatching(maximumMatching(graph, matching));
      setFound(null);
      setFlipped([]);
      setNote('Searched from every free worker.');
    },
    addWorker: () => edit(addWorker(graph), 'Worker added: select it, then click the jobs it can do.'),
    addJob: () => edit(addJob(graph), 'Job added: select a worker, then click the new job.'),
    removeWorker: () => {
      edit(removeWorker(graph), 'Last worker removed.');
      setSelected(null);
    },
    removeJob: () => edit(removeJob(graph), 'Last job removed.'),
  };
}

export type MatchEditor = ReturnType<typeof useMatchEditor>;
