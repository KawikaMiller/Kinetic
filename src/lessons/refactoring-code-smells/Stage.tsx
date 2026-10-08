import { useRef, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { appliedCaption, smellCaption, unsafeCaption } from './frames';
import {
  CHARACTERIZATION, REFACTORS, SMELLS, callLine, diffRows, metrics, runCharacterization, smellLines, versionLines, type Applied, type RefactorId,
} from './model';
import './styles.css';

const ORIGINAL = versionLines(new Set());
const START = metrics(ORIGINAL);
const CODE_MIN_WIDTH = 460;

export function Stage() {
  const [applied, setApplied] = useState<Applied>(new Set());
  const [unsafe, setUnsafe] = useState(false);
  const [selected, setSelected] = useState<RefactorId | null>(null);
  const [before, setBefore] = useState<readonly string[]>(ORIGINAL);
  const setCaption = useSetCaption();
  const controlsRef = useRef<HTMLDivElement>(null);
  /** Applying removes the chip and the Apply button that had focus: move it to the next smell, or Reset. */
  const keepFocus = () => {
    if (!controlsRef.current?.contains(document.activeElement)) return;
    requestAnimationFrame(() => (controlsRef.current?.querySelector<HTMLButtonElement>('.chip-button') ?? document.querySelector<HTMLButtonElement>('.rf-reset'))?.focus());
  };
  useIntroCaption(<>A working but smelly pricing function, pinned by {CHARACTERIZATION.length} characterization tests. Pick a smell below, then apply its refactoring.</>);

  const lines = versionLines(applied, { unsafe });
  const rows = diffRows(before, lines);
  const smells = smellLines(applied, lines);
  const present = REFACTORS.filter((r) => smells[r]);
  const tests = runCharacterization(applied, { unsafe });
  const green = tests.every((t) => t.passed);
  const m = metrics(lines);
  const smellAt = new Map<number, RefactorId[]>();
  for (const r of present) for (const i of smells[r]!) smellAt.set(i, [...(smellAt.get(i) ?? []), r]);

  const apply = (r: RefactorId) => {
    const next = new Set(applied).add(r);
    const nextLines = versionLines(next, { unsafe });
    keepFocus();
    setBefore(lines);
    setApplied(next);
    setSelected(null);
    setCaption(appliedCaption(r, diffRows(lines, nextLines), runCharacterization(next, { unsafe }), unsafe));
  };
  const toggleUnsafe = () => {
    setBefore(lines);
    setUnsafe(!unsafe);
    setCaption(unsafeCaption(!unsafe, runCharacterization(applied, { unsafe: !unsafe })));
  };
  const reset = () => {
    setBefore(ORIGINAL);
    setApplied(new Set());
    setUnsafe(false);
    setSelected(null);
    setCaption(<>Back to the original code.</>);
  };
  const pick = (r: RefactorId) => {
    setSelected(r);
    setCaption(smellCaption(r));
  };

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Tests" value={`${tests.filter((t) => t.passed).length} / ${tests.length}`} color={green ? 'var(--ok)' : 'var(--bad)'} sub={green ? 'all green' : 'behaviour changed'} />
          <Stat label="Longest function" value={`${m.longestFunction} lines`} color="var(--muted)" sub={`was ${START.longestFunction}`} />
          <Stat label="Nesting depth" value={m.maxDepth} color="var(--muted)" sub={`was ${START.maxDepth}`} />
          <Stat label="Duplicated lines" value={m.duplicatedLines} color="var(--muted)" sub={`was ${START.duplicatedLines}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'smell (underline)', shape: 'line' },
            { color: 'var(--hi)', label: 'selected smell', shape: 'line' },
            { color: 'var(--info)', label: 'changed line' },
            { color: 'var(--bad)', label: 'removed line · red test' },
            { color: 'var(--ok)', label: 'tests green' },
          ]}
        />
      }
      controls={[
        <div key="picks" className="rf-picks" ref={controlsRef}>
          <ControlGroup label={present.length ? 'Smells left' : 'No smells left'}>
            {present.map((r) => (
              <ChipButton key={r} tone="orange" on={selected === r} onClick={() => pick(r)}>
                {SMELLS[r].smell}
              </ChipButton>
            ))}
          </ControlGroup>
          {selected && (
            <Button variant="primary" onClick={() => apply(selected)}>
              Apply: {SMELLS[selected].refactoring}
            </Button>
          )}
        </div>,
        <>
          <ChipButton tone="bad" className="rf-unsafe" on={unsafe} onClick={toggleUnsafe}>
            Unsafe edit: &quot;fix&quot; the tax rounding while tidying
          </ChipButton>
          <Button className="rf-reset" onClick={reset} disabled={!applied.size && !unsafe}>Reset</Button>
        </>,
      ]}
    >
      <div className="rf stage-pad">
        <WideRegion minWidth={CODE_MIN_WIDTH} label="Code: scroll sideways to see all of it">
          <CodePanel
            className="rf-code"
            title={`pricing.js · ${applied.size} of ${REFACTORS.length} refactorings applied${unsafe ? ' + the unsafe edit' : ''}`}
            lines={rows.map((x) => x.text)}
            stateOf={(i) => (rows[i].kind === 'added' ? 'next' : rows[i].kind === 'removed' ? 'bad' : 'idle')}
            gutter="none"
            renderLine={(text, i) => {
              const at = rows[i].at;
              const here = at === null ? [] : smellAt.get(at) ?? [];
              if (!here.length) return text;
              return <span className={`rf-smell ${selected && here.includes(selected) ? 'is-selected' : ''}`} title={here.map((r) => SMELLS[r].smell).join(', ')}>{text}</span>;
            }}
          />
        </WideRegion>
        <div className="rf-side">
          <div className={`rf-badge tone-${green ? 'ok' : 'bad'}`} role="status">
            {green ? '✓' : '✗'} {tests.filter((t) => t.passed).length} of {tests.length} characterization tests pass
          </div>
          <ConsolePanel
            title="characterization tests"
            lines={tests.map((t) => (t.passed ? `✓ ${t.name}` : { text: `✗ ${t.name}: expected ${t.expected}, got ${t.actual}`, tone: 'bad' as const }))}
          />
          <SectionTitle>The tests call it as</SectionTitle>
          <code className="rf-call">{callLine(applied)}</code>
          <Hint block>
            The code versions are pre-written; the tests really run against each one (and Vitest runs all 64 combinations through these
            tests and 500 random orders). Changing a function&apos;s signature changes how the tests call it, never what they expect.
          </Hint>
        </div>
      </div>
    </StageFrame>
  );
}
