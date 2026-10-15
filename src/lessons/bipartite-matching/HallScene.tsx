import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { EditRow, PresetChips } from './Controls';
import { MatchGraph } from './MatchGraph';
import { hallViolator, matchingSize, maximumMatching, minimumVertexCover } from './model';
import { hallCaption } from './text';
import type { MatchEditor } from './useMatchEditor';

export function HallScene({ picker, ed }: { picker: ReactNode; ed: MatchEditor }) {
  const g = ed.graph;
  const [showCover, setShowCover] = useState(false);
  const best = maximumMatching(g);
  const violator = hallViolator(g);
  const cover = showCover ? minimumVertexCover(g, best) : null;
  const caption = hallCaption(g, showCover);

  return (
    <StageFrame
      intro={caption}
      introKey={[caption]}
      height={470}
      stats={
        <Stats>
          <Stat label="Largest matching" value={matchingSize(best)} color="var(--ok)" sub={`of ${g.workers} workers`} />
          <Stat label="Hall violator" value={violator ? violator.workers.length : 'none'} color={violator ? 'var(--bad)' : 'var(--ok)'} sub={violator ? `workers, sharing ${violator.neighbourhood.length} jobs` : 'no set of workers is short of jobs'} />
          {cover && <Stat label="Vertex cover" value={cover.workers.length + cover.jobs.length} color="var(--violet)" sub="nodes touching every edge" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'matched edge', shape: 'line' },
            { color: 'var(--bad)', label: 'Hall violator: workers that cannot all be placed', shape: 'dot' },
            { color: 'var(--orange)', label: 'the jobs they share', shape: 'dot' },
            { color: 'var(--violet)', label: 'vertex cover', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <Toggle label="Show" value={showCover} onChange={setShowCover} off="Hall violator" on="+ vertex cover" />
        </>,
        <><EditRow ed={ed} /></>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <MatchGraph
          g={g}
          matching={best}
          marks={{
            violatorWorkers: violator?.workers,
            violatorJobs: violator?.neighbourhood,
            coverWorkers: cover?.workers,
            coverJobs: cover?.jobs,
            selectedWorker: ed.selected,
          }}
          note={ed.note}
          onWorkerClick={ed.clickWorker}
          onJobClick={ed.clickJob}
          ariaLabel={`Workers and jobs with a largest matching of ${matchingSize(best)}`}
        />
        <Hint tone="muted" block>
          Hall&apos;s condition: a matching that covers every worker exists exactly when every set of workers likes at least as many jobs as it has members. The violator shown is the set the failed search of a left-out worker reaches. König&apos;s theorem (bipartite graphs only) says the smallest vertex cover is as big as the largest matching.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the largest matching, the violator and the cover are computed live; the tests check them against brute force</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
