import { HeapObject, RefArrow, VarSlot, fanBend, fieldArrowBetween, heapGrid, heapRect, slotPort } from '../../components/memory';
import { nextTarget, SLOTS, type Fate, type Heap, type Mode } from './heap';

const BOX_W = 120;
const COL_W = 176;
const ROW_H = 100;
const GRID_COLS = 3;
const ORIGIN = { x: 176, y: 34 };
const SLOT_X = 8;
const SLOT_Y = 24;
const SLOT_GAP = 54;
const TAG_PX = 11;
const BADGE_R = 11;
/** The drawing's natural size: StageFrame's minWidth keeps it from shrinking below this on a phone. */
export const HEAP_WIDTH = ORIGIN.x + GRID_COLS * COL_W;
export const HEAP_HEIGHT = ORIGIN.y + 2 * ROW_H;

/**
 * The heap as the memory kit draws it. A live object is a plain muted box with its count badge (--hi); a freed one is
 * dashed --ok; an unreachable-but-not-freed one is dashed --bad ("leaked" when counting) or dim ("unreachable" when
 * tracing, waiting for a collect); a weak `next` is a dashed --violet arrow.
 */
export function HeapDiagram({ heap, mode, fates }: { heap: Heap; mode: Mode; fates: Fate[] }) {
  const grid = heapGrid({ cols: GRID_COLS, colW: COL_W, rowH: ROW_H, origin: ORIGIN });
  const incoming = new Map<number, number>();
  const bendFor = (target: number) => {
    const k = incoming.get(target) ?? 0;
    incoming.set(target, k + 1);
    return fanBend(k, 3);
  };
  const live = (i: number) => heap.objs[i].live;

  return (
    <svg className="rc-svg" viewBox={`0 0 ${HEAP_WIDTH} ${HEAP_HEIGHT}`} role="group" aria-label={`Heap and three slots, ${mode} view`}>
      <text className="scene-zone" x={SLOT_X} y={14}>stack</text>
      <text className="scene-zone" x={ORIGIN.x} y={14}>heap</text>
      {SLOTS.map((name, s) => {
        const at = { x: SLOT_X, y: SLOT_Y + s * SLOT_GAP };
        const target = heap.slots[s];
        return (
          <g key={name}>
            <VarSlot at={at} name={name} isRef={target !== null} value={target === null ? "null" : undefined} tone="violet" />
            {target !== null && live(target) && <RefArrow from={slotPort(at)} to={heapRect(grid.at(target), BOX_W, 1)} bend={bendFor(target)} />}
          </g>
        );
      })}
      {heap.objs.map((o, i) => {
        if (!o.allocated) return null;
        const at = grid.at(i);
        const fate = fates[i];
        const nextIdx = nextTarget(heap, i);
        const arrow = nextIdx !== null ? fieldArrowBetween({ at, w: BOX_W, field: 0 }, { at: grid.at(nextIdx), w: BOX_W, fields: 1 }) : null;
        const freed = !o.live;
        const stranded = o.live && (fate.kind === 'leaked' || fate.kind === 'pending');
        const variant = freed ? 'freed' : stranded && mode === 'tracing' ? 'collectable' : stranded ? 'freed' : 'live';
        const tag = freed ? 'freed' : stranded ? (mode === 'counting' ? 'leaked' : 'unreachable') : undefined;
        return (
          <g key={i}>
            <HeapObject
              at={at}
              w={BOX_W}
              title={`obj ${i}`}
              tone="muted"
              variant={variant}
              tag={tag}
              tagPlacement={stranded && mode === 'tracing' ? 'above' : 'corner'}
              tagSize={TAG_PX}
              freedTone={freed ? 'ok' : undefined}
              fields={[{ name: 'next', value: nextIdx === null ? 'null' : undefined, isRef: nextIdx !== null, port: arrow?.port }]}
            />
            {arrow && nextIdx !== null && <RefArrow from={arrow.from} to={arrow.to} bend={bendFor(nextIdx)} color={o.weak ? 'var(--violet)' : undefined} dashed={o.weak} thin={o.weak} />}
            {o.live && mode === 'counting' && (
              <g className="rc-badge" role="img" aria-label={`object ${i} has reference count ${o.rc}`}>
                <circle cx={at.x + BOX_W} cy={at.y} r={BADGE_R} />
                <text x={at.x + BOX_W} y={at.y + 4} textAnchor="middle">{o.rc}</text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}
