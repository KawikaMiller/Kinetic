import { useMemo, useRef, useState, type PointerEvent } from 'react';
import { Bar } from '../../components/Bar';
import { GraphView, type GraphEdgeMark, type GraphNodeMark } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, pct } from '../../core/format';
import type { Pt } from '../../core/geometry';
import { minWidthForText } from '../../core/scale';
import { toneVar, type Tone } from '../../core/tone';
import { layoutCaption, moveCaption, requestCaption } from './captions';
import { NODE, VIEW, layoutModules, moduleAt, passThroughs } from './layout';
import {
  EDGES, FN_IDS, PRESETS, PRESET_IDS, REQUESTS, SLOTS, THRESHOLDS, blastRadius, changeSet, coupling, crosses, meanCohesion, moduleStats,
  modulesTouched, moveFn, reasonsToChange, requestById, verdict, type FnId, type PresetId, type RequestId, type Slot,
} from './model';
import './styles.css';

/** Module boxes wear categorical tones: they are plain groupings, not statuses. */
const MODULE_TONES: readonly Tone[] = ['sky', 'amber', 'violet'];
/** Smallest scene text: function labels and module names. */
const SMALLEST_TEXT_PX = 12;
/** The stage's side padding around the drawing. */
const STAGE_PAD_X = 44;
/** The graph's narrowest readable width on a phone: 12px labels stay at 8px or more. */
const MIN_WIDTH = minWidthForText(VIEW.w, SMALLEST_TEXT_PX, { padX: STAGE_PAD_X });
/** A press that moves less than this is a click, not a drag. */
const DRAG_SLOP = 6;
const RING_GAP = 4;

const verdictColor = (v: 'ok' | 'bad' | 'muted') => (v === 'muted' ? 'var(--muted)' : toneVar(v));

