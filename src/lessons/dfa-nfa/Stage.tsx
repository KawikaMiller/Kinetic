import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CellGrid } from '../../components/CellGrid';
import { GraphView, type GraphEdge, type GraphNode, type Pt } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { edgesOf, subsetName, type Dfa, type Nfa, type State } from '../../core/automata';
import { circlePositions } from '../../core/graphLayout';
import { useIntroCaption } from '../../core/caption';
import { plural, power } from '../../core/format';
import { minWidthForText } from '../../core/scale';
import { usePlayer } from '../../core/usePlayer';
import { runFrames, subsetFrames, subsetPlan, symbolText, verdictText } from './frames';
import {
  CHECK_LENGTH, DFA_PRESETS, EDIT_AT, EDIT_STATES, ENDS_01, EVEN_UNION, NFA_PRESETS, TARGETS, alphabetText, blankMachine, checkInput, checkMachine,
  nthFromEnd, reachable, withSolution, type Drawn,
} from './model';
import './styles.css';

type Scene = 'run' | 'subset' | 'build';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'run', label: 'Run a machine' },
  { value: 'subset', label: 'NFA → DFA' },
  { value: 'build', label: 'Build one' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'run' });
  if (scene === 'subset') return <SubsetScene picker={picker} />;
  if (scene === 'build') return <BuildScene picker={picker} />;
  return <RunScene picker={picker} />;
}

const STEP_MS = 1000;
const DIAGRAM_MIN = 560;
const DIAGRAM_W = 560;
const NOTHING_SIMULATED = 'Nothing simulated: the machine runs live on your input.';

/** A machine as GraphView nodes and edges: one arrow per state pair, labelled with its symbols. */
function drawing(m: Dfa | Nfa, at: Record<State, Pt>, shown?: ReadonlySet<State>) {
  const nodes: GraphNode<State>[] = m.states.filter((s) => !shown || shown.has(s)).map((s) => ({ id: s, at: at[s], accept: m.accept.includes(s) }));
  const edges = edgesOf(m).filter((e) => !shown || (shown.has(e.from) && shown.has(e.to)));
  const graphEdges: GraphEdge<State>[] = edges.map((e) => ({ from: e.from, to: e.to, label: e.symbols.join(',') }));
  return { nodes, edges, graphEdges };
}

const diagramHeight = (at: Record<State, Pt>) => Math.max(...Object.values(at).map((p) => p.y)) + 60;

// ── Scene 1: run a machine on the tape ───────────────────────────────

const PRESETS: Drawn<Dfa | Nfa>[] = [...DFA_PRESETS, ...NFA_PRESETS];

