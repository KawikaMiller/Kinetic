import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { PresetChips } from './Controls';
import { MatchGraph } from './MatchGraph';
import { matchingSize } from './model';
import { flowCaption } from './text';
import type { MatchEditor } from './useMatchEditor';

export function FlowScene({ picker, ed }: { picker: ReactNode; ed: MatchEditor }) {
  const g = ed.graph;
  const [asFlow, setAsFlow] = useState(true);
  const size = matchingSize(ed.matching);
  const caption = asFlow ? flowCaption(ed.matching, ed.found) : `Two columns again: ${size} matched pairs. Switch to the network to see the same matching as a flow.`;
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Flow value" value={size} color="var(--ok)" sub="net out of s: equals the matching size" />
          <Stat label="Matched" value={`${size} of ${g.workers}`} sub="workers holding a job" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'edge carrying 1 unit (matched)', shape: 'line' },
            { color: 'var(--hi)', label: 'augmenting path', shape: 'line' },
            { color: 'var(--info)', label: 'edge the last flip changed', shape: 'line' },
            { color: 'var(--muted)', label: 'empty edge, 0 of 1', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <Toggle label="Draw as" value={asFlow} onChange={setAsFlow} off="Two columns" on="Unit network" />
          <Button onClick={ed.runGreedy}>Greedy</Button>
          <Button onClick={ed.find}>Find path</Button>
          <Button variant="primary" onClick={ed.flipFound} softDisabled={!ed.found?.path}>
            Push along it
          </Button>
          <Button onClick={ed.clearMatching} softDisabled={size === 0}>
            Clear matching
          </Button>
        </>,
      ]}
    >
      <div className="bm-stage stage-pad">
        <MatchGraph
          g={g}
          matching={ed.matching}
          asFlow={asFlow}
          marks={{ path: ed.found?.path ?? [], flipped: ed.flipped, selectedWorker: ed.selected }}
          note={ed.note}
          onWorkerClick={ed.clickWorker}
          onJobClick={ed.clickJob}
          ariaLabel={`${asFlow ? 'Unit network' : 'Workers and jobs'} with ${size} matched`}
        />
        <Hint tone="muted" block>
          Every edge has capacity 1. The alternating path becomes an augmenting path of the max-flow kind: it goes forward along unmatched edges and backward along matched ones, which takes those units back. The search here is still Kuhn&apos;s; it shares no code with a flow solver, and the tests check the matching size against one.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the matching is redrawn as a unit network; no second algorithm runs here</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
