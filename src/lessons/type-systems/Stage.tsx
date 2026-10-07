import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { TreeSvg } from '../../components/TreeSvg';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import { inferFrames } from './frames';
import {
  BUG_LINE, COERCIONS, COVERED_BY_TESTS, GRID, JS_CRASH, PRESETS, SNIPPET_JS, SNIPPET_TS, TS_ERROR, apply, children, collect, parseProgram, show, varsOf,
  type Expr, type Program,
} from './model';
import './styles.css';

type Scene = 'axes' | 'when' | 'infer';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'axes', label: 'Two axes' },
  { value: 'when', label: 'When it fails' },
  { value: 'infer', label: 'Inference' },
];

const FIXED = 'The TypeScript and Python results shown are fixed outputs, not run in your browser.';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'axes' });
  if (scene === 'when') return <WhenScene picker={picker} />;
  if (scene === 'infer') return <InferScene picker={picker} />;
  return <AxesScene picker={picker} />;
}

// ── Scene 1: checking time and conversions are separate axes ─────────

const CELL = 150;

function AxesScene({ picker }: { picker: ReactNode }) {
  const [picked, setPicked] = useState<string | null>(null);
  const ex = COERCIONS.find((c) => c.id === picked) ?? null;
  useIntroCaption(
    ex ? (
      <>
        {ex.lang}: <code>{ex.code}</code> gives <b className={ex.error ? 'ts-bad' : undefined}>{ex.result}</b>.{' '}
        {ex.lang === 'Python'
          ? 'Python checks types while running, but refuses to convert silently: dynamic and strict.'
          : 'JavaScript checks while running too, and converts silently to make it work: dynamic and loose.'}
      </>
    ) : (
      <>When types are checked (before running, or while running) and how willingly values are converted (strict or loose) are two separate questions. Pick an example.</>
    ),
    [picked],
  );
  const cellText = (names: string[]) =>
    names.map((n, i) => (
      <tspan key={n} x={CELL / 2} dy={i === 0 ? -(names.length - 1) * 9 : 18}>
        {n}
      </tspan>
    ));
  return (
    <StageFrame
      height={380}
      legend={<Legend items={[{ color: 'var(--hi)', label: 'the language in the example', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <ControlGroup label="Examples">
            {COERCIONS.map((c) => (
              <ChipButton key={c.id} tone="info" on={picked === c.id} onClick={() => setPicked(c.id)}>
                {c.lang}: {c.code}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="tsy stage-pad">
        <div className="tsy-axes">
          <div className="tsy-grid">
            <SectionTitle>Checked when? × Converts silently?</SectionTitle>
            <CellGrid
              rows={2}
              cols={2}
              size={{ cell: CELL, gap: 6, font: 14 }}
              rowLabels={GRID.rows.map((r) => r)}
              colLabels={GRID.cols.map((c) => c)}
              cell={(r, c) => {
                const names = GRID.cells[`${GRID.rows[r]} ${GRID.cols[c]}`];
                const hot = ex !== null && names.includes(ex.lang);
                return { text: cellText(names), tone: hot ? 'hi' : 'muted', fill: hot ? 'solid' : 'outline' };
              }}
              ariaLabel="Languages by when types are checked (static or dynamic) and whether values convert silently (strict or loose)"
            />
            <Hint block>
              static = checked before running; dynamic = checked while running. strict = refuses silent conversions; loose = converts. A rough placement: strictness is a
              spectrum (even Java turns "5" + 2 into "52").
            </Hint>
          </div>
          <div className="tsy-out">
            <ConsolePanel
              title={ex ? `${ex.lang}` : 'output'}
              lines={ex ? [ex.error ? { text: ex.result, tone: 'bad' } : ex.result] : []}
              empty="(pick an example)"
            />
            <Hint block>The JavaScript results are what real JavaScript gives (checked in the lesson's tests). {FIXED}</Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

// ── Scene 2: the same bug, found at different times ─────────────────

interface WhenFrame extends Frame {
  tsFlagged: boolean;
  testsRan: boolean;
  crashed: boolean;
}

const WHEN_FRAMES: WhenFrame[] = [
  {
    tsFlagged: false, testsRan: false, crashed: false,
    say: <>The same function twice. Line {BUG_LINE + 1} calls <code>toUpperCase()</code> on <code>user.id</code>, which is a number, but only for admins.</>,
  },
  {
    tsFlagged: true, testsRan: false, crashed: false,
    say: <>TypeScript (static): the checker reads the code before anything runs and flags line {BUG_LINE + 1}. Nothing has run yet.</>,
  },
  {
    tsFlagged: true, testsRan: true, crashed: false,
    say: <>JavaScript (dynamic): nothing checks ahead of time. The tests call shout with a regular user and pass; line {BUG_LINE + 1} never ran, as the coverage strip shows.</>,
  },
  {
    tsFlagged: true, testsRan: true, crashed: true, hold: 2,
    say: <>In production an admin calls it: line {BUG_LINE + 1} runs for the first time and <span className="hl bad">crashes</span>. Same bug, found by a user instead of a checker.</>,
  },
];

function WhenScene({ picker }: { picker: ReactNode }) {
  const player = usePlayer(WHEN_FRAMES, { interval: 2200 });
  const f = player.frame;
  return (
    <StageFrame
      player={player}
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'error / crash', shape: 'square' },
            { color: 'var(--ok)', label: 'covered by tests', shape: 'dot' },
            { color: 'var(--dim)', label: 'never run by tests', shape: 'dot' },
          ]}
        />
      }
      controls={[<>{picker}</>]}
    >
      <div className="tsy stage-pad">
        <div className="tsy-when">
          <div className="tsy-col">
            <CodePanel
              title="JavaScript (dynamic)"
              lines={SNIPPET_JS}
              stateOf={(i) => (f.crashed && i === BUG_LINE ? 'bad' : 'idle')}
              marker={(i) =>
                f.testsRan && i > 0 && i < SNIPPET_JS.length - 1 && SNIPPET_JS[i].trim() !== '}' ? (
                  <span className={`tsy-cov ${COVERED_BY_TESTS.includes(i) ? 'is-covered' : 'is-untested'}`} aria-label={COVERED_BY_TESTS.includes(i) ? 'covered' : 'untested'} />
                ) : null
              }
              className="tsy-code"
            />
            <ConsolePanel
              title="run"
              lines={f.testsRan ? ['shout({ isAdmin: false, name: "ada" }) → "ADA"', '✓ tests pass'] : []}
              error={f.crashed ? JS_CRASH : undefined}
              empty="(not run yet)"
            />
          </div>
          <div className="tsy-col">
            <CodePanel title="TypeScript (static)" lines={SNIPPET_TS} stateOf={(i) => (f.tsFlagged && i === BUG_LINE ? 'bad' : 'idle')} className="tsy-code" />
            <ConsolePanel title="tsc, before running" lines={f.tsFlagged ? [{ text: TS_ERROR, tone: 'bad' }] : []} empty="(not checked yet)" />
          </div>
        </div>
        <Hint block>{FIXED} The JavaScript crash message is what real JavaScript throws (checked in the lesson's tests).</Hint>
      </div>
    </StageFrame>
  );
}

// ── Scene 3: inference by unification ───────────────────────────────

const ROOT: string = 'root';
const AST_W = 460;
const AST_H = 250;

const nodeLabel = (e: Expr) =>
  e.kind === 'int' ? e.value : e.kind === 'bool' ? String(e.value) : e.kind === 'str' ? `"${e.value}"` : e.kind === 'var' ? e.name : e.kind === 'app' ? 'apply' : e.kind === 'if' ? 'if' : e.op;

function InferScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState<string>('twice');
  const [text, setText] = useState('fn twice f x = f (f x)');
  const [prog, setProg] = useState<Program>(() => {
    const r = parseProgram('fn twice f x = f (f x)');
    if (!r.ok) throw new Error(r.error);
    return r.program;
  });
  const [error, setError] = useState<string | null>(null);
  const edit = (next: string, id = '') => {
    setText(next);
    setPresetId(id);
    const r = parseProgram(next);
    if (!r.ok) return setError(r.error);
    setError(null);
    setProg(r.program);
  };
  const c = useMemo(() => collect(prog), [prog]);
  const frames = useMemo(() => inferFrames(prog), [prog]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;

  const byId = new Map<string, Expr>();
  const walk = (e: Expr) => {
    byId.set(e.id, e);
    children(e).forEach(walk);
  };
  walk(prog.body);
  const conflictNodes = new Set(f.conflict.map((i) => c.constraints[i].origin));
  const typeAt = (id: string) => (id === ROOT ? apply(f.subst, c.root) : apply(f.subst, c.typeOf.get(id)!));
  const rootLabel = prog.name ? `fn ${prog.name} ${prog.params.join(' ')}` : 'program';
  const done = f.result !== null;
  const substRows = [...f.subst.entries()];

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="Constraints" value={f.collected ? c.constraints.length : '–'} color="var(--muted)" />
          <Stat label="Bindings" value={f.subst.size} color="var(--violet)" />
          <Stat label="Type" value={f.result ?? (f.failed ? 'error' : '…')} color={f.result ? 'var(--ok)' : f.failed ? 'var(--bad)' : 'var(--muted)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'node whose constraint is being solved', shape: 'square' },
            { color: 'var(--violet)', label: 'type still has variables', shape: 'square' },
            { color: 'var(--info)', label: 'concrete type', shape: 'square' },
            { color: 'var(--ok)', label: 'the result', shape: 'square' },
            { color: 'var(--bad)', label: 'conflict', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Program">
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={p.id === presetId} onClick={() => edit(p.src, p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Your own" value={text} onChange={(v) => edit(v)} width={280} spellCheck={false} className="tsy-field" />
          <Hint tone="muted" block>
            <span role="status">{error ? <span className="ts-bad">{error} Showing the last program that parsed.</span> : null}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="tsy stage-pad">
        <WideRegion minWidth={500} label="Typed AST: scroll sideways to see all of it">
          <TreeSvg
            natural
            shape={{ root: ROOT, children: (id) => (id === ROOT ? [prog.body.id] : children(byId.get(id)!).map((e) => e.id)) }}
            layout="tidy"
            width={AST_W}
            height={AST_H}
            levelGap={56}
            top={26}
            className="tsy-ast"
            ariaLabel="The program's syntax tree with a type on each node"
            nodeClass={(id) =>
              `${id === f.hot ? 'is-hot' : ''} ${conflictNodes.has(id) ? 'is-bad' : ''} ${id === ROOT && done ? 'is-done' : ''}`
            }
            renderNode={(id) => {
              const label = id === ROOT ? rootLabel : nodeLabel(byId.get(id)!);
              const ty = typeAt(id);
              const typeText = show(ty);
              const tone = id === ROOT && done ? 'ok' : conflictNodes.has(id) ? 'bad' : varsOf(ty).length ? 'violet' : 'info';
              const w = Math.max(34, label.length * 8 + 16);
              const bw = Math.max(30, typeText.length * 6.6 + 12);
              return (
                <>
                  <rect x={-w / 2} y={-13} width={w} height={26} rx={7} />
                  <text y={4.5} textAnchor="middle">
                    {label}
                  </text>
                  <g className={`tsy-badge tone-${tone}`}>
                    <rect x={-bw / 2} y={16} width={bw} height={17} rx={8.5} />
                    <text y={28.5} textAnchor="middle">
                      {typeText}
                    </text>
                  </g>
                </>
              );
            }}
          />
        </WideRegion>
        <div className="tsy-solve">
          <div className="tsy-col">
            <SectionTitle>Constraints</SectionTitle>
            {f.collected ? (
              <ol className="tsy-constraints">
                {c.constraints.map((k, i) => (
                  <li key={i} className={`${i === f.current ? 'is-hot' : ''} ${f.conflict.includes(i) ? 'is-bad' : ''}`}>
                    <code>
                      {show(k.left)} = {show(k.right)}
                    </code>{' '}
                    <span className="tsy-why">{k.why}</span>
                  </li>
                ))}
                {!c.constraints.length && <li className="empty-note">none: nothing to solve</li>}
              </ol>
            ) : (
              <p className="empty-note">not collected yet</p>
            )}
          </div>
          <div className="tsy-col">
            <SectionTitle>Substitution</SectionTitle>
            {substRows.length ? (
              <table className="data-table tsy-subst">
                <tbody>
                  {substRows.map(([v, t]) => (
                    <tr key={v}>
                      <th scope="row">{v}</th>
                      <td>
                        <code>{show(t)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty-note">empty</p>
            )}
          </div>
        </div>
        <Hint block>
          Inference here is Hindley-Milner style on a tiny language, the kind ML, OCaml and Haskell use; TypeScript infers differently (locally) and asks you to annotate
          parameters. The letters in the result are generics: a later lesson on generics builds on exactly this.
        </Hint>
      </div>
    </StageFrame>
  );
}