function RunScene({ picker }: { picker: ReactNode }) {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [text, setText] = useState(preset.samples[0]);
  const [symbols, setSymbols] = useState<string[]>([...preset.samples[0]]);
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => runFrames(preset, symbols), [preset, symbols]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const m = preset.machine;
  const { nodes, edges, graphEdges } = useMemo(() => drawing(m, preset.at), [m, preset.at]);
  const lit = new Set(f.states);
  const taken = new Set(f.taken.map((t) => `${t.from}\u0000${t.to}`));
  const wide = m.states.some((s) => s.length > 3);
  const live = useMemo(() => reachable(m), [m]);

  const load = (id: string) => {
    const p = PRESETS.find((x) => x.id === id)!;
    setPresetId(id);
    setText(p.samples[0]);
    setSymbols([...p.samples[0]]);
    setError(null);
  };
  const type = (next: string) => {
    setText(next);
    const r = checkInput(m, next);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setSymbols(r.symbols);
  };

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Machine" value={m.kind.toUpperCase()} color={m.kind === 'nfa' ? 'var(--violet)' : 'var(--info)'} sub={`alphabet ${alphabetText(m)}`} />
          <Stat label="Lit states" value={f.states.length} color="var(--hi)" sub={m.kind === 'nfa' ? 'an NFA can light several' : 'a DFA lights exactly one'} />
          <Stat
            label="Verdict"
            value={f.verdict === null ? 'reading…' : f.verdict ? 'accepted' : 'rejected'}
            color={f.verdict === null ? 'var(--muted)' : f.verdict ? 'var(--ok)' : 'var(--bad)'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current state', shape: 'square' },
            { color: 'var(--info)', label: 'arrow being taken', shape: 'line' },
            { color: 'var(--line-2)', label: 'double ring = accepting', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="DFA">
            {DFA_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={p.id === presetId} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <ControlGroup label="NFA">
            {NFA_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="violet" on={p.id === presetId} onClick={() => load(p.id)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Input" value={text} onChange={type} width={200} spellCheck={false} maxLength={40} />
          <ControlGroup label="Try">
            {preset.samples.map((s) => (
              <ChipButton key={s} tone="muted" on={symbols.join('') === s && !error} onClick={() => type(s)}>
                {s}
              </ChipButton>
            ))}
            <ChipButton tone="muted" on={symbols.length === 0 && !error} onClick={() => type('')}>
              empty
            </ChipButton>
          </ControlGroup>
          <Hint tone="muted" block>
            <span role="status">{error ? <span className="dn-error">{error} The tape keeps its last good input.</span> : null}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="dn stage-pad">
        <p className="dn-meaning">
          This {m.kind.toUpperCase()} accepts {preset.language}.
          {preset.symbolNames && <> Events: {Object.entries(preset.symbolNames).map(([k, v]) => `${k} = ${v}`).join(', ')}; a missing arrow means the door refuses it.</>}
        </p>
        <WideRegion minWidth={DIAGRAM_MIN} label="State diagram: scroll sideways to see all of it">
          <GraphView
            key={player.index}
            nodes={nodes}
            edges={graphEdges}
            directed
            startNode={m.start}
            width={DIAGRAM_W}
            height={diagramHeight(preset.at)}
            radius={wide ? 34 : 22}
            className="dn-graph"
            ariaLabel={`State diagram of the ${preset.label} ${m.kind.toUpperCase()}: ${m.states.length} states, start ${m.start}, accepting ${m.accept.join(' and ')}`}
            nodeMark={(id) => (lit.has(id) ? { tone: 'hi', fill: 'solid' } : live.has(id) ? null : { tone: 'dim', fill: 'tint' })}
            edgeMark={(_, i) => (taken.has(`${edges[i].from}\u0000${edges[i].to}`) ? { tone: 'info', width: 4 } : null)}
          />
        </WideRegion>
        <div className="dn-tape">
          <SectionTitle>Tape</SectionTitle>
          {symbols.length ? (
            <ArrayStrip
              values={symbols}
              cellMax={44}
              cellState={(i) => (i === f.read - 1 ? 'active' : i < f.read - 1 ? 'dim' : 'idle')}
              pointers={f.read < symbols.length ? [{ i: f.read, label: 'next', tone: 'info', id: 'next' }] : []}
            />
          ) : (
            <p className="empty-note">the empty string: nothing to read</p>
          )}
          <p className="dn-verdict" aria-live="polite">
            {f.verdict === null
              ? <>Read {f.read} of {plural(symbols.length, 'symbol')}{f.read > 0 ? <>; last: {symbolText(preset, symbols[f.read - 1])}</> : null}.</>
              : <>Verdict: {verdictText(f.verdict)}.</>}{' '}
            <span className="dn-honest">{NOTHING_SIMULATED}</span>
          </p>
        </div>
      </div>
    </StageFrame>
  );
}

// ── Scene 2: the subset construction ────────────────────────────────

type NfaChoice = 'ends01' | 'nth' | 'union';
const DFA_W = 640;
const DFA_H = 400;
const DFA_BOX = { w: 92, h: 30, rx: 8 };
/** The DFA's 12px labels stay at 8px or more. */
const DFA_MIN = minWidthForText(DFA_W, 12);

/** The DFA's box nodes go round an ellipse: wide labels need the width. */
const DFA_RADII = { rx: DFA_W / 2 - 60, ry: DFA_H / 2 - 62 };
/**
 * Places every DFA state up front (not just the ones born so far), so a box never moves as
 * the table fills; that's why this uses circlePositions directly rather than layout="circle".
 */
const ellipse = (ids: readonly State[]): Record<State, Pt> => Object.fromEntries(circlePositions(ids, DFA_W, DFA_H, 0, DFA_RADII));

function SubsetScene({ picker }: { picker: ReactNode }) {
  const [choice, setChoice] = useState<NfaChoice>('nth');
  const [n, setN] = useState(3);
  const drawn = useMemo(() => (choice === 'ends01' ? ENDS_01 : choice === 'union' ? EVEN_UNION : nthFromEnd(n)), [choice, n]);
  const plan = useMemo(() => subsetPlan(drawn.machine), [drawn.machine]);
  const frames = useMemo(() => subsetFrames(plan, choice === 'nth' ? n : null), [plan, choice, n]);
  const player = usePlayer(frames, { interval: 900 });
  const f = player.frame;
  const { result } = plan;
  const dfa = result.dfa;
  const born = new Set(dfa.states.filter((s) => plan.bornAfter[s] <= f.filled));
  const order = dfa.states.filter((s) => born.has(s));
  const row = f.current !== null ? result.rows[f.current] : null;
  const fromLit = new Set(row?.from ?? []);
  const nfaDraw = drawing(drawn.machine, drawn.at);
  const at = useMemo(() => ellipse(dfa.states), [dfa.states]);
  // The DFA so far: only the cells filled up to this frame.
  const partial: Dfa = {
    ...dfa,
    delta: Object.fromEntries(
      dfa.states.map((s) => [s, Object.fromEntries(result.rows.slice(0, f.filled).filter((r) => subsetName(r.from) === s).map((r) => [r.symbol, subsetName(r.to)]))]),
    ),
  };
  const dfaDraw = drawing(partial, at, born);
  const symIndex = (sym: string) => drawn.machine.alphabet.indexOf(sym);
  const cellAt = (r: number, c: number) => {
    const from = order[r];
    const k = result.rows.findIndex((x) => subsetName(x.from) === from && symIndex(x.symbol) === c);
    return { k, text: k < f.filled ? subsetName(result.rows[k].to) : '' };
  };

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="NFA states" value={drawn.machine.states.length} color="var(--violet)" />
          <Stat label="DFA states found" value={born.size} color="var(--info)" sub={choice === 'nth' ? `${power(n)} = ${2 ** n} at the end` : `of ${dfa.states.length}`} />
          <Stat label="Table cells" value={`${f.filled} / ${result.rows.length}`} color="var(--muted)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'NFA states in the row being filled', shape: 'square' },
            { color: 'var(--violet)', label: 'table cell being filled', shape: 'square' },
            { color: 'var(--info)', label: 'its new DFA arrow', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="NFA"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'ends01', label: 'Ends in 01' },
              { value: 'nth', label: 'n-th from end is 1' },
              { value: 'union', label: 'Even 0s or 1s (ε)' },
            ]}
          />
          {choice === 'nth' && <Slider label="n" value={n} min={1} max={4} onChange={setN} />}
        </>,
      ]}
    >
      <div className="dn stage-pad">
        <p className="dn-meaning">
          The NFA for {drawn.language}. Each DFA state is a <b>set</b> of NFA states: everywhere the NFA could be at once.
        </p>
        <WideRegion minWidth={DIAGRAM_MIN} label="NFA diagram: scroll sideways to see all of it">
          <GraphView
            nodes={nfaDraw.nodes}
            edges={nfaDraw.graphEdges}
            directed
            startNode={drawn.machine.start}
            width={DIAGRAM_W}
            height={diagramHeight(drawn.at)}
            radius={22}
            className="dn-graph"
            ariaLabel={`The NFA: ${drawn.machine.states.length} states`}
            nodeMark={(id) => (fromLit.has(id) ? { tone: 'hi', fill: 'solid' } : null)}
          />
        </WideRegion>
        <div className="dn-subset">
          <div className="dn-table">
            <SectionTitle>Subset table</SectionTitle>
            <WideRegion minWidth={260} label="Subset table: scroll sideways to see all of it">
              <CellGrid
                rows={order.length}
                cols={drawn.machine.alphabet.length}
                size={{ cell: 72, gap: 4, font: 11 }}
                colLabels={drawn.machine.alphabet.map((a) => `on ${a}`)}
                rowLabels={order.map((s) => `${s === dfa.start ? '→ ' : ''}${s}${dfa.accept.includes(s) ? ' ✓' : ''}`)}
                cell={(r, c) => {
                  const { k, text } = cellAt(r, c);
                  if (k === f.current) return { text, tone: 'violet', fill: 'solid' };
                  return text ? { text, tone: 'muted', fill: 'outline' } : { tone: 'dim', fill: 'outline' };
                }}
                ariaLabel="Subset table: rows are DFA states, columns are input symbols"
                className="dn-grid"
              />
            </WideRegion>
            <Hint block>→ marks the start; ✓ marks accepting sets (they contain an accepting NFA state).</Hint>
          </div>
          <div className="dn-dfa">
            <SectionTitle>The DFA so far</SectionTitle>
            <WideRegion minWidth={DFA_MIN} label="DFA diagram: scroll sideways to see all of it">
              <GraphView
                nodes={dfaDraw.nodes.map((nd) => ({ ...nd, shape: 'box' as const }))}
                edges={dfaDraw.graphEdges}
                directed
                startNode={born.has(dfa.start) ? dfa.start : undefined}
                width={DFA_W}
                height={DFA_H}
                box={DFA_BOX}
                className="dn-graph dn-dfa-graph"
                ariaLabel={`The DFA built so far: ${plural(born.size, 'state')}`}
                nodeMark={(id) => (row && subsetName(row.to) === id ? { tone: 'info', fill: 'tint', tint: 30 } : null)}
                edgeMark={(e) => (row && subsetName(row.from) === e.from && subsetName(row.to) === e.to ? { tone: 'info', width: 4 } : null)}
              />
            </WideRegion>
            <Hint block>Accepting DFA states have a double outline. {NOTHING_SIMULATED}</Hint>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}

