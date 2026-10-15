import { useMemo, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { ColourGraph } from './ColourGraph';
import { colourVar } from './colors';
import { EditRow, PresetChips } from './Controls';
import { greedyFrames } from './frames';
import { ORDERS, chromatic, greedyColour, isInvented } from './model';
import type { ColorEditor } from './useColorEditor';

const STEP_MS = 800;

export function GreedyScene({ picker, ed }: { picker: ReactNode; ed: ColorEditor }) {
  const g = ed.graph;
  const run = useMemo(() => greedyColour(g, ed.order), [g, ed.order]);
  const best = useMemo(() => chromatic(g).number, [g]);
  const frames = useMemo(() => greedyFrames(g, run), [g, run]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const usedSoFar = Math.max(0, ...f.colours);
  const palette = Array.from({ length: Math.min(g.names.length, Math.max(usedSoFar, f.chosen, 1) + 1) }, (_, i) => i + 1);

  const cellState = (position: number): ArrayCellState => {
    if (ed.order[position] === f.current) return 'active';
    if (position === ed.picked) return 'info';
    return 'idle';
  };

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat
            label="Colours used"
            value={usedSoFar}
            color={player.atEnd && usedSoFar > best ? 'var(--bad)' : 'var(--ok)'}
            sub={player.atEnd ? (usedSoFar > best ? `${usedSoFar - best} more than the minimum` : 'the minimum') : 'so far'}
          />
          <Stat label="True minimum" value={best} color="var(--ok)" sub="exact, by backtracking search" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--text)', label: 'dashed ring: the node being coloured', shape: 'dot' },
            { color: 'var(--dim)', label: 'colour forbidden by a neighbour', shape: 'square' },
            { color: 'var(--bad)', label: 'colours beyond the minimum', shape: 'square' },
            { color: 'var(--ok)', label: 'the minimum', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <ControlGroup label="Order">
            {ORDERS.map((o) => (
              <ChipButton key={o.id} tone="info" on={ed.isOrder(o.id)} onClick={() => ed.chooseOrder(o.id)}>
                {o.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => ed.move(-1)} disabled={ed.picked === null || ed.picked === 0}>
            Move earlier
          </Button>
          <Button onClick={() => ed.move(1)} disabled={ed.picked === null || ed.picked === g.names.length - 1}>
            Move later
          </Button>
        </>,
        <><EditRow ed={ed} /></>,
      ]}
    >
      <div className="gc-stage stage-pad">
        <div className="gc-main">
          <ColourGraph
            g={g}
            colours={f.colours}
            current={f.current}
            note={ed.note}
            onAddEdge={ed.addEdge}
            ariaLabel={`Graph with ${g.names.length} nodes and ${g.edges.length} edges, ${f.done} coloured`}
          />
        </div>
        <div className="gc-side">
          <Tray label="Order greedy colours in (press a cell to pick it, then move it)" labelWeight="regular" stack ariaLabel="Colouring order">
            <ArrayStrip
              values={ed.order.map((v) => g.names[v])}
              cellState={cellState}
              cellTone={(i) => (i < f.done ? 'muted' : null)}
              cellMax={56}
              fontSize={12}
              onCellClick={ed.pick}
              cellTitle={(i) => `Pick ${g.names[ed.order[i]]}, position ${i + 1}`}
            />
          </Tray>
          <Tray label="Colour choice for this node" labelWeight="regular" stack ariaLabel="Colour choice">
            <div className="gc-palette">
              {palette.map((c) => (
                <span
                  key={c}
                  className={`chip gc-swatch ${f.forbidden.includes(c) ? 'is-forbidden' : ''} ${c === f.chosen ? 'is-chosen' : ''}`}
                  style={{ borderColor: colourVar(c) }}
                  title={f.forbidden.includes(c) ? `colour ${c} is used by a neighbour` : `colour ${c}`}
                >
                  {c}
                </span>
              ))}
            </div>
            <Hint tone="muted" block>
              {f.current === null ? 'Step through to see each choice.' : `Struck-through colours are taken by a neighbour; the ringed one is chosen. Each colour is a hue and a number.`}
            </Hint>
          </Tray>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">greedy runs live; the exact minimum is computed by search, feasible only because these graphs are tiny</Provenance>
        {isInvented(ed.presetId) && <Provenance kind="illustrative">invented example: the courses, students and variables are made up</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
