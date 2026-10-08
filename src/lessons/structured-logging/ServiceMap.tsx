import { Packet, SceneNode } from '../../components/scene';
import { WideRegion } from '../../components/WideRegion';
import type { Pt } from '../../core/geometry';
import { SERVICE_TONE, type Service } from './model';

const W = 460;
const H = 168;
export const MAP_MIN_WIDTH = 460;
const NODE = { w: 92, h: 44 };
const AT: Record<Service, Pt> = { gateway: { x: 62, y: 66 }, orders: { x: 214, y: 66 }, payments: { x: 384, y: 30 }, inventory: { x: 384, y: 102 } };
const EDGES: [Service, Service][] = [['gateway', 'orders'], ['orders', 'inventory'], ['orders', 'payments']];
/** Seconds between the three hops of the replayed request. */
const HOP_DELAY = 0.9;

const edgeEnds = (from: Service, to: Service) => {
  const a = AT[from];
  const b = AT[to];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const inset = (n: Pt, s: number): Pt => ({ x: n.x + (dx / len) * s, y: n.y + (dy / len) * s });
  return { from: inset(a, 48), to: inset(b, -48) };
};

/**
 * gateway -> orders -> inventory + payments. `lit` services are the ones the matching lines
 * came from; an edge is yellow when both its ends are lit. Replaying the request flies a pill
 * along the path, labelled with the request id only when the lines carry one.
 */
export function ServiceMap({ lit, replayKey, packetLabel, note }: { lit: ReadonlySet<Service>; replayKey: number; packetLabel: string; note: string }) {
  return (
    <WideRegion minWidth={MAP_MIN_WIDTH} label="Service diagram: scroll sideways to see all of it">
      <svg viewBox={`0 0 ${W} ${H}`} className="sl-map" role="img" aria-label={`Requests flow from the gateway to orders, which calls inventory and payments. ${note}`}>
        {EDGES.map(([a, b]) => {
          const e = edgeEnds(a, b);
          return <line key={`${a}-${b}`} className={`scene-edge${lit.has(a) && lit.has(b) ? ' sl-edge-on' : ''}`} x1={e.from.x} y1={e.from.y} x2={e.to.x} y2={e.to.y} />;
        })}
        {(Object.keys(AT) as Service[]).map((s) => (
          <SceneNode key={s} at={AT[s]} w={NODE.w} h={NODE.h} title={s} tone={lit.has(s) ? 'hi' : SERVICE_TONE[s]} on={lit.has(s)} variant={lit.size > 0 && !lit.has(s) ? 'dim' : 'default'} titleDy={4} />
        ))}
        {replayKey > 0 &&
          EDGES.map(([a, b], i) => {
            const e = edgeEnds(a, b);
            return <Packet key={`${replayKey}-${a}-${b}`} path={[e.from, e.to]} label={packetLabel} color="var(--info)" delay={i * HOP_DELAY} duration={1.1} height={20} charW={6.2} pad={14} />;
          })}
        <text x={W / 2} y={H - 8} textAnchor="middle" className="sl-map-note">
          {note}
        </text>
      </svg>
    </WideRegion>
  );
}
