import { useRef, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { lineDiff } from '../../core/lineDiff';
import { changeVerdict, doneCaption, moveCaption } from './frames';
import {
  CODE, DONE, KATA_START, STEPS, applyMove, changeCode, changeTests, coverage, runTests, shownCode, shownTests, stepAt, testLine, undoMove, wheelPhase,
  type ChangeKind, type KataState, type Move, type Phase, type TestId, type TestResult, type VersionId,
} from './model';
import './styles.css';

type Scene = 'kata' | 'change';
const SCENES = [
  { value: 'kata' as const, label: 'Kata' },
  { value: 'change' as const, label: 'Change request' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'kata' });
  return scene === 'kata' ? <KataScene picker={picker} /> : <ChangeScene picker={picker} />;
}

// ── Shared pieces ───────────────────────────────────────────────────

const PHASES: { id: Phase; label: string; tone: string }[] = [
  { id: 'red', label: 'Red', tone: 'bad' },
  { id: 'green', label: 'Green', tone: 'ok' },
  { id: 'refactor', label: 'Refactor', tone: 'info' },
];
const WHEEL = 150;
const R_OUT = 66;
const R_IN = 40;
const GAP_DEG = 4;

function arcPath(from: number, to: number): string {
  const c = WHEEL / 2;
  const pt = (r: number, deg: number) => {
    const a = ((deg - 90) * Math.PI) / 180;
    return `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  };
  return `M ${pt(R_OUT, from)} A ${R_OUT} ${R_OUT} 0 0 1 ${pt(R_OUT, to)} L ${pt(R_IN, to)} A ${R_IN} ${R_IN} 0 0 0 ${pt(R_IN, from)} Z`;
}

/** Three arcs; the current phase is full colour with a --hi ring, the others faded. */
function Wheel({ phase }: { phase: Phase }) {
  return (
    <svg className="tdd-wheel" viewBox={`0 0 ${WHEEL} ${WHEEL}`} role="img" aria-label={`Phase: ${phase}`}>
      {PHASES.map((p, i) => {
        const d = arcPath(i * 120 + GAP_DEG / 2, (i + 1) * 120 - GAP_DEG / 2);
        const on = p.id === phase;
        return (
          <g key={p.id} className={`tone-${p.tone} tdd-arc ${on ? 'is-on' : ''}`}>
            <path d={d} />
            {on && <path d={d} className="tdd-ring" />}
          </g>
        );
      })}
      <text x={WHEEL / 2} y={WHEEL / 2 + 5} textAnchor="middle" className="tdd-wheel-text">{PHASES.find((p) => p.id === phase)!.label}</text>
    </svg>
  );
}

function TestList({ results, title = 'Tests' }: { results: readonly TestResult[]; title?: string }) {
  return (
    <div className="tdd-tests">
      <SectionTitle hint={results.length ? `${results.filter((r) => r.passed).length}/${results.length} green` : undefined}>{title}</SectionTitle>
      {results.length === 0 ? (
        <p className="empty-note">no tests yet</p>
      ) : (
        <ul>
          {results.map((r) => (
            <li key={r.id} className={`tone-${r.passed ? 'ok' : 'bad'}`}>
              <span aria-hidden="true">{r.passed ? '✓' : '✗'}</span> <code>{testLine(r.id)}</code>
              {!r.passed && <span className="tdd-got"> got {r.actual}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Code({ v, before, title }: { v: VersionId; before: VersionId | null; title: string }) {
  const changed = before === null ? new Set<number>() : lineDiff(CODE[before], CODE[v]).added;
  return <CodePanel title={title} lines={CODE[v]} stateOf={(i) => (changed.has(i) ? 'now' : 'idle')} />;
}

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--bad)', label: 'red phase / failing test' },
      { color: 'var(--ok)', label: 'green phase / passing test' },
      { color: 'var(--info)', label: 'refactor phase' },
      { color: 'var(--hi)', label: 'current phase ring · changed line' },
      { color: 'var(--orange)', label: 'untested behaviour' },
    ]}
  />
);

// ── Kata ────────────────────────────────────────────────────────────

/** Move order varies per step so the good one isn't always first. */
const ordered = (moves: readonly Move[], step: number) => moves.map((_, i) => moves[(i + step) % moves.length]);

function KataScene({ picker }: { picker: ReactNode }) {
  const [k, setK] = useState<KataState>(KATA_START);
  const setCaption = useSetCaption();
  const movesRef = useRef<HTMLDivElement>(null);
  /** The pressed move button is replaced by the next step's: keep keyboard focus in the move list. */
  const keepFocus = () => {
    if (!movesRef.current?.contains(document.activeElement)) return;
    requestAnimationFrame(() => movesRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
  };
  useIntroCaption(<>FizzBuzz, test first: 3 → Fizz, 5 → Buzz, 15 → FizzBuzz, anything else its number. Pick the next move below.</>);

  const at = stepAt(k);
  const code = shownCode(k);
  const tests = shownTests(k);
  const results = runTests(code, tests);
  const cov = coverage(code, tests);
  const phase = wheelPhase(results, k.bad ? k.bad.kind : k.lastKind);
  const done = k.step >= STEPS.length;
  const { step, bad, prevCode, cycles, inCycle } = k;

  const move = (m: Move) => {
    const next = applyMove(k, m);
    keepFocus();
    setK(next);
    setCaption(next.step >= STEPS.length ? doneCaption(runTests(DONE.code, DONE.tests)) : moveCaption(m, runTests(m.code, m.tests), coverage(m.code, m.tests).untested));
  };
  const undo = () => {
    keepFocus();
    setK(undoMove(k));
    setCaption(<>Undone: back to {plural(at.tests.length, 'test')} and the code as it was.</>);
  };
  const restart = () => {
    keepFocus();
    setK(KATA_START);
    setCaption(<>Back to an empty file.</>);
  };

  return (
    <StageFrame
      height={430}
      stats={
        <Stats>
          <Stat label="Step" value={`${Math.min(step + 1, STEPS.length)} / ${STEPS.length}`} />
          <Stat label="Cycle lengths" value={cycles.length ? cycles.join(', ') : '–'} color="var(--ok)" sub="moves from red to green" />
          <Stat label="Untested behaviour" value={cov.untested.length} color={cov.untested.length ? 'var(--orange)' : 'var(--muted)'} sub={`of ${cov.implemented.length} the code does`} />
        </Stats>
      }
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Button onClick={restart} disabled={step === 0 && !bad}>Start over</Button>
        </>,
      ]}
    >
      <div className="tdd stage-pad">
        <div className="tdd-left">
          <Wheel phase={phase} />
          <div className="tdd-moves" ref={movesRef}>
            <SectionTitle>{done ? 'Done' : bad ? 'That move cost you' : 'Next move'}</SectionTitle>
            {done ? (
              <Button onClick={restart}>Play it again</Button>
            ) : bad ? (
              <Button variant="primary" onClick={undo}>Undo that move</Button>
            ) : (
              ordered(at.moves, step).map((m) => (
                <ChipButton key={m.label} tone="violet" size="md" onClick={() => move(m)}>
                  {m.label}
                </ChipButton>
              ))
            )}
            {inCycle !== null && <Hint>This red-to-green cycle: {plural(inCycle, 'move')} so far.</Hint>}
          </div>
        </div>
        <div className="tdd-panels">
          <Code v={code} before={prevCode} title="fizzbuzz.js" />
          <div className="tdd-side">
            <TestList results={results} />
            {cov.untested.length > 0 && (
              <div className="tdd-flags">
                {cov.untested.map((b) => <span key={b} className="chip tone-orange">untested: {b}</span>)}
              </div>
            )}
          </div>
        </div>
        <Hint block>A scripted kata: the code versions are pre-written, but the tests really run against them (and untested behaviour is found by running each version for n = 1 to 105).</Hint>
      </div>
    </StageFrame>
  );
}

// ── Change request ─────────────────────────────────────────────────

const CHANGES: { value: ChangeKind; label: string }[] = [
  { value: 'none', label: 'Before the change' },
  { value: 'careless', label: 'A careless slip' },
  { value: 'careful', label: 'A careful change' },
];

function ChangeScene({ picker }: { picker: ReactNode }) {
  const [change, setChange] = useState<ChangeKind>('none');
  const setCaption = useSetCaption();
  const sides = (['tdd', 'after'] as const).map((side) => {
    const v = changeCode(side, change);
    const tests: readonly TestId[] = changeTests(side, change);
    return { side, v, results: runTests(v, tests), name: side === 'tdd' ? 'TDD codebase' : 'Test-after codebase' };
  });
  const verdicts = sides.map((s) => changeVerdict(s.name, s.v, s.results, change));
  useIntroCaption(<>New requirement: multiples of 7 say Bazz (21 → FizzBazz). Both codebases start correct. Apply a change to both.</>);

  const pick = (c: ChangeKind) => {
    setChange(c);
    const now = (['tdd', 'after'] as const).map((side) => {
      const v = changeCode(side, c);
      return changeVerdict(side === 'tdd' ? 'TDD codebase' : 'Test-after codebase', v, runTests(v, changeTests(side, c)), c);
    });
    setCaption(<>{now[0]} {now[1]}</>);
  };

  return (
    <StageFrame
      height={430}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Segmented label="Apply to both" value={change} onChange={pick} options={CHANGES} />
        </>,
      ]}
    >
      <div className="tdd stage-pad">
        <div className="tdd-compare">
          {sides.map((s, i) => (
            <div key={s.side} className="tdd-col">
              <Code v={s.v} before={change === 'none' ? null : changeCode(s.side, 'none')} title={s.name} />
              <TestList results={s.results} title={s.side === 'tdd' ? 'Its tests (each written first)' : 'Its tests (written after, 15 missed)'} />
              <p className="tdd-verdict">{verdicts[i]}</p>
            </div>
          ))}
        </div>
        <Hint block>
          The gap is the lesson, not TDD magic: a test-after suite that had a 15 test would catch the slip too. Writing each test first just
          means no behaviour gets in without one. Code versions are pre-written; the tests really run against them.
        </Hint>
      </div>
    </StageFrame>
  );
}
