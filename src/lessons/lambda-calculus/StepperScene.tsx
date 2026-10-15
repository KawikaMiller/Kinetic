import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { stepperCaption } from './captions';
import { CAPTURE_PRESETS, STEPPER_PRESETS } from './presets';
import { BUDGET_RANGE, nextRedex, redexPaths, type Mode, type Strategy } from './reduce';
import { TermText, type Mark } from './TermText';
import { TermTree } from './TermTree';
import { getAt, LIMITS, NAMED_SOURCE, print, termSize, type NamedId, type Path } from './term';
import { useStepper } from './useStepper';

const CHIPS: readonly NamedId[] = ['true', 'false', 'if', 'and', 'not', 'succ', 'add', 'mul', 'Ω', 'Y'];
const MAX_REDEX_CHIPS = 12;
const REDEX_LABEL_CHARS = 36;
const DEFAULT_BUDGET = 50;
const STRATEGIES = [
  { value: 'normal', label: 'Normal order' },
  { value: 'applicative', label: 'Applicative order' },
] as const;

/** Scenes 1 and 2: click a redex (or step by a strategy) and watch the substitution; the capture scene adds the labelled-wrong naive mode. */
export function StepperScene({ picker, capture }: { picker: ReactNode; capture: boolean }) {
  const setCaption = useSetCaption();
  const presets = capture ? CAPTURE_PRESETS : STEPPER_PRESETS;
  const s = useStepper(presets[0].text);
  const [strategy, setStrategy] = useState<Strategy>('normal');
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [naive, setNaive] = useState(false);
  // The naive toggle exists only on the capture scene; elsewhere substitution is always the safe one.
  const mode: Mode = capture && naive ? 'naive' : 'safe';

  const { current, terms, last, note } = s;
  const redexes = useMemo(() => redexPaths(current), [current]);
  const next = useMemo(() => nextRedex(current, strategy), [current, strategy]);

  useEffect(() => {
    setCaption(stepperCaption({ terms, current, last, note }), { quiet: true });
  }, [setCaption, terms, current, last, note]);

  const nowMarks: Mark[] = [
    ...(next !== null ? [{ paths: [next], kind: 'next' as const }] : []),
    { paths: redexes, kind: 'redex' as const },
  ];
  const before: Mark[] = last
    ? [{ paths: [`${last.redex}a`], kind: 'arg' }, { paths: last.occurrences, kind: 'occ' }]
    : [];
  const after: Mark[] = last ? [{ paths: last.replaced, kind: last.captured ? 'bad' : 'repl' }] : [];
  const renamed = last?.renames.map((r) => r.to) ?? [];
  const insert = (id: NamedId) => s.setText(`${s.text}${s.text.trim() ? ' ' : ''}(${NAMED_SOURCE[id]})`);

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Steps taken" value={s.terms.length - 1} />
          <Stat label="Redexes now" value={redexes.length} color={redexes.length === 0 ? 'var(--ok)' : undefined} sub={redexes.length === 0 ? 'a normal form' : undefined} />
          <Stat label="Nodes" value={termSize(s.current)} sub={`limit ${LIMITS.maxNodes} typed, 2,000 while reducing`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the redex about to reduce', shape: 'square' },
            { color: 'var(--info)', label: 'the argument; other redexes underlined', shape: 'square' },
            { color: 'var(--ok)', label: 'the places x is replaced', shape: 'square' },
            { color: 'var(--orange)', label: 'a renamed variable', shape: 'square' },
            { color: 'var(--bad)', label: 'a captured variable', shape: 'square' },
            { color: 'var(--muted)', label: 'a free variable', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Term" inline>
            {presets.map((p) => (
              <ChipButton key={p.label} tone="violet" on={s.text === p.text} onClick={() => s.setText(p.text)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <TextField label="Type a term" value={s.text} onChange={s.setText} width={300} spellCheck={false} ariaLabel="Lambda term" />
          {s.error && <Hint tone="muted"><span role="alert">{s.error} Still showing the last term that parsed.</span></Hint>}
        </>,
        <>
          <Segmented label="Strategy" value={strategy} onChange={setStrategy} options={[...STRATEGIES]} />
          <Button onClick={() => s.stepBy(strategy, mode)}>Step</Button>
          <Button variant="primary" onClick={() => s.runBy(strategy, budget, mode)}>Run to normal form</Button>
          <Button onClick={s.reset}>Reset</Button>
          <Slider label="Step budget" value={budget} min={BUDGET_RANGE.min} max={BUDGET_RANGE.max} onChange={setBudget} />
          {capture && <Toggle label="Substitution" value={naive} onChange={setNaive} off="Capture-avoiding" on="Naive (wrong)" />}
        </>,
        ...(capture ? [] : [<><ControlGroup label="Insert a named term, shown expanded" inline>{CHIPS.map((id) => <ChipButton key={id} tone="info" onClick={() => insert(id)}>{id}</ChipButton>)}</ControlGroup></>]),
      ]}
    >
      <div className="ld stage-pad">
        <Box variant="sunken">
          <SectionTitle hint="underlined = a redex you can click">The term now</SectionTitle>
          <TermText term={s.current} marks={nowMarks} renamed={renamed} ariaLabel={print(s.current)} />
        </Box>
        <TermTree term={s.current} next={next} redexes={redexes} onPick={(path: Path) => s.reduceAt(path, mode)} />
        <div className="ld-redex-list" role="group" aria-label="Redexes you can reduce">
          {redexes.slice(0, MAX_REDEX_CHIPS).map((p, i) => {
            const text = print(getAt(s.current, p));
            return (
              <ChipButton key={p} tone="info" title={text} on={p === next} onClick={() => s.reduceAt(p, mode)}>
                {i + 1}: {text.length > REDEX_LABEL_CHARS ? `${text.slice(0, REDEX_LABEL_CHARS)}…` : text}
              </ChipButton>
            );
          })}
          {redexes.length > MAX_REDEX_CHIPS && <Hint tone="muted">and {redexes.length - MAX_REDEX_CHIPS} more: use the tree</Hint>}
        </div>
        {last && (
          <Box>
            <SectionTitle hint={last.mode === 'naive' ? 'naive substitution, labelled wrong' : 'the step just taken'}>Before and after</SectionTitle>
            <div className="ld-before-after">
              <TermText term={last.before} marks={before} />
              <span aria-hidden="true">→</span>
              <TermText term={last.after} marks={after} renamed={renamed} />
            </div>
          </Box>
        )}
        <ConsolePanel title="history" lines={s.terms.slice(-8).map((t, i, all) => `${s.terms.length - all.length + i}: ${print(t)}`)} empty="no steps yet" preserveWhitespace />
        <ProvenanceRow>
          <Provenance kind="toy">the untyped calculus on named terms; terms and results come from this page’s own reducer, checked in tests against a second one that uses de Bruijn indices</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
