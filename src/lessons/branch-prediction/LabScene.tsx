import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { CellGrid, type GridCellSpec } from '../../components/CellGrid';
import { GraphView } from '../../components/GraphView';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pct } from '../../core/format';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { historyText, labTotals, n, word } from './captions';
import { labFrames } from './frames';
import {
  COUNTER_NAMES, HISTORY_RANGE, PREDICTOR_KINDS, PREDICTOR_LABELS, run, type PredictorConfig, type PredictorKind,
} from './predictor';
import {
  EVERY_RANGE, LAB_LENGTH, LAB_SEED, P_STEP, PATTERN_LENGTH, PATTERN_PRESETS, PENALTY_RANGE, accuracyCurves, labOpening, labOutcomes, type StreamSource,
} from './scenarios';

const STEP_MS = 420;
const PER_ROW = 16;
const STREAM_CELL = { cell: 17, gap: 2, font: 10 } as const;
const TABLE_CELL = { cell: 34, gap: 3, font: 12 } as const;
const DIAGRAM = { width: 320, height: 130 } as const;
const CURVE_TONE: Record<PredictorKind, Tone> = {
  'static-taken': 'orange', 'static-not-taken': 'amber', 'one-bit': 'pink', 'two-bit': 'sky', 'two-level': 'muted',
};
const INITIAL_OPTIONS = [0, 1, 2, 3].map((v) => ({ value: v, label: String(v) }));
const PREDICTOR_OPTIONS = PREDICTOR_KINDS.map((k) => ({ value: k, label: PREDICTOR_LABELS[k] }));

const DIAGRAM_NODES = [0, 1, 2, 3].map((i) => ({ id: String(i), label: String(i), at: { x: 44 + i * 77, y: 70 } }));
const DIAGRAM_EDGES = [
  ...[0, 1, 2].map((i) => ({ from: String(i), to: String(i + 1), label: 'T' })),
  { from: '3', to: '3', label: 'T' },
  ...[1, 2, 3].map((i) => ({ from: String(i), to: String(i - 1), label: 'N' })),
  { from: '0', to: '0', label: 'N' },
];

const sourceLabel = (s: StreamSource, p: number) =>
  s.kind === 'random' ? `random, taken with probability ${pct(p)}` : s.kind === 'sorted' ? 'sorted data (every 4th of 256 values)' : s.kind === 'unsorted' ? 'unsorted data (every 4th of 256 values)' : 'your 16-cell pattern, repeated';

