import { useEffect, useMemo, useRef, useState } from 'react';
import { CellGrid, type GridCellSpec, type GridHighlight } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { evalFrames, type Cell } from './frames';
import {
  ENGLISH, evaluate, explain, FORMULA_IDS, FORMULAS, MAX_SIDE, negationChain, not, read, resize, show, splitAtNegation, toggle,
  type FormulaId, type World,
} from './model';
import { DISHES, PEOPLE, PRESETS, SQL, TYPE_READING } from './presets';
import './styles.css';

const STEP_MS = 1100;
const GRID_SIZE = { cell: 40 };
const SIDES = Array.from({ length: MAX_SIDE + 1 }, (_, k) => ({ value: k, label: String(k) }));
const FORMULA_OPTIONS = FORMULA_IDS.map((id) => ({ value: id, label: show(FORMULAS[id]).replace(' likes(x, y)', '') }));
/** Jump straight to the verdict after an edit: the player clamps this to the last frame. */
const TO_END = Number.MAX_SAFE_INTEGER;

const has = (cells: readonly Cell[], x: number, y: number) => cells.some(([a, b]) => a === x && b === y);

export function Stage() {
  const [presetId, setPresetId] = useState<string>(PRESETS[0].id);
  const [world, setWorld] = useState<World>(PRESETS[0].world);
  const [formula, setFormula] = useState<FormulaId>('AE');
  const [negSteps, setNegSteps] = useState(0);
  // The ¬ button moves to the next line (or goes away) when pressed: keep keyboard focus with it.
  const negBox = useRef<HTMLDivElement>(null);
  const refocusNeg = useRef(false);
  const stepNeg = (k: number) => {
    refocusNeg.current = true;
    setNegSteps(k);
  };
  useEffect(() => {
    if (!refocusNeg.current) return;
    refocusNeg.current = false;
    negBox.current?.querySelector<HTMLElement>('.pl-neg, .btn')?.focus();
  }, [negSteps]);

  const frames = useMemo(() => evalFrames(formula, world), [formula, world]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;

  const chain = useMemo(() => negationChain(not(FORMULAS[formula])), [formula]);
  const shownChain = chain.slice(0, negSteps + 1);

  const load = (id: string) => {
    const p = PRESETS.find((q) => q.id === id)!;
    setPresetId(id);
    setWorld(p.world);
  };
  const edit = (next: World) => {
    player.queueNext({ play: false, from: TO_END });
    setPresetId('custom');
    setWorld(next);
  };
  const pickFormula = (id: FormulaId) => {
    setFormula(id);
    setNegSteps(0);
  };

  const cell = (x: number, y: number): GridCellSpec => {
    const liked = world.likes[x][y];
    if (has(f.ok, x, y) || (f.okCol === y && liked)) return { tone: 'ok', fill: 'solid', text: '✓' };
    if (has(f.bad, x, y) || (f.badRow === x && !liked)) return { tone: 'bad', fill: 'outline', text: '✗' };
    return liked ? { tone: 'info', fill: 'tint', intensity: 0.5, text: '♥' } : { tone: 'dim', fill: 'outline', text: '' };
  };
  const rings: GridHighlight[] = [];
  for (let y = 0; y < world.dishes; y++) if (f.scanRow !== null) rings.push({ r: f.scanRow, c: y, tone: 'hi' });
  for (let x = 0; x < world.people; x++) if (f.scanCol !== null) rings.push({ r: x, c: f.scanCol, tone: 'hi' });

  const e = explain(formula, world);
  const witness = (() => {
    if (e.id === 'AE') {
      if (world.people === 0) return 'pick = { } (the empty function: there are no people to map)';
      return e.value
        ? `pick = { ${e.picks.map((y, x) => `${PEOPLE[x]} → ${DISHES[y!]}`).join(', ')} }`
        : `no such function: ${PEOPLE[e.failRow!]} has no dish to map to`;
    }
    if (e.id === 'EA') return e.value ? `dish = ${DISHES[e.column!]}` : 'no single dish works for everyone';
    if (e.id === 'EE') return e.cell ? `pair = [${PEOPLE[e.cell[0]]}, ${DISHES[e.cell[1]]}]` : 'no pair exists';
    return e.cell ? `fails at (${PEOPLE[e.cell[0]]}, ${DISHES[e.cell[1]]})` : 'passes for every pair';
  })();

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="People" value={world.people} color="var(--muted)" />
          <Stat label="Dishes" value={world.dishes} color="var(--muted)" />
          <Stat label="Likes" value={world.likes.flat().filter(Boolean).length} color="var(--info)" sub={`of ${world.people * world.dishes} cells`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'x likes y', shape: 'square' },
            { color: 'var(--hi)', label: 'being examined', shape: 'square' },
            { color: 'var(--ok)', label: 'witness', shape: 'square' },
            { color: 'var(--bad)', label: 'counterexample', shape: 'square' },
            { color: 'var(--dim)', label: 'no like', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          <ControlGroup label="Presets">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} on={presetId === p.id} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Segmented label="People" value={world.people} onChange={(k: number) => edit(resize(world, k, world.dishes))} options={SIDES} />
          <Segmented label="Dishes" value={world.dishes} onChange={(k: number) => edit(resize(world, world.people, k))} options={SIDES} />
        </>,
        <>
          <Segmented label="Examine" value={formula} onChange={pickFormula} options={FORMULA_OPTIONS} />
          <Hint>Click a cell (or arrow to it, then Enter) to toggle a like.</Hint>
        </>,
      ]}
    >
      <div className="pl stage-pad">
        <div className="pl-left">
          <p className="pl-reads">
            Row x, column y is filled when <b>likes(x, y)</b>: person x likes dish y.
          </p>
          <CellGrid
            key={`${world.people}x${world.dishes}`}
            rows={world.people}
            cols={world.dishes}
            size={GRID_SIZE}
            cell={cell}
            rowLabels={PEOPLE.slice(0, world.people)}
            colLabels={DISHES.slice(0, world.dishes)}
            highlight={rings}
            onCellClick={(x, y) => edit(toggle(world, x, y))}
            cellAriaLabel={(x, y) => `${PEOPLE[x]} ${world.likes[x][y] ? 'likes' : "doesn't like"} ${DISHES[y]}. Press to toggle`}
            ariaLabel="likes(x, y): people are rows, dishes are columns"
            className="pl-grid"
          />
          {(world.people === 0 || world.dishes === 0) && (
            <p className="pl-empty">
              {world.people === 0 && world.dishes === 0
                ? 'Both domains are empty: no people and no dishes.'
                : world.people === 0
                  ? 'No people: the domain of x is empty.'
                  : 'No dishes: the domain of y is empty.'}
            </p>
          )}
          <Hint tone="muted" block>
            Nothing simulated: every truth value is computed from your grid.
          </Hint>
        </div>

        <div className="pl-right">
          <CodePanel
            title="The four formulas, live"
            lines={FORMULA_IDS.map((id) => show(FORMULAS[id]))}
            stateOf={(i) => (FORMULA_IDS[i] === formula ? 'now' : 'idle')}
            renderLine={(line, i) => (
              <>
                {line}
                <span className="pl-eng">{ENGLISH[FORMULA_IDS[i]]}</span>
              </>
            )}
            trailing={(i) => {
              const v = evaluate(FORMULAS[FORMULA_IDS[i]], world);
              return <span className={`pl-verdict tone-${v ? 'ok' : 'bad'}`}>{v ? 'true' : 'false'}</span>;
            }}
            className="pl-formulas"
          />

          <Box className="pl-box">
            <SectionTitle>As a type: the witness a proof must hand over</SectionTitle>
            <p className="pl-type">
              <code>{TYPE_READING[formula].type}</code> <span className="pl-gloss">{TYPE_READING[formula].gloss}</span>
            </p>
            <p className={`pl-witness tone-${e.value ? 'ok' : 'bad'}`}>{witness}</p>
          </Box>

          <Box className="pl-box">
            <SectionTitle>Push the negation inward</SectionTitle>
            <div ref={negBox} className="pl-negbox">
              <CodePanel
                lines={shownChain.map((s) => show(s.formula))}
                gutter="none"
                renderLine={(line, i) => {
                  const split = i === shownChain.length - 1 && i < chain.length - 1 ? splitAtNegation(line) : null;
                  if (!split) return line;
                  return (
                    <>
                      {split.before}
                      <button type="button" className="pl-neg" onClick={() => stepNeg(negSteps + 1)} aria-label="Push this negation one step inward">
                        ¬
                      </button>
                      {split.after}
                    </>
                  );
                }}
                trailing={(i) => {
                  const v = evaluate(shownChain[i].formula, world);
                  return (
                    <>
                      <span className={`pl-verdict tone-${v ? 'ok' : 'bad'}`}>{v ? 'true' : 'false'}</span>
                      {shownChain[i].law && <> by {shownChain[i].law}</>}
                    </>
                  );
                }}
                className="pl-chain"
              />
              <p className="pl-gloss">
                {negSteps < chain.length - 1 ? (
                  'Click the yellow ¬ to push it past the next quantifier. Each line is evaluated on your grid.'
                ) : (
                  <>Reads: {read(chain.at(-1)!.formula)}. Every line has the same truth value, on any grid.</>
                )}
              </p>
              {negSteps > 0 && <Button onClick={() => stepNeg(0)}>Start over</Button>}
            </div>
          </Box>

          <CodePanel title={`As SQL: returns ${evaluate(FORMULAS[formula], world) ? 'TRUE' : 'FALSE'} on this grid`} lines={SQL[formula]} gutter="none" className="pl-sql" />
          <Hint tone="muted" block>
            Tables: people(id), dishes(id), likes(person, dish). SQL has no "for all", so ∀x P is written ¬∃x ¬P: a NOT EXISTS around a NOT, "there is no counterexample". The comments say which piece each line writes.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
