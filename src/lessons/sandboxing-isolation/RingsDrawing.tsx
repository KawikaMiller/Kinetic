import { SceneNode } from '../../components/scene';
import { TravelDot } from '../../components/scene/TravelDot';
import { WideRegion } from '../../components/WideRegion';
import { toneVar } from '../../core/tone';
import { RING_LABEL, RING_ORDER, decide, stoppedAt, RULES, type ActionId, type RingId, type RingSet } from './rings';

const DRAWING_SIZE = 420;
const CENTRE = { x: DRAWING_SIZE / 2, y: DRAWING_SIZE / 2 };
const FIRST_RADIUS = 46;
const RING_GAP = 27;
const PLUGIN = { w: 70, h: 32 };
/** The action's direction out of the plugin, as an angle in degrees (down-right, away from the ring labels at the top). */
const TRAVEL_ANGLE = 40;
/** How far past the outermost ring an action that nothing stopped travels. */
const ESCAPE_OVERSHOOT = 18;
const LABEL_FONT = 11;
const TRAVEL_SECONDS = 0.9;

const radiusOf = (ring: RingId): number => FIRST_RADIUS + RING_ORDER.indexOf(ring) * RING_GAP;
const point = (r: number) => ({ x: CENTRE.x + r * Math.cos((TRAVEL_ANGLE * Math.PI) / 180), y: CENTRE.y + r * Math.sin((TRAVEL_ANGLE * Math.PI) / 180) });

/**
 * The plugin in the middle, six rings round it, and the action as a dot that travels outward until a ring stops it.
 * A ring that stopped the action is green, one that limited it is violet, one that is off is dim and dashed, and
 * an action nothing stopped runs out past the last ring in red.
 */
export function RingsDrawing({ action, rings, ariaLabel }: { action: ActionId; rings: RingSet; ariaLabel: string }) {
  const d = decide(action, rings);
  const stop = stoppedAt(d);
  const outermost = radiusOf(RING_ORDER[RING_ORDER.length - 1]);
  const endRadius = stop ? radiusOf(stop) : outermost + ESCAPE_OVERSHOOT;
  const colour = d.kind === 'blocked' ? 'var(--ok)' : d.kind === 'limited' ? 'var(--violet)' : 'var(--bad)';
  return (
    <WideRegion minWidth={DRAWING_SIZE}>
      <svg viewBox={`0 0 ${DRAWING_SIZE} ${DRAWING_SIZE}`} className="sb-rings" role="img" aria-label={ariaLabel}>
        {[...RING_ORDER].reverse().map((ring) => {
          const on = rings.has(ring);
          const effect = on ? RULES[ring][action] : undefined;
          const stroke = !on ? toneVar('dim') : stop === ring ? toneVar('ok') : effect === 'limited' ? toneVar('violet') : toneVar('muted');
          return (
            <g key={ring}>
              <circle cx={CENTRE.x} cy={CENTRE.y} r={radiusOf(ring)} className="sb-ring" fill="none" stroke={stroke} strokeWidth={on ? 3 : 1.5} strokeDasharray={on ? undefined : '5 5'} />
              <text x={CENTRE.x} y={CENTRE.y - radiusOf(ring) + 15} textAnchor="middle" fontSize={LABEL_FONT} className="sb-ring-label" fill={on ? 'var(--text)' : 'var(--dim)'}>
                {RING_LABEL[ring]}
              </text>
            </g>
          );
        })}
        <SceneNode at={CENTRE} w={PLUGIN.w} h={PLUGIN.h} title="plugin" sub="untrusted" color="var(--orange)" on variant={d.kind === 'blocked' ? 'dim' : 'default'} />
        <line x1={CENTRE.x} y1={CENTRE.y} x2={point(endRadius).x} y2={point(endRadius).y} stroke={colour} strokeWidth={2.5} strokeDasharray="6 4" opacity={0.7} />
        <TravelDot key={`${action}-${[...rings].sort().join(',')}`} path={[CENTRE, point(endRadius)]} color={colour} r={6} duration={TRAVEL_SECONDS} />
      </svg>
    </WideRegion>
  );
}