export function Stage() {
  const [presetId, setPresetId] = useState<PresetId>('layer');
  const [assign, setAssign] = useState(PRESETS.layer.assign);
  const [requestId, setRequestId] = useState<RequestId | null>(null);
  const [selected, setSelected] = useState<FnId | null>(null);
  const [drag, setDrag] = useState<{ fn: FnId; start: Pt; over: Slot | null; moved: boolean } | null>(null);
  const backdrop = useRef<SVGSVGElement>(null);
  const setCaption = useSetCaption();

  const preset = PRESETS[presetId];
  const modules = preset.modules;
  const request = requestId ? requestById(requestId) : null;
  const changing = new Set(request ? changeSet(request) : []);
  const touched = request ? modulesTouched(assign, request) : [];
  const { boxes, at } = useMemo(() => layoutModules(assign), [assign]);
  const hidden = useMemo(() => passThroughs(at).length, [at]);
  const c = coupling(assign);
  const cohesion = meanCohesion(assign);

  useIntroCaption(layoutCaption(PRESETS.layer.label, PRESETS.layer.assign));

  const load = (id: PresetId) => {
    const p = PRESETS[id];
    setPresetId(id);
    setAssign(p.assign);
    setSelected(null);
    setCaption(request ? requestCaption(request, p.assign, p.modules) : layoutCaption(p.label, p.assign));
  };
  const pickRequest = (id: RequestId) => {
    const next = id === requestId ? null : id;
    setRequestId(next);
    setCaption(next ? requestCaption(requestById(next), assign, modules) : layoutCaption(preset.label, assign));
  };
  const move = (fn: FnId, to: Slot) => {
    if (assign[fn] === to) return;
    setAssign(moveFn(assign, fn, to));
    setSelected(fn);
    setCaption(moveCaption(fn, assign, to, modules, request));
  };
  const select = (fn: FnId) => {
    setSelected(fn);
    setCaption(`${fn} is in ${modules[assign[fn]]}. Pick a module under "Move to", or click a module box, to move it.`, { quiet: true });
  };

  // ---- pointer: click a module box to move the selected function there, or drag a function onto one ----
  const toView = (e: PointerEvent): Pt | null => {
    const ctm = backdrop.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const fnUnder = (e: PointerEvent): FnId | null => {
    const node = (e.target as Element).closest('[data-cc-fn]');
    const id = node?.getAttribute('data-cc-fn');
    return FN_IDS.find((f) => f === id) ?? null;
  };
  const down = (e: PointerEvent<HTMLDivElement>) => {
    const fn = fnUnder(e);
    const p = toView(e);
    if (fn && p) setDrag({ fn, start: p, over: null, moved: false });
  };
  const pointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag) return;
    const p = toView(e);
    if (!p) return;
    const moved = drag.moved || Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > DRAG_SLOP;
    setDrag({ ...drag, moved, over: moved ? moduleAt(boxes, p) : null });
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const p = toView(e);
    const target = p ? moduleAt(boxes, p) : null;
    if (drag?.moved) {
      if (target !== null) move(drag.fn, target);
    } else if (!drag && selected && target !== null && !fnUnder(e)) {
      move(selected, target);
    }
    setDrag(null);
  };

  const nodeMark = (id: FnId): GraphNodeMark | null => (id === selected || id === drag?.fn ? { tone: 'hi', fill: 'solid' } : null);
  const edgeMark = (e: { from: FnId; to: FnId }): GraphEdgeMark =>
    crosses(assign, e) ? { tone: 'orange', width: 2.5 } : { tone: 'dim', width: 2 };

  const stats = SLOTS.map((m) => moduleStats(assign, m));
  const couplingShare = c / EDGES.length;
  const radius = request ? blastRadius(assign, request) : null;

  return (
    <StageFrame
      minWidth={MIN_WIDTH}
      height={470}
      stats={
        <Stats>
          <Stat
            label="Coupling"
            value={`${c} of ${EDGES.length}`}
            sub="call edges crossing a module boundary"
            color={verdictColor(verdict(couplingShare, THRESHOLDS.couplingOk, THRESHOLDS.couplingBad))}
          />
          <Stat label="Mean cohesion" value={cohesion === null ? NA : pct(cohesion)} sub="share of a module's edges that stay inside it" />
          <Stat
            label="Modules touched"
            value={request ? `${touched.length} of 3` : NA}
            sub={request ? request.label : 'pick a change request'}
            color={request ? toneVar(touched.length === 1 ? 'ok' : 'bad') : undefined}
          />
          <Stat
            label="Blast radius"
            value={radius === null ? NA : `${radius} of ${FN_IDS.length}`}
            sub="functions in the touched modules"
            color={radius === null ? undefined : verdictColor(verdict(radius / FN_IDS.length, THRESHOLDS.blastOk, THRESHOLDS.blastBad))}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...SLOTS.map((m) => ({ color: toneVar(MODULE_TONES[m]), label: `module: ${modules[m]}`, shape: 'square' as const })),
            { color: 'var(--hi)', label: 'selected function', shape: 'square' },
            { color: 'var(--info)', label: 'ring: in the change set', shape: 'square' },
            { color: 'var(--dim)', label: 'call inside a module', shape: 'line' },
            { color: 'var(--orange)', label: 'call crossing modules', shape: 'line' },
          ]}
        />
      }
      controls={[
        <div key="p" className="cc-row">
          <span className="cc-row-label">Layout</span>
          {PRESET_IDS.map((id) => (
            <ChipButton key={id} tone="info" size="md" on={presetId === id && assign === PRESETS[id].assign} onClick={() => load(id)}>
              {PRESETS[id].label}
            </ChipButton>
          ))}
        </div>,
        <div key="r" className="cc-row">
          <span className="cc-row-label">Change request</span>
          {REQUESTS.map((r) => (
            <ChipButton key={r.id} tone="info" on={requestId === r.id} onClick={() => pickRequest(r.id)}>
              {r.label}
            </ChipButton>
          ))}
        </div>,
        selected ? (
          <Segmented
            key="m"
            label={`Move ${selected} to`}
            value={assign[selected]}
            onChange={(m) => move(selected, m)}
            options={SLOTS.map((m) => ({ value: m, label: modules[m] }))}
          />
        ) : (
          <Hint key="m" tone="muted">
            Select a function (click it, or Tab to the graph, arrow keys, Enter) to move it to another module. You can also drag it onto a module.
          </Hint>
        ),
      ]}
    >
      <div className="cc stage-pad">
        <div
          className={`cc-canvas ${selected ? 'has-selection' : ''}`}
          onPointerDown={down}
          onPointerMove={pointerMove}
          onPointerUp={up}
          onPointerLeave={() => setDrag(null)}
        >
          <svg ref={backdrop} className="cc-backdrop" viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} aria-hidden="true">
            {boxes.map((b) => {
              const s = stats[b.slot];
              const target = drag?.moved && drag.over === b.slot;
              return (
                <g key={b.slot} className={`cc-module tone-${MODULE_TONES[b.slot]} ${target ? 'is-target' : ''} ${touched.includes(b.slot) ? 'is-touched' : ''}`}>
                  <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={12} className="cc-module-box" />
                  <text x={b.x + 12} y={b.y + 20} className="cc-module-name">
                    {modules[b.slot]}
                  </text>
                  <text x={b.x + b.w - 12} y={b.y + 20} textAnchor="end" className="cc-module-count">
                    {s.size}
                  </text>
                </g>
              );
            })}
          </svg>
          <GraphView
            nodes={FN_IDS.map((id) => ({ id, at: at[id], shape: 'box' as const }))}
            edges={EDGES}
            directed
            width={VIEW.w}
            height={VIEW.h}
            box={{ ...NODE, rx: 7 }}
            arrowSize={5}
            nodeColor={(id) => toneVar(MODULE_TONES[assign[id]])}
            nodeMark={nodeMark}
            edgeMark={edgeMark}
            onNodeClick={select}
            nodeAriaLabel={(id) => `${id}, in ${modules[assign[id]]}${changing.has(id) ? ', in the change set' : ''}`}
            renderNode={(n, p, base) => (
              <g data-cc-fn={n.id}>
                {base}
                {changing.has(n.id) && (
                  <rect
                    className="cc-change-ring"
                    x={p.x - NODE.w / 2 - RING_GAP}
                    y={p.y - NODE.h / 2 - RING_GAP}
                    width={NODE.w + 2 * RING_GAP}
                    height={NODE.h + 2 * RING_GAP}
                    rx={10}
                  />
                )}
              </g>
            )}
            className="cc-graph"
            ariaLabel={`Call graph of 14 shop functions in three modules (${SLOTS.map((m) => `${modules[m]}: ${stats[m].size}`).join(', ')}); ${c} calls cross modules`}
          />
        </div>
        {hidden > 0 && (
          <Hint block tone="muted">
            Crowded layout: {hidden === 1 ? 'one arrow passes' : `${hidden} arrows pass`} behind a function box it doesn't call. Follow arrowheads, not lines.
          </Hint>
        )}
        <table className="data-table cc-table">
          <thead>
            <tr>
              <th>Module</th>
              <th>Functions</th>
              <th>Cohesion</th>
              <th>Ca</th>
              <th>Ce</th>
              <th>
                <abbr title="Instability: Ce / (Ca + Ce)">I</abbr>
              </th>
              <th>Reasons to change</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.slot} className={touched.includes(s.slot) ? 'is-touched' : ''}>
                <td className={`cc-name tone-${MODULE_TONES[s.slot]}`}>{modules[s.slot]}</td>
                <td>{s.size}</td>
                <td className="cc-cohesion">
                  {s.cohesion === null ? NA : `${s.internal}/${s.touching}`}
                  {s.cohesion !== null && <Bar value={s.cohesion} max={1} tone={MODULE_TONES[s.slot]} height={5} />}
                </td>
                <td>{s.ca}</td>
                <td>{s.ce}</td>
                <td>{s.instability === null ? NA : s.instability.toFixed(2)}</td>
                <td>{`${reasonsToChange(assign, s.slot)} of ${REQUESTS.length}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint block>
          A toy codebase; the scores are simple edge counts, not a standard metric, and the green and red cut-offs are this lesson's rules of thumb.
          Ca, Ce and I follow Robert C. Martin's package metrics, counted over functions instead of classes. A change request is modelled as editing one
          function's interface, so its direct callers change too; real changes vary.
        </Hint>
      </div>
    </StageFrame>
  );
}
