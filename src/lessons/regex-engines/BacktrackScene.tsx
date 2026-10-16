import { useMemo, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CodePanel } from '../../components/CodePanel';
import { LogStream } from '../../components/LogStream';
import { Plot2D, Curve, Points } from '../../components/Plot2D';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { matchAt } from './backtrack';
import { STEP_BUDGET, runNfa, workSeries } from './engines';
import { TRACE_LIMIT, finalText, traceFrames } from './frames';
import { BACKTRACK_PRESETS, OPENING } from './opening';
import { PresetChips, RegexFields } from './RegexFields';
import { nodeText, nodesInOrder } from './regexParse';
import { buildNfa } from './thompson';
import { useRegexInput } from './useRegexInput';

const TRACE_INTERVAL_MS = 350;
const PLOT_WIDTH = 356;
const PLOT_HEIGHT = 200;
const LOG_ROWS = 12;
const LOG_HEIGHT = 190;

/** The matcher's recursion in words: the line lit follows what the attempt on show did. */
const MATCHER = [
  'attempt(node, pos):',
  '  count one step; stop at the budget',
  '  try the node at this position',
  '  it fits? go on with the rest of the pattern',
  '  the rest failed? undo and return false: back up',
  '  the whole pattern matched? return true',
];
const LINE_COUNT = 1;
const LINE_FAILED = 4;
const LINE_MATCHED = 5;

const num = (v: number) => v.toLocaleString('en-US');

/** Scene 4: the same pattern run by a backtracking matcher, step by step, beside the NFA's work. */
export function BacktrackScene({ picker }: { picker: ReactNode }) {
  const input = useRegexInput(OPENING.backtrack.pattern, OPENING.backtrack.subject, { automaton: false });
  const { parsed, subject } = input;
  const built = useMemo(() => buildNfa(parsed), [parsed]);
  const result = useMemo(() => matchAt(parsed.root, subject, 0, { budget: STEP_BUDGET, mustEnd: true, traceLimit: TRACE_LIMIT }), [parsed, subject]);
  const nfaWork = useMemo(() => (built.ok ? runNfa(built.value, subject, 'full').work : null), [built, subject]);
  const series = useMemo(() => workSeries(parsed, built.ok ? built.value : null, subject), [parsed, built, subject]);
  const frames = useMemo(() => traceFrames(parsed, result, subject), [parsed, result, subject]);
  const player = usePlayer(frames, { interval: TRACE_INTERVAL_MS, autoplayOnChange: false });
  const f = player.frame;
  const byId = useMemo(() => new Map(nodesInOrder(parsed.root).map((n) => [n.id, n])), [parsed]);
  const event = f.at >= 0 ? result.trace[f.at] : null;
  const rows = useMemo(
    () =>
      result.trace.slice(0, f.at + 1).map((e) => ({
        id: e.step,
        tone: e.ok === null ? undefined : e.ok ? ('ok' as const) : ('bad' as const),
        text: `step ${e.step}: ${nodeText(byId.get(e.node)!)} at ${e.pos}: ${e.ok === null ? 'still running when the budget ran out' : e.ok ? 'went on to match' : 'failed, backed up'}`,
      })),
    [result.trace, f.at, byId],
  );
  const exhausted = result.status === 'budget';
  const line = event === null ? null : event.ok === null ? LINE_COUNT : event.ok ? LINE_MATCHED : LINE_FAILED;
  const n = subject.length;
  const backtrackingCurve = series.map((p) => [p.n, Math.max(1, p.backtracking)] as const);
  const nfaCurve = series.flatMap((p) => (p.nfa === null ? [] : [[p.n, Math.max(1, p.nfa)] as const]));

  return (
    <StageFrame
      player={player}
      height={440}
      stats={
        <Stats>
          <Stat
            label="Backtracking steps"
            value={exhausted ? 'did not finish' : num(result.steps)}
            color={exhausted ? 'var(--orange)' : 'var(--bad)'}
            sub={exhausted ? `within ${num(STEP_BUDGET)} steps` : 'attempts of a node at a position'}
          />
          <Stat
            label="NFA work"
            value={nfaWork === null ? 'refused' : num(nfaWork)}
            color={nfaWork === null ? 'var(--muted)' : 'var(--info)'}
            sub={nfaWork === null ? 'a back-reference needs memory an automaton does not have' : 'state-reads, same pattern and subject'}
          />
          <Stat
            label="Result"
            value={result.status === 'budget' ? 'unknown' : result.status === 'match' ? 'full match' : 'no full match'}
            color={result.status === 'budget' ? 'var(--orange)' : result.status === 'match' ? 'var(--ok)' : 'var(--muted)'}
            sub={result.status === 'budget' ? 'the matcher gave up' : 'the whole subject, as ^(...)$'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'attempt failed, matcher backed up', shape: 'square' },
            { color: 'var(--ok)', label: 'attempt went on to match', shape: 'square' },
            { color: 'var(--orange)', label: 'step budget exhausted', shape: 'square' },
            { color: 'var(--info)', label: 'NFA work', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips presets={BACKTRACK_PRESETS} input={input} />
        </>,
        <>
          <RegexFields input={input} />
        </>,
      ]}
    >
      <div className="re-stage stage-pad">
        <div className="re-strip">
          <SectionTitle>Subject</SectionTitle>
          {n ? (
            <ArrayStrip values={subject} cellMax={44} cellState={(i) => (event && i === event.pos ? 'active' : 'idle')} />
          ) : (
            <p className="empty-note">the empty subject</p>
          )}
          {event && event.pos >= n ? <p className="re-note">The attempt on show is at the end of the subject.</p> : null}
        </div>
        <div className="re-two">
          <CodePanel title="How the matcher recurses" lines={MATCHER} active={line === null ? [] : [line]} />
          <LogStream label="Attempts so far" rows={rows} max={LOG_ROWS} maxHeight={LOG_HEIGHT} follow live="off" empty="No attempts yet. Press play." />
        </div>
        <p className="re-note" role="status">
          {finalText(result)}
          {result.traceTruncated ? ` The player steps through the first ${TRACE_LIMIT} of ${num(result.steps)} steps.` : ''}
        </p>
        <div className="re-plot">
          <SectionTitle>Work as the subject grows (each prefix of the subject)</SectionTitle>
          <Plot2D
            x={{ domain: [0, Math.max(1, n)], label: 'subject length' }}
            y={{ domain: [1, STEP_BUDGET], log: true, ticks: 5, label: 'steps' }}
            width={PLOT_WIDTH}
            height={PLOT_HEIGHT}
            ariaLabel={`Work against subject length for ${parsed.source}: backtracking reaches ${num(series[series.length - 1].backtracking)} steps at length ${n}${nfaWork === null ? '' : `, the NFA ${num(nfaWork)}`}`}
          >
            <Curve points={backtrackingCurve} tone="bad" />
            {nfaCurve.length ? <Curve points={nfaCurve} tone="info" /> : null}
            <Points data={series.filter((p) => p.exhausted).map((p) => ({ x: p.n, y: STEP_BUDGET, tone: 'orange' as const }))} />
          </Plot2D>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">step counts are this lesson's matcher's, not a measurement of any real engine</Provenance>
        <Provenance kind="from-memory">RE2, Go's regexp and Rust's regex crate use automata and avoid back-references; PCRE, Java, Python and JavaScript's default engine backtrack; V8 also has an experimental non-backtracking engine behind a flag: check each project's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
