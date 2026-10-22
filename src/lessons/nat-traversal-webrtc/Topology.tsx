import { Packet, SceneNode } from '../../components/scene';
import { WideRegion } from '../../components/WideRegion';
import type { Pt } from '../../core/geometry';
import { epText, NAT_NAME, SCENE, type NatType } from './nat';
import { ipToString } from '../../core/ipv4';

export type NodeKey = 'a' | 'na' | 'stun' | 'nb' | 'b';
export const TOPOLOGY_MIN_WIDTH = 520;
const W = 640;
const H = 210;
const POS: Record<NodeKey, Pt> = { a: { x: 64, y: 130 }, na: { x: 208, y: 130 }, stun: { x: 320, y: 40 }, nb: { x: 432, y: 130 }, b: { x: 576, y: 130 } };
const NODE = { w: 100, h: 46 };
const LINKS: [NodeKey, NodeKey][] = [['a', 'na'], ['nb', 'b'], ['na', 'nb'], ['na', 'stun'], ['nb', 'stun']];

export type Route = 'none' | 'direct' | 'relay';

/**
 * Two peers behind two NATs and one server in the middle (STUN or TURN, depending on the scene). The direct link and
 * the two server links are drawn as dashed lines; `route` colours the ones in use: green for a punched direct path,
 * orange for the relay (a labelled fallback, not a failure).
 */
export function Topology({
  middle, natA, natB, on = [], route = 'none', packet, packetKey, ariaLabel,
}: {
  middle: 'STUN server' | 'TURN relay';
  natA: NatType;
  natB: NatType;
  on?: NodeKey[];
  route?: Route;
  packet?: { path: NodeKey[]; label: string; color: string } | null;
  packetKey?: string | number;
  ariaLabel: string;
}) {
  const edgeClass = (a: NodeKey, b: NodeKey) => {
    const direct = a === 'na' && b === 'nb';
    const server = a !== 'a' && b !== 'b' && !direct;
    const classes = ['scene-edge', 'nat-edge'];
    if (direct && route === 'direct') classes.push('is-direct');
    if (server && route === 'relay') classes.push('is-relay');
    return classes.join(' ');
  };
  const xs = packet ? packet.path.map((k) => POS[k].x) : [];
  const reveal = packet ? { from: (Math.min(...xs) - NODE.w / 2) / W, to: (Math.max(...xs) + NODE.w / 2) / W } : null;
  const tone = middle === 'TURN relay' ? 'orange' : 'info';
  return (
    <WideRegion minWidth={TOPOLOGY_MIN_WIDTH} label="The two peers, their NATs and the server in the middle: scroll sideways to see all of it" reveal={reveal}>
      <svg className="nat-topology" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
        {LINKS.map(([x, y]) => (
          <line key={`${x}${y}`} className={edgeClass(x, y)} x1={POS[x].x} y1={POS[x].y} x2={POS[y].x} y2={POS[y].y} />
        ))}
        <text className="scene-zone" x={W / 2} y={POS.na.y - 8} textAnchor="middle">direct path</text>
        <SceneNode at={POS.a} {...NODE} title="peer A" sub={epText(SCENE.inside.A)} on={on.includes('a')} />
        <SceneNode at={POS.na} {...NODE} title="NAT A" sub={`${ipToString(SCENE.natIp.A)}`} on={on.includes('na')}>
          <text className="nat-type" x={POS.na.x} y={POS.na.y + 38} textAnchor="middle">{NAT_NAME[natA]}</text>
        </SceneNode>
        <SceneNode at={POS.stun} {...NODE} title={middle} sub={epText(middle === 'TURN relay' ? SCENE.turn : SCENE.stun)} tone={tone} on={on.includes('stun')} />
        <SceneNode at={POS.nb} {...NODE} title="NAT B" sub={`${ipToString(SCENE.natIp.B)}`} on={on.includes('nb')}>
          <text className="nat-type" x={POS.nb.x} y={POS.nb.y + 38} textAnchor="middle">{NAT_NAME[natB]}</text>
        </SceneNode>
        <SceneNode at={POS.b} {...NODE} title="peer B" sub={epText(SCENE.inside.B)} on={on.includes('b')} />
        {packet && <Packet key={packetKey} path={packet.path.map((k) => POS[k])} label={packet.label} color={packet.color} arrive="fade" duration={1.3} />}
      </svg>
    </WideRegion>
  );
}
