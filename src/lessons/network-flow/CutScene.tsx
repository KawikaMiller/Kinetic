import type { ReactNode } from 'react';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { PresetChips } from './Controls';
import { FlowGraph } from './FlowGraph';
import { backEdges, crossingEdges, cutCapacity, isMaximum, reachableSet } from './model';
import { cutCaption } from './text';
import type { FlowEditor } from './useFlowEditor';

export function CutScene({ picker, ed }: { picker: ReactNode; ed: FlowEditor }) {
  const net = ed.net;
  const maximum = isMaximum(net, ed.flow);
  const showing = ed.showMinCut && maximum;
  const side: ReadonlySet<number> = showing ? reachableSet(net, ed.flow) : new Set(ed.sideNodes);
  const crossing = crossingEdges(net, side);
  const back = backEdges(net, side);
  const capacity = cutCapacity(net, side);
  const edgeName = (i: number) => `${net.names[net.edges[i].from]}→${net.names[net.edges[i].to]} ${net.edges[i].cap}`;
  const caption = cutCaption({ net, side, flowValue: ed.value, maximum, showing });
  useIntroCaption(<>{caption}</>, [caption]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Flow now" value={ed.value} color="var(--info)" sub="net out of s" />
          <Stat label="Cut capacity" value={capacity} color="var(--violet)" sub={`${crossing.length} ${crossing.length === 1 ? 'edge crosses' : 'edges cross'} from S to T`} />
          <Stat label="Cut minus flow" value={capacity - ed.value} color={capacity - ed.value === 0 ? 'var(--ok)' : 'var(--muted)'} sub={capacity - ed.value === 0 ? 'equal: the flow is maximum and this cut is minimum' : 'never below zero'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'S side (source side)', shape: 'dot' },
            { color: 'var(--dim)', label: 'T side', shape: 'dot' },
            { color: 'var(--violet)', label: 'edge crossing from S to T (counts)', shape: 'line' },
            { color: 'var(--bad)', label: 'full edge (flow = capacity) that does not cross', shape: 'line' },
            { color: 'var(--info)', label: 'flow on an edge', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <Button onClick={ed.finish} disabled={maximum}>
            Finish the flow, shortest first
          </Button>
          <ChipButton tone="ok" on={showing} disabled={!maximum} onClick={() => ed.setShowMinCut(!ed.showMinCut)}>
            Show the minimum cut
          </ChipButton>
          <Button onClick={ed.resetSide} disabled={ed.sideNodes.length === 1 && !ed.showMinCut}>
            Reset the cut
          </Button>
          <Hint>{maximum ? 'The flow is a maximum: the minimum cut can be shown.' : 'Push the flow to its maximum to show the minimum cut.'}</Hint>
        </>,
      ]}
    >
      <div className="nf-stage stage-pad">
        <FlowGraph
          net={net}
          flow={ed.flow}
          region={{ side, crossing: new Set(crossing) }}
          note={ed.note}
          onNodeClick={ed.toggleSide}
          ariaLabel={`Flow network with a cut: ${[...side].map((v) => net.names[v]).join(', ')} on the S side`}
        />
        <div className="nf-cutlists">
          <Tray label="Edges that count: S to T" labelWeight="regular" empty="none" ariaLabel="Edges crossing the cut">
            {crossing.length > 0 && crossing.map((i) => <span key={i} className="chip nf-chip tone-violet">{edgeName(i)}</span>)}
          </Tray>
          <Tray label="Edges back from T to S: not counted" labelWeight="regular" empty="none" ariaLabel="Edges going back across the cut">
            {back.length > 0 && back.map((i) => <span key={i} className="chip nf-chip">{edgeName(i)}</span>)}
          </Tray>
        </div>
        <Hint tone="muted" block>
          Click a node to move it between the S side and the T side (s stays in, t stays out). The capacity adds up only the edges that go from S to T.
        </Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">cut capacity, the flow and the minimum cut are computed live from the network</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