export function LabScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(labOpening);
  const [kind, setKind] = useState(open.kind);
  const [initialCounter, setInitialCounter] = useState(open.initialCounter);
  const [historyBits, setHistoryBits] = useState(open.historyBits);
  const [penalty, setPenalty] = useState(open.penalty);
  const [every, setEvery] = useState(open.every);
  const [sourceKind, setSourceKind] = useState(open.source.kind);
  const [pattern, setPattern] = useState<readonly boolean[]>(open.source.kind === 'pattern' ? open.source.pattern : []);
  const [p, setP] = useState(open.p);

  const source = useMemo<StreamSource>(() => {
    if (sourceKind === 'random') return { kind: 'random', p };
    if (sourceKind === 'pattern') return { kind: 'pattern', pattern };
    return { kind: sourceKind };
  }, [sourceKind, pattern, p]);
  const outcomes = useMemo(() => labOutcomes(source), [source]);
  const cfg = useMemo<PredictorConfig>(() => ({ kind, initialCounter, historyBits }), [kind, initialCounter, historyBits]);
  const steps = useMemo(() => run(cfg, outcomes), [cfg, outcomes]);
  const frames = useMemo(() => labFrames(kind, steps, penalty, every), [kind, steps, penalty, every]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const i = player.frame.i;
  const step = i >= 0 ? steps[i] : null;
  const shown = useMemo(() => labTotals(steps.slice(0, i + 1), penalty, every), [steps, i, penalty, every]);
  const whole = useMemo(() => labTotals(steps, penalty, every), [steps, penalty, every]);
  const compare = useMemo(
    () => PREDICTOR_KINDS.map((k) => ({ kind: k, ...labTotals(run({ kind: k, initialCounter, historyBits }, outcomes), penalty, every) })),
    [initialCounter, historyBits, outcomes, penalty, every],
  );
  const curves = useMemo(() => accuracyCurves(initialCounter, historyBits), [initialCounter, historyBits]);

  // The "Edit as a pattern" button unmounts when it works, so hand focus to the first outcome toggle.
  const strip = useRef<HTMLDivElement>(null);
  const focusStrip = useRef(false);
  useEffect(() => {
    if (sourceKind === 'pattern' && focusStrip.current) {
      focusStrip.current = false;
      strip.current?.querySelector('button')?.focus();
    }
  }, [sourceKind]);
  const editPattern = (index: number) => {
    const base = sourceKind === 'pattern' ? pattern : outcomes.slice(0, PATTERN_LENGTH);
    setPattern(base.map((b, k) => (k === index ? !b : b)));
    setSourceKind('pattern');
  };
  const loadPattern = (bits: readonly boolean[]) => {
    setPattern(bits);
    setSourceKind('pattern');
  };

  const rows = (LAB_LENGTH / PER_ROW) * 2;
  const cell = (r: number, c: number): GridCellSpec => {
    const k = Math.floor(r / 2) * PER_ROW + c;
    const processed = k <= i;
    if (r % 2 === 0) {
      const taken = outcomes[k];
      return { text: taken ? 'T' : 'N', tone: taken ? 'hi' : 'muted', fill: processed || k === i + 1 ? 'tint' : 'outline', intensity: taken ? 0.34 : 0.18 };
    }
    if (!processed) return { fill: 'none' };
    const s = steps[k];
    return { text: s.guess ? 'T' : 'N', tone: s.hit ? 'ok' : 'bad', fill: 'tint', intensity: 0.3 };
  };
  const current = step && { r: Math.floor(step.index / PER_ROW) * 2, c: step.index % PER_ROW };
  const rowLabels = Array.from({ length: rows }, (_, r) => (r % 2 === 0 ? `${(r / 2) * PER_ROW + 1}-${(r / 2 + 1) * PER_ROW}` : 'guess'));

  const state = step?.after;
  const counterNow = kind === 'two-bit' ? (state?.counter ?? initialCounter) : initialCounter;
  const edgeUsed = (e: { from: string; to: string; label?: ReactNode }) =>
    !!step && kind === 'two-bit' && e.from === String(step.before.counter) && e.to === String(step.after.counter) && e.label === (step.taken ? 'T' : 'N');
  const tableSize = 2 ** historyBits;
  const tableState = state ?? steps[0]?.before;

  return (
    <StageFrame
      player={player}
      height={560}
      stats={
        <Stats>
          <Stat label="Accuracy" value={i >= 0 ? pct(shown.accuracy) : '-'} color="var(--ok)" sub={i >= 0 ? `${n(shown.branches - shown.misses)} of ${n(shown.branches)} guesses right` : 'press play'} />
          <Stat label="Misses" value={n(shown.misses)} color={shown.misses > 0 ? 'var(--bad)' : undefined} sub={`whole run: ${n(whole.misses)} of ${n(whole.branches)}`} />
          <Stat label="Total cycles" value={n(shown.cycles)} sub={[`${n(shown.instructions)} instructions + ${n(shown.misses)} x ${n(penalty)}`, `whole run: ${n(whole.cycles)}`]} />
          <Stat label="IPC" value={shown.ipc.toFixed(2)} sub={`lost to misses: ${pct(1 - shown.ipc)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'outcome: taken', shape: 'square' },
            { color: 'var(--muted)', label: 'outcome: not taken', shape: 'square' },
            { color: 'var(--ok)', label: 'guess right', shape: 'square' },
            { color: 'var(--bad)', label: 'guess wrong', shape: 'square' },
            { color: 'var(--violet)', label: 'the predictor\'s guess', shape: 'square' },
            { color: 'var(--info)', label: 'the counter now', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Predictor" value={kind} onChange={setKind} options={PREDICTOR_OPTIONS} />
        </>,
        <>
          <Segmented label="Initial counter state" value={initialCounter} onChange={setInitialCounter} options={INITIAL_OPTIONS} />
          <Slider label="History bits (two-level)" value={historyBits} min={HISTORY_RANGE.min} max={HISTORY_RANGE.max} onChange={setHistoryBits} />
        </>,
        <>
          <Slider label="Miss penalty (illustrative)" value={penalty} min={PENALTY_RANGE.min} max={PENALTY_RANGE.max} onChange={setPenalty} format={(v) => `${v} cycles`} />
          <Slider label="A branch every" value={every} min={EVERY_RANGE.min} max={EVERY_RANGE.max} onChange={setEvery} format={(v) => `${v} instructions`} />
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {PATTERN_PRESETS.map((preset) => (
              <ChipButton key={preset.id} tone="info" on={sourceKind === 'pattern' && pattern.join() === preset.pattern.join()} onClick={() => loadPattern(preset.pattern)}>{preset.label}</ChipButton>
            ))}
            <ChipButton tone="info" on={sourceKind === 'random'} onClick={() => setSourceKind('random')}>Random with probability p</ChipButton>
            <ChipButton tone="info" on={sourceKind === 'sorted'} onClick={() => setSourceKind('sorted')}>Sorted data</ChipButton>
            <ChipButton tone="info" on={sourceKind === 'unsorted'} onClick={() => setSourceKind('unsorted')}>Unsorted data</ChipButton>
          </ControlGroup>
          {sourceKind === 'random' && (
            <Slider label="Probability taken, p" value={p} min={0} max={1} step={P_STEP} onChange={(v) => setP(Math.round(v * 100) / 100)} format={(v) => pct(v)} />
          )}
        </>,
      ]}
    >
      <div className="bp-stage stage-pad">
        <Box>
          <SectionTitle hint={sourceLabel(source, p)}>The branch stream</SectionTitle>
          <CellGrid
            className="bp-stream"
            rows={rows}
            cols={PER_ROW}
            size={STREAM_CELL}
            cell={cell}
            rowLabels={rowLabels}
            highlight={current ? [{ r: current.r, c: current.c, tone: 'hi' }, { r: current.r + 1, c: current.c, tone: 'violet' }] : []}
            ariaLabel={`Branch outcomes and the predictor's guesses${step ? `, now at branch ${step.index + 1}: guessed ${word(step.guess)}, was ${word(step.taken)}` : ''}`}
          />
          {sourceKind === 'pattern' ? (
            <div className="bp-pattern" ref={strip}>
              <BitStrip
                bits={pattern.map((b) => (b ? 1 : 0))}
                size="sm"
                onToggle={editPattern}
                ariaLabelOf={(k) => `outcome ${k + 1}: ${word(pattern[k])}`}
                toneOf={(k) => (pattern[k] ? 'hi' : 'muted')}
                groups={[{ from: 0, to: PATTERN_LENGTH - 1, tone: 'hi', label: 'your pattern (T = lit), repeated' }]}
              />
            </div>
          ) : (
            <Hint tone="muted" block>
              This stream is not an editable pattern. <ChipButton tone="info" onClick={() => { focusStrip.current = true; editPattern(0); }}>Edit as a pattern</ChipButton> starts from its first 16 outcomes.
            </Hint>
          )}
        </Box>

        <Box>
          <SectionTitle hint={kind === 'two-bit' ? 'four states, saturating' : kind === 'two-level' ? `${tableSize} counters, one per history` : undefined}>
            {kind === 'two-bit' ? 'The 2-bit counter' : kind === 'two-level' ? 'The history table' : PREDICTOR_LABELS[kind]}
          </SectionTitle>
          {kind === 'two-bit' && (
            <>
              <div className="bp-diagram">
                <GraphView
                  nodes={DIAGRAM_NODES}
                  edges={DIAGRAM_EDGES}
                  directed
                  width={DIAGRAM.width}
                  height={DIAGRAM.height}
                  nodeMark={(id) => (Number(id) === counterNow ? { tone: 'info', fill: 'tint' } : null)}
                  edgeMark={(e) => (edgeUsed(e) ? { tone: 'hi', width: 3.5 } : null)}
                  ariaLabel={`The 2-bit counter's four states; it is now in state ${counterNow}, ${COUNTER_NAMES[counterNow]}`}
                />
              </div>
              <Hint tone="muted" block>
                States 0 and 1 guess <b>not taken</b>, states 2 and 3 guess <b>taken</b>. T moves right, N moves left, and the ends stay put. Now: state {counterNow}, {COUNTER_NAMES[counterNow]}.
              </Hint>
            </>
          )}
          {kind === 'two-level' && tableState && (
            <CellGrid
              className="bp-table"
              rows={1}
              cols={tableSize}
              size={TABLE_CELL}
              cell={(_, c) => {
                const counter = tableState.table[c];
                return { text: counter, tone: counter >= 2 ? 'hi' : 'muted', fill: 'tint', intensity: 0.28 };
              }}
              colLabels={Array.from({ length: tableSize }, (_, c) => historyText(c, historyBits))}
              highlight={step ? [{ r: 0, c: step.before.history, tone: 'violet' }] : []}
              ariaLabel="The history table: each entry is a 2-bit counter picked by the last outcomes"
            />
          )}
          {(kind === 'static-taken' || kind === 'static-not-taken' || kind === 'one-bit') && (
            <Hint tone="muted" block>
              {kind === 'one-bit' ? 'One bit of memory: guess whatever the branch did last time. It has no hysteresis, so a single odd outcome flips the next guess.' : `No memory at all: this predictor always guesses ${kind === 'static-taken' ? 'taken' : 'not taken'}.`}
              {step ? ` It guessed ${word(step.guess)} at branch ${n(step.index + 1)}.` : ''}
            </Hint>
          )}
        </Box>

        <Box>
          <SectionTitle hint="same stream, every predictor, whole run">Which predictor wins here</SectionTitle>
          <div className="bp-compare">
            <table className="data-table">
              <thead>
                <tr><th>Predictor</th><th>Misses</th><th>Accuracy</th><th>Cycles</th></tr>
              </thead>
              <tbody>
                {compare.map((row) => (
                  <tr key={row.kind} className={row.kind === kind ? 'bp-row-on' : undefined}>
                    <td>{PREDICTOR_LABELS[row.kind]}</td>
                    <td>{n(row.misses)}</td>
                    <td>{pct(row.accuracy)}</td>
                    <td>{n(row.cycles)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Box>

        <Box>
          <SectionTitle hint="independent outcomes, 1,500 per point">Accuracy against p</SectionTitle>
          <Plot2D
            x={{ domain: [0, 1], label: 'probability taken, p', format: (v) => pct(v) }}
            y={{ domain: [0, 1], label: 'accuracy', format: (v) => pct(v) }}
            width={356}
            height={220}
            ariaLabel="Accuracy of each predictor against the probability that the branch is taken"
          >
            {curves.map((c) => <Curve key={c.kind} points={c.points} tone={CURVE_TONE[c.kind]} dashed={c.kind !== kind} />)}
          </Plot2D>
          <Legend items={PREDICTOR_KINDS.map((k) => ({ color: `var(--${CURVE_TONE[k]})`, label: PREDICTOR_LABELS[k] + (k === kind ? ' (solid)' : ''), shape: 'line' as const }))} />
        </Box>

        <ProvenanceRow>
          <Provenance kind="toy">textbook predictors, not what your CPU runs</Provenance>
          <Provenance kind="illustrative">miss penalty and branch frequency are chosen, not measured</Provenance>
          <Provenance kind="simulated" seed={LAB_SEED}>random streams are seeded; every count is model cycles</Provenance>
          <Provenance kind="from-memory">modern cores are reported to use history-based predictors (the TAGE family or perceptron-style), a branch target buffer and a return-address stack; the designs are mostly unpublished, so verify against Hennessy and Patterson and the vendor manuals</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
