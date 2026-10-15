import { useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import {
  activateCell, clampCursor, itemAt, itemById, laneKeyAction, moveItem, removeItem, resizeItem, selectItem, selectedItem,
  type Cursor, type LaneEdit, type LaneItem, type LaneKeyAction, type LaneLink, type LaneMode, type LaneModel,
} from '../core/laneEditor';
import type { Tone } from '../core/tone';
import { laneGeometry, LANE_AXIS_H, LANE_LABEL_W, type LaneGeometry } from './laneGeometry';
import { svgPoint } from './useDragPoint';
import { useArrowMarker } from './ArrowMarker';
import { Button } from './ui';
import { WideRegion } from './WideRegion';
import './laneEditor.css';

/** Half-width of a point event, and the inset and height of an interval bar (SVG units). */
const POINT_R = 7;
const BAR_INSET = 3;
const BAR_H = 22;

const KEY_HINT: Record<LaneMode, string> = {
  edit: 'Arrow keys move around the grid. Enter adds an item on an empty slot or selects the one there. Shift + arrows move the selected item, Alt + Left/Right stretch an interval, Delete removes it.',
  link: 'Arrow keys move around the grid. Enter on an item picks the sender, then Enter on a later slot of another lane adds the receive event and joins them with a message. Escape deselects.',
};

export interface LaneItemState {
  selected: boolean;
}

export interface LaneEditorProps<T> {
  model: LaneModel<T>;
  /** Called with the new model after every accepted edit (add, select, move, resize, delete, message). */
  onChange: (next: LaneModel<T>) => void;
  /** Called with the reason when an edit is refused; show it where the learner is looking. */
  onRefuse?: (reason: string) => void;
  /** Names of the lanes, top to bottom ("P1", "Client A"). */
  laneLabels: readonly string[];
  /** The data of an item the learner adds. */
  newData: (lane: number, slot: number) => T;
  /** `edit` (default) or `link`, where presses build messages between events. */
  mode?: LaneMode;
  ariaLabel: string;
  /** Spoken name of an item in a cell ("event, Lamport 3"). */
  describeItem?: (item: LaneItem<T>) => string;
  /** Text on the slot axis (default: the slot number). */
  slotLabel?: (slot: number) => string;
  /** Short text drawn on an item. */
  itemLabel?: (item: LaneItem<T>) => string;
  /** The item's colour; a lane is a plain category, so this defaults to a neutral grey. */
  toneOf?: (item: LaneItem<T>) => Tone;
  /** Draw an item yourself (SVG); the default is a dot for a point and a rounded bar for an interval. */
  renderItem?: (item: LaneItem<T>, geometry: LaneGeometry, state: LaneItemState) => ReactNode;
  /** Draw messages yourself (SVG); the default is an arrow from the send event to the receive event. */
  renderLink?: (link: LaneLink, from: LaneItem<T>, to: LaneItem<T>, geometry: LaneGeometry) => ReactNode;
  /** Extra SVG drawn over the lanes and under the items (guides, highlights). */
  underlay?: (geometry: LaneGeometry) => ReactNode;
  slotWidth?: number;
  laneHeight?: number;
  /** Hide the move/delete buttons under the grid (the keyboard and pointer paths still work). */
  buttons?: boolean;
  /** Replace the keyboard hint, or pass null to hide it. */
  hint?: string | null;
}

interface Drag {
  id: string;
  cell: Cursor;
}

/**
 * Lanes along a time axis where the learner places, selects, moves and deletes items
 * (point events, or intervals with a start and an end), and in `link` mode joins events with
 * messages. The state is a pure `LaneModel` (core/laneEditor): this component draws it and turns
 * presses into edits. Pointer path: press an empty slot to add, press an item to select it and
 * drag it along its lane or between lanes. Keyboard path: the grid is one tab stop (roving
 * tabindex over its cells); arrows move, Enter adds or selects, Shift + arrows move the selected
 * item, Delete removes it. The buttons under the grid do the same for touch. Lessons draw what
 * an item means through `renderItem`; the lane and key mechanics are shared. The grid keeps its
 * natural width and scrolls sideways inside a `WideRegion` on a phone; the buttons and hint reflow.
 */
export function LaneEditor<T>({
  model, onChange, onRefuse, laneLabels, newData, mode = 'edit', ariaLabel, describeItem, slotLabel = String, itemLabel, toneOf, renderItem, renderLink,
  underlay, slotWidth, laneHeight, buttons = true, hint,
}: LaneEditorProps<T>) {
  const { limits } = model;
  const geo = laneGeometry(limits, { slotW: slotWidth, laneH: laneHeight });
  const [cursor, setCursor] = useState<Cursor>({ lane: 0, slot: 0 });
  const here = clampCursor(cursor, limits);
  const svgRef = useRef<SVGSVGElement>(null);
  const cells = useRef(new Map<string, SVGRectElement>());
  const drag = useRef<Drag | null>(null);
  const arrow = useArrowMarker('var(--info)');
  const hintId = useId();
  const selected = selectedItem(model);

  const focusCell = (c: Cursor) => {
    setCursor(c);
    cells.current.get(`${c.lane}:${c.slot}`)?.focus();
  };

  const apply = (edit: LaneEdit<T>): boolean => {
    if (edit.ok) onChange(edit.model);
    else onRefuse?.(edit.reason);
    return edit.ok;
  };

  const run = (action: LaneKeyAction) => {
    switch (action.type) {
      case 'cursor':
        focusCell(action.to);
        return;
      case 'activate': {
        const edit = activateCell(model, here.lane, here.slot, mode, newData(here.lane, here.slot));
        apply(edit);
        return;
      }
      case 'move':
        if (!selected) return onRefuse?.('Select an item first.');
        if (apply(moveItem(model, selected.id, action.dLane, action.dSlot))) {
          focusCell(clampCursor({ lane: here.lane + action.dLane, slot: here.slot + action.dSlot }, limits));
        }
        return;
      case 'resize':
        if (!selected) return onRefuse?.('Select an item first.');
        apply(resizeItem(model, selected.id, 'end', action.delta));
        return;
      case 'remove':
        if (!selected) return onRefuse?.('Select an item first.');
        apply(removeItem(model, selected.id));
        return;
      case 'deselect':
        onChange(selectItem(model, null));
    }
  };

  const onKeyDown = (e: KeyboardEvent<SVGRectElement>) => {
    const action = laneKeyAction(e.key, { shift: e.shiftKey, alt: e.altKey }, here, limits);
    if (!action) return;
    e.preventDefault();
    run(action);
  };

  const cellUnder = (e: PointerEvent<SVGSVGElement>): Cursor | null => {
    const p = svgPoint(svgRef.current, e.clientX, e.clientY);
    return p ? geo.cellAt(p.x, p.y) : null;
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    const cell = cellUnder(e);
    if (!cell) return;
    focusCell(cell);
    const hit = itemAt(model, cell.lane, cell.slot);
    if (hit && mode === 'edit') {
      onChange(selectItem(model, hit.id));
      drag.current = { id: hit.id, cell };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }
    apply(activateCell(model, cell.lane, cell.slot, mode, newData(cell.lane, cell.slot)));
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    const cell = d && cellUnder(e);
    if (!d || !cell || (cell.lane === d.cell.lane && cell.slot === d.cell.slot)) return;
    const edit = moveItem(model, d.id, cell.lane - d.cell.lane, cell.slot - d.cell.slot);
    if (edit.ok) {
      onChange(edit.model);
      drag.current = { id: d.id, cell };
      setCursor(cell);
    }
  };

  const endDrag = () => {
    drag.current = null;
  };

  const describe = (item: LaneItem<T> | undefined) => (item ? (describeItem?.(item) ?? (item.start === item.end ? 'event' : 'interval')) : 'empty');

  return (
    <div className="lane-editor">
      <WideRegion minWidth={geo.width} label="Timeline: scroll sideways to see every slot" hint="swipe to see every slot">
      <svg
        ref={svgRef}
        className="lane-editor-svg"
        viewBox={`0 0 ${geo.width} ${geo.height}`}
        width={geo.width}
        height={geo.height}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {arrow.def}
        <g className="lane-axis" aria-hidden="true">
          {Array.from({ length: limits.slots }, (_, slot) => (
            <text key={slot} x={geo.slotCentre(slot)} y={LANE_AXIS_H - 7} textAnchor="middle">{slotLabel(slot)}</text>
          ))}
        </g>
        {Array.from({ length: limits.lanes }, (_, lane) => (
          <g key={lane} className="lane-row" aria-hidden="true">
            <rect className="lane-band" x={LANE_LABEL_W} y={geo.laneTop(lane)} width={geo.width - LANE_LABEL_W} height={geo.laneH} />
            <line className="lane-line" x1={LANE_LABEL_W} x2={geo.width} y1={geo.laneCentre(lane)} y2={geo.laneCentre(lane)} />
            <text className="lane-label" x={LANE_LABEL_W - 8} y={geo.laneCentre(lane)} textAnchor="end" dominantBaseline="central">{laneLabels[lane]}</text>
          </g>
        ))}
        {underlay?.(geo)}
        <g className="lane-links" aria-hidden="true">
          {model.links.map((link) => {
            const from = itemById(model, link.from);
            const to = itemById(model, link.to);
            if (!from || !to) return null;
            return renderLink ? (
              <g key={`${link.from}>${link.to}`}>{renderLink(link, from, to, geo)}</g>
            ) : (
              <line
                key={`${link.from}>${link.to}`}
                className="lane-link"
                x1={geo.slotCentre(from.end)} y1={geo.laneCentre(from.lane)}
                x2={geo.slotCentre(to.start)} y2={geo.laneCentre(to.lane)}
                markerEnd={arrow.url}
              />
            );
          })}
        </g>
        <g className="lane-items" aria-hidden="true">
          {model.items.map((item) => {
            const state = { selected: item.id === model.selected };
            return (
              <g key={item.id} className={`lane-item${state.selected ? ' is-selected' : ''}`} data-item={item.id}>
                {renderItem ? renderItem(item, geo, state) : (
                  <DefaultItem item={item} geo={geo} tone={toneOf?.(item) ?? 'muted'} label={itemLabel?.(item)} selected={state.selected} />
                )}
              </g>
            );
          })}
        </g>
        <g role="grid" aria-label={ariaLabel} aria-describedby={hint === null ? undefined : hintId}>
          {Array.from({ length: limits.lanes }, (_, lane) => (
            <g key={lane} role="row" aria-label={laneLabels[lane]}>
              {Array.from({ length: limits.slots }, (_, slot) => {
                const item = itemAt(model, lane, slot);
                const isHere = lane === here.lane && slot === here.slot;
                return (
                  <rect
                    key={slot}
                    ref={(el) => {
                      if (el) cells.current.set(`${lane}:${slot}`, el);
                      else cells.current.delete(`${lane}:${slot}`);
                    }}
                    role="gridcell"
                    className="lane-cell"
                    x={geo.slotLeft(slot)} y={geo.laneTop(lane)} width={geo.slotW} height={geo.laneH}
                    tabIndex={isHere ? 0 : -1}
                    aria-selected={item ? item.id === model.selected : undefined}
                    aria-label={`${laneLabels[lane]}, slot ${slotLabel(slot)}: ${describe(item)}`}
                    onKeyDown={onKeyDown}
                    onFocus={() => setCursor({ lane, slot })}
                  />
                );
              })}
            </g>
          ))}
        </g>
      </svg>
      </WideRegion>
      {buttons && (
        <div className="lane-editor-buttons" role="group" aria-label="Selected item">
          <Button disabled={!selected} onClick={() => run({ type: 'move', dLane: 0, dSlot: -1 })} aria-label="Move the selected item one slot earlier">◀</Button>
          <Button disabled={!selected} onClick={() => run({ type: 'move', dLane: 0, dSlot: 1 })} aria-label="Move the selected item one slot later">▶</Button>
          <Button disabled={!selected} onClick={() => run({ type: 'move', dLane: -1, dSlot: 0 })} aria-label="Move the selected item up a lane">▲</Button>
          <Button disabled={!selected} onClick={() => run({ type: 'move', dLane: 1, dSlot: 0 })} aria-label="Move the selected item down a lane">▼</Button>
          <Button variant="danger" disabled={!selected} onClick={() => run({ type: 'remove' })}>Delete</Button>
        </div>
      )}
      {hint !== null && <p id={hintId} className="lane-editor-hint">{hint ?? KEY_HINT[mode]}</p>}
    </div>
  );
}

function DefaultItem<T>({ item, geo, tone, label, selected }: { item: LaneItem<T>; geo: LaneGeometry; tone: Tone; label?: string; selected: boolean }) {
  const cy = geo.laneCentre(item.lane);
  const isPoint = item.start === item.end;
  const x = geo.slotLeft(item.start) + BAR_INSET;
  const width = geo.slotLeft(item.end + 1) - BAR_INSET - x;
  return (
    <g className={`tone-${tone}`}>
      {isPoint ? (
        <circle className="lane-dot" cx={geo.slotCentre(item.start)} cy={cy} r={POINT_R} />
      ) : (
        <rect className="lane-bar" x={x} y={cy - BAR_H / 2} width={width} height={BAR_H} rx={5} />
      )}
      {selected && (isPoint
        ? <circle className="lane-ring" cx={geo.slotCentre(item.start)} cy={cy} r={POINT_R + 4} />
        : <rect className="lane-ring" x={x - 3} y={cy - BAR_H / 2 - 3} width={width + 6} height={BAR_H + 6} rx={8} />)}
      {label && <text className="lane-item-label" x={isPoint ? geo.slotCentre(item.start) : x + width / 2} y={isPoint ? cy - POINT_R - 6 : cy} textAnchor="middle" dominantBaseline={isPoint ? 'auto' : 'central'}>{label}</text>}
    </g>
  );
}