// ── Scene 3: build a machine for a stated language ──────────────────

/** Strings over {0,1} of length 0 to CHECK_LENGTH. */
const ALL_CHECKED = 2 ** (CHECK_LENGTH + 1) - 1;

function BuildScene({ picker }: { picker: ReactNode }) {
  const [targetId, setTargetId] = useState(TARGETS[0].id);
  const target = TARGETS.find((t) => t.id === targetId)!;
  const [machine, setMachine] = useState<Dfa>(blankMachine);
  const result = useMemo(() => checkMachine(machine, target), [machine, target]);
  const live = reachable(machine);
  const { nodes, graphEdges } = drawing(machine, EDIT_AT);

  const toggleAccept = (s: State) =>
    setMachine({ ...machine, accept: machine.accept.includes(s) ? machine.accept.filter((x) => x !== s) : [...machine.accept, s].sort() });
  const retarget = (s: State, sym: string, to: State) => setMachine({ ...machine, delta: { ...machine.delta, [s]: { ...machine.delta[s], [sym]: to } } });

  const shown = (s: string) => (s === '' ? 'the empty string' : s);
  const verdict = result.ok ? (
    <>
      <span className="hl ok">Matches</span> “{target.label.toLowerCase()}” on all {result.tested} strings up to length {CHECK_LENGTH}.
    </>
  ) : (
    <>
      <span className="hl bad">Counterexample:</span> <b>{shown(result.counterexample)}</b>. The language {result.shouldAccept ? 'contains' : 'excludes'} it, but your
      machine {result.shouldAccept ? 'rejects' : 'accepts'} it. It's the shortest string that goes wrong.
    </>
  );
  useIntroCaption(verdict, [machine, target]);

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Checked" value={result.tested} sub={`strings up to length ${CHECK_LENGTH}`} color="var(--muted)" />
          <Stat label="Result" value={result.ok ? 'correct' : 'wrong'} color={result.ok ? 'var(--ok)' : 'var(--bad)'} />
          <Stat label="Reachable states" value={`${live.size} / ${EDIT_STATES.length}`} color="var(--muted)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--line-2)', label: 'double ring = accepting', shape: 'dot' },
            { color: 'var(--dim)', label: 'unreachable from the start', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Language to build">
            {TARGETS.map((t) => (
              <ChipButton key={t.id} tone="info" on={t.id === targetId} onClick={() => setTargetId(t.id)}>
                {t.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button onClick={() => setMachine(withSolution(target))}>Show a solution</Button>
          <Button onClick={() => setMachine(blankMachine())}>Clear</Button>
          <Hint>Every edit re-checks the machine on all {ALL_CHECKED} strings over {'{0,1}'} up to length {CHECK_LENGTH}.</Hint>
        </>,
      ]}
    >
      <div className="dn dn-build stage-pad">
        <div className="dn-build-graph">
          <WideRegion minWidth={DIAGRAM_MIN} label="Your machine: scroll sideways to see all of it">
            <GraphView
              nodes={nodes}
              edges={graphEdges}
              directed
              startNode="q0"
              width={DIAGRAM_W}
              height={270}
              radius={22}
              className="dn-graph"
              ariaLabel={`Your DFA: accepting ${machine.accept.join(', ') || 'none'}`}
              nodeMark={(id) => (live.has(id) ? null : { tone: 'dim', fill: 'tint' })}
              nodeClass={(id) => (live.has(id) ? '' : 'dn-unreachable')}
              edgeClass={(e) => (live.has(e.from) ? '' : 'dn-unreachable')}
            />
          </WideRegion>
        </div>
        <div className="dn-editor" role="group" aria-label="Transition table">
          {EDIT_STATES.map((s) => (
            <div key={s} className={`dn-row ${live.has(s) ? '' : 'is-unreachable'}`}>
              <b className="dn-state">{s}</b>
              <ChipButton tone="violet" on={machine.accept.includes(s)} onClick={() => toggleAccept(s)} ariaLabel={`${s} accepting`}>
                accepting
              </ChipButton>
              {machine.alphabet.map((sym) => (
                <Segmented
                  key={sym}
                  label={`on ${sym} →`}
                  ariaLabel={`${s} on ${sym} goes to`}
                  value={machine.delta[s][sym]}
                  onChange={(to) => retarget(s, sym, to)}
                  options={EDIT_STATES.map((t) => ({ value: t, label: t }))}
                />
              ))}
            </div>
          ))}
        </div>
        <p className="dn-verdict" aria-live="polite">
          {verdict}
        </p>
      </div>
    </StageFrame>
  );
}
