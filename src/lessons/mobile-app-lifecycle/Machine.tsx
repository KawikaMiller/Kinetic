import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { LINKS, STATES, isDead, type Phone, type Platform, type Rule, type StateId } from './model';

const BOX = { w: 100, h: 34, rx: 9 } as const;
const WIDTH = 500;
const HEIGHT = 230;
const TEXT_PX = 11;
const COL = [70, 250, 430] as const;
const ROW = [50, 180] as const;

const AT: Record<Platform, Partial<Record<StateId, { x: number; y: number }>>> = {
  android: {
    Created: { x: COL[0], y: ROW[0] }, Started: { x: COL[1], y: ROW[0] }, Resumed: { x: COL[2], y: ROW[0] },
    Destroyed: { x: COL[0], y: ROW[1] }, Stopped: { x: COL[1], y: ROW[1] }, Paused: { x: COL[2], y: ROW[1] },
  },
  ios: {
    'Not running': { x: COL[0], y: ROW[0] }, Inactive: { x: COL[1], y: ROW[0] }, Active: { x: COL[2], y: ROW[0] },
    Suspended: { x: COL[0], y: ROW[1] }, Background: { x: COL[1], y: ROW[1] },
  },
};
const START: Record<Platform, StateId> = { android: 'Created', ios: 'Not running' };

/** The edges of the last transition: each consecutive pair of states it passed through. */
const takenEdges = (last: Rule | null): Set<string> => new Set(last ? last.via.slice(1).map((s, i) => `${last.via[i]}>${s}`) : []);

export function Machine({ platform, phone, last }: { platform: Platform; phone: Phone; last: Rule | null }) {
  const nodes: GraphNode<StateId>[] = STATES[platform].map((id) => ({ id, at: AT[platform][id], shape: 'box' }));
  const edges: GraphEdge<StateId>[] = LINKS[platform].map((l) => ({ from: l.from, to: l.to, label: l.label }));
  const taken = takenEdges(last);
  const passed = new Set(last?.via ?? []);
  const kill = (from: StateId, to: StateId) => !!last && last.drops === true && !last.restores && last.via[0] === from && last.via[1] === to;

  return (
    <WideRegion minWidth={minWidthForText(WIDTH, TEXT_PX)} label={`${platform === 'android' ? 'Android activity' : 'iOS app'} lifecycle: scroll sideways to see all of it`}>
      <GraphView
        nodes={nodes}
        edges={edges}
        directed
        startNode={START[platform]}
        width={WIDTH}
        height={HEIGHT}
        box={BOX}
        className="mal-graph"
        ariaLabel={`${platform === 'android' ? 'Android activity' : 'iOS app'} lifecycle states. Current: ${phone.state}.`}
        nodeMark={(id) => {
          if (id === phone.state) return { tone: (isDead(phone) ? 'bad' : 'hi') as Tone, fill: 'solid' };
          if (passed.has(id)) return { tone: 'info', fill: 'tint' };
          return null;
        }}
        edgeMark={(e) => {
          if (kill(e.from, e.to)) return { tone: 'bad', width: 3.5 };
          return taken.has(`${e.from}>${e.to}`) ? { tone: 'info', width: 3.5 } : null;
        }}
      />
    </WideRegion>
  );
}
