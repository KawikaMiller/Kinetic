import { SceneNode } from '../../components/scene';
import { useArrowMarker } from '../../components/ArrowMarker';
import { useMediaQuery } from '../../components/useMediaQuery';
import type { Tone } from '../../core/tone';
import { STAGES, STAGE_INFO, type StageId } from './model';

/** At this width the six stages wrap into two rows of three. */
export const WRAP_QUERY = '(max-width: 900px)';

const NODE_W = 100;
const NODE_H = 54;
const GAP_X = 26;
const GAP_Y = 34;
const PAD = 8;

type Place = { x: number; y: number };

/** Centre of each stage: one row of six, or two rows of three. */
function place(index: number, wrapped: boolean): Place {
  const perRow = wrapped ? 3 : STAGES.length;
  const col = index % perRow;
  const row = Math.floor(index / perRow);
  return { x: PAD + NODE_W / 2 + col * (NODE_W + GAP_X), y: PAD + NODE_H / 2 + row * (NODE_H + GAP_Y) };
}

export type StageStatus = 'idle' | 'ran' | 'current' | 'skipped';

/** The pipeline as a strip of stages. `status` says what each stage is doing; `tone` colours the stages that ran. */
export function PipelineStrip({ status, tone }: { status: (stage: StageId) => StageStatus; tone: Tone }) {
  const wrapped = useMediaQuery(WRAP_QUERY);
  const arrow = useArrowMarker('var(--muted)', { size: 6, refX: 9 });
  const perRow = wrapped ? 3 : STAGES.length;
  const rows = Math.ceil(STAGES.length / perRow);
  const width = PAD * 2 + perRow * NODE_W + (perRow - 1) * GAP_X;
  const height = PAD * 2 + rows * NODE_H + (rows - 1) * GAP_Y;
  return (
    <svg className="bp-strip" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Rendering pipeline: parse HTML, parse CSS, style, layout, paint, composite">
      {arrow.def}
      {STAGES.slice(1).map((stage, i) => {
        const from = place(i, wrapped);
        const to = place(i + 1, wrapped);
        const sameRow = from.y === to.y;
        const d = sameRow
          ? `M ${from.x + NODE_W / 2 + 2} ${from.y} L ${to.x - NODE_W / 2 - 3} ${to.y}`
          : `M ${from.x} ${from.y + NODE_H / 2 + 2} V ${from.y + NODE_H / 2 + GAP_Y / 2} H ${to.x} V ${to.y - NODE_H / 2 - 3}`;
        return <path key={stage} className="bp-strip-edge" d={d} markerEnd={arrow.url} />;
      })}
      {STAGES.map((stage, i) => {
        const s = status(stage);
        return (
          <SceneNode
            key={stage}
            at={place(i, wrapped)}
            w={NODE_W}
            h={NODE_H}
            title={STAGE_INFO[stage].title}
            sub={STAGE_INFO[stage].sub}
            titleDy={-4}
            subDy={13}
            tone={tone}
            on={s === 'current' || s === 'ran'}
            busy={s === 'current'}
            variant={s === 'skipped' ? 'dim' : 'default'}
          />
        );
      })}
    </svg>
  );
}
