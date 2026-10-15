import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { EditRow, PresetChips } from './Controls';
import { FlowGraph } from './FlowGraph';
import { isMaximum } from './model';
import { augmentCaption } from './text';
import type { FlowEditor } from './useFlowEditor';

export function AugmentScene({ picker, ed }: { picker: ReactNode; ed: FlowEditor }) {
  const net = ed.net;
  const maximum = isMaximum(net, ed.flow);
  const caption = augmentCaption({ net, flow: ed.flow, value: ed.value, pushes: ed.steps.length, walk: ed.walk, arcs: ed.pathArcs, complete: ed.complete, delta: ed.delta });
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Flow value" value={ed.value} color="var(--info)" sub="net out of s" />
          <Stat label="Pushes" value={ed.steps.length} sub="augmentations so far" />
          <Stat label="Path left?" value={maximum ? 'no' : 'yes'} color={maximum ? 'var(--ok)' : 'var(--hi)'} sub={maximum ? 'the flow is a maximum' : 'in the residual network'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'path being built', shape: 'line' },
            { color: 'var(--info)', label: 'flow on an edge (thicker = fuller)', shape: 'line' },
            { color: 'var(--bad)', label: 'saturated edge', shape: 'line' },
            { color: 'var(--violet)', label: 'backward arrow: flow you could undo', shape: 'line' },
            { color: 'var(--muted)', label: 'spare capacity', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <Toggle label="View" value={ed.residual} onChange={ed.setResidual} off="Flow / capacity" on="Residual" />
          <Button onClick={ed.shortest}>Shortest path</Button>
          <Button variant="primary" onClick={ed.push} disabled={!ed.complete}>
            {ed.complete ? `Push ${ed.delta}` : 'Push'}
          </Button>
          <Button onClick={ed.clearPath} disabled={ed.walk.length < 2}>
            Clear path
          </Button>
          <Button onClick={ed.undo} disabled={ed.steps.length === 0}>
            Undo push
          </Button>
          <Button onClick={ed.finish} disabled={maximum}>
            Finish, shortest first
          </Button>
          <Button onClick={ed.reset} disabled={ed.steps.length === 0}>
            Reset flow
          </Button>
        </>,
        <><EditRow ed={ed} /></>,
      ]}
    >
      <div className="nf-stage stage-pad">
        <FlowGraph
          net={net}
          flow={ed.flow}
          residual={ed.residual}
          path={ed.pathArcs}
          walkEnd={ed.walk.length > 1 ? ed.walk[ed.walk.length - 1] : null}
          selectedEdge={ed.selected}
          note={ed.note}
          onNodeClick={ed.clickNode}
          onEdgeClick={ed.select}
          onAddEdge={ed.addEdge}
          ariaLabel={`Flow network, ${net.names.length} nodes and ${net.edges.length} edges, ${ed.residual ? 'residual view' : 'flow over capacity'}`}
        />
        <Hint tone="muted" block>
          Click nodes from s to t to build a path (each step needs spare room, or flow to undo in Residual view). A path may go backward along an edge that already carries flow: that is how an early bad choice is repaired.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">flows, residual arrows and the checks run live on the network you edit</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
