import { LaneEditor } from '../../components/LaneEditor';
import type { LaneMode } from '../../core/laneEditor';
import { bumped } from './clocks';
import { LANE_TONES, PROCESSES, nextName, type EvData, type ExecModel, type ExecView } from './execution';

const SLOT_W = 44;
const LANE_H = 76;
const DOT_R = 9;
const NAME_DY = 0;
const LAMPORT_DY = 22;
const VECTOR_DY = 33;
const RING_GAP = 4;

/** The pair the learner picked in scene 2: the first press is `a`, the second `b`. */
export interface Picks {
  a: string | null;
  b: string | null;
}

/**
 * The shared lane editor with this lesson's drawing: an event is a dot with its name, and with `showStamps` its Lamport stamp and its
 * vector under it, the components the event raised in violet. Messages are the editor's blue arrows.
 */
export function ExecutionEditor({
  model, onChange, onRefuse, mode, view, showStamps, picks, ariaLabel, hint,
}: {
  model: ExecModel;
  onChange: (next: ExecModel) => void;
  onRefuse: (reason: string) => void;
  mode: LaneMode;
  view: ExecView;
  showStamps: boolean;
  picks?: Picks;
  ariaLabel: string;
  hint?: string | null;
}) {
  return (
    <LaneEditor
      model={model}
      onChange={onChange}
      onRefuse={onRefuse}
      laneLabels={PROCESSES}
      mode={mode}
      ariaLabel={ariaLabel}
      hint={hint}
      newData={(): EvData => ({ name: nextName(model) })}
      describeItem={(item) => {
        const s = view.stamps[view.byId.get(item.id) ?? -1];
        return `event ${item.data.name}${s ? `, Lamport ${s.lamport}, vector ${s.vector.join(' ')}` : ''}`;
      }}
      slotWidth={SLOT_W}
      laneHeight={LANE_H}
      renderItem={(item, geo, { selected }) => {
        const cx = geo.slotCentre(item.start);
        const cy = geo.laneCentre(item.lane) - 12;
        const s = view.stamps[view.byId.get(item.id) ?? -1];
        const flagged = picks && (picks.a === item.id || picks.b === item.id);
        const mark = picks?.a === item.id ? 'a' : picks?.b === item.id ? 'b' : null;
        const raised = s ? bumped(s) : [];
        return (
          <g className={`tone-${LANE_TONES[item.lane]}`}>
            <circle className="lc-dot" cx={cx} cy={cy} r={DOT_R} />
            {(selected || flagged) && <circle className="lc-ring" cx={cx} cy={cy} r={DOT_R + RING_GAP} />}
            <text className="lc-name" x={cx} y={cy + NAME_DY} textAnchor="middle" dominantBaseline="central">{item.data.name}</text>
            {mark && <text className="lc-pick" x={cx} y={cy - DOT_R - RING_GAP - 3} textAnchor="middle">{mark}</text>}
            {showStamps && s && (
              <>
                <text className="lc-lamport" x={cx} y={cy + LAMPORT_DY} textAnchor="middle">L{s.lamport}</text>
                <text className="lc-vector" x={cx} y={cy + VECTOR_DY} textAnchor="middle">
                  [
                  {s.vector.map((v, i) => (
                    <tspan key={i} className={raised[i] ? 'is-raised' : undefined}>{i > 0 ? ',' : ''}{v}</tspan>
                  ))}
                  ]
                </text>
              </>
            )}
          </g>
        );
      }}
    />
  );
}
