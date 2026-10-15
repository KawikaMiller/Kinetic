import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { EditRow, PresetChips } from './Controls';
import { MatchGraph } from './MatchGraph';
import { matchingSize, maximumMatching } from './model';
import { matchCaption } from './text';
import type { MatchEditor } from './useMatchEditor';

export function AugmentScene({ picker, ed }: { picker: ReactNode; ed: MatchEditor }) {
  const g = ed.graph;
  const size = matchingSize(ed.matching);
  const caption = matchCaption(g, ed.matching, ed.found);
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Matched" value={`${size} of ${g.workers}`} color="var(--ok)" sub="workers holding a job" />
          <Stat label="Largest possible" value={matchingSize(maximumMatching(g))} sub="found by searching from every worker" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'matched edge', shape: 'line' },
            { color: 'var(--hi)', label: 'alternating path being shown', shape: 'line' },
            { color: 'var(--info)', label: 'edge the last flip changed', shape: 'line' },
            { color: 'var(--muted)', label: 'candidate edge, not matched', shape: 'line' },
            { color: 'var(--dim)', label: 'worker with no job', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <Button onClick={ed.runGreedy}>Greedy</Button>
          <Button onClick={ed.find}>{ed.selected !== null && ed.matching[ed.selected] < 0 ? `Find path from ${`W${ed.selected + 1}`}` : 'Find path'}</Button>
          <Button variant="primary" onClick={ed.flipFound} softDisabled={!ed.found?.path}>
            Flip the path
          </Button>
          <Button onClick={ed.augmentAll}>Augment from every free worker</Button>
          <Button onClick={ed.clearMatching} softDisabled={size === 0}>
            Clear matching
          </Button>
        </>,
        <><EditRow ed={ed} /></>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <MatchGraph
          g={g}
          matching={ed.matching}
          marks={{ path: ed.found?.path ?? [], flipped: ed.flipped, selectedWorker: ed.selected }}
          note={ed.note}
          onWorkerClick={ed.clickWorker}
          onJobClick={ed.clickJob}
          ariaLabel={`Workers and jobs, ${g.edges.length} edges, ${size} matched`}
        />
        <Hint tone="muted" block>
          Greedy takes the first free job for each worker in order. Find path searches from a free worker (the selected one, else the first): the path alternates between edges that are not matched and edges that are, and ends at a job nobody holds. Flipping it makes every unmatched edge on it matched and every matched one free.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">Kuhn&apos;s search runs live on the graph you edit</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
