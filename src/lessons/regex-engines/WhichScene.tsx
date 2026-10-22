import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { whichCaption } from './captions';
import { STEP_BUDGET, whichAnswer } from './engines';
import { runNfa, constructionOf, placeNfa } from '../../core/regex';
import { NfaDrawing } from './NfaDrawing';
import { OPENING, type WhichRule } from './opening';
import { PresetChips, RegexFields } from './RegexFields';
import { realResultFor, WHICH_EXAMPLES } from './realExamples';
import { useRegexInput } from './useRegexInput';

const WHOLE_MACHINE = Number.MAX_SAFE_INTEGER;
const RULES: { value: WhichRule; label: string }[] = [
  { value: 'first', label: 'Leftmost-first (backtracking)' },
  { value: 'longest', label: 'Longest (POSIX)' },
];

/** Scene 3: one machine, two rules for choosing among the matches it allows. */
export function WhichScene({ picker }: { picker: ReactNode }) {
  const input = useRegexInput(OPENING.which.pattern, OPENING.which.subject, { automaton: true });
  const [rule, setRule] = useState<WhichRule>(OPENING.which.rule);
  const c = useMemo(() => constructionOf(input.parsed), [input.parsed]);
  const placement = useMemo(() => placeNfa(c), [c]);
  const answer = useMemo(() => whichAnswer(c, input.parsed, input.subject), [c, input.parsed, input.subject]);
  const chosen = answer[rule];
  const real = realResultFor(input.patternText, input.subjectText);
  const textOf = (span: { start: number; end: number } | null) => (span ? input.subject.slice(span.start, span.end).join('') : null);
  const lit = useMemo(() => {
    if (!chosen) return new Set<string>();
    return new Set(runNfa(c, input.subject.slice(chosen.start), 'full').sets[chosen.end - chosen.start]);
  }, [c, input.subject, chosen]);
  const inSpan = (i: number) => chosen !== null && i >= chosen.start && i < chosen.end;

  return (
    <StageFrame
      height={420}
      intro={whichCaption(input.parsed.source, input.subject.join(''), answer, rule)}
      introKey={`${input.parsed.source}|${input.subject.join('')}|${rule}`}
      stats={
        <Stats>
          <Stat
            label="Leftmost-first"
            value={answer.firstExhausted ? 'gave up' : describeSpan(textOf(answer.first))}
            color={answer.firstExhausted ? 'var(--orange)' : rule === 'first' ? 'var(--hi)' : 'var(--muted)'}
            sub={answer.firstExhausted ? `did not finish within ${STEP_BUDGET.toLocaleString('en-US')} steps` : 'alternatives tried in order'}
          />
          <Stat label="Longest" value={describeSpan(textOf(answer.longest))} color={rule === 'longest' ? 'var(--hi)' : 'var(--muted)'} sub="of every end the NFA allows" />
          <Stat label="Ends allowed" value={answer.ends.length ? answer.ends.join(', ') : 'none'} color="var(--info)" sub="end positions of accepting runs" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'rule now in use', shape: 'square' },
            { color: 'var(--ok)', label: 'matched characters / accepting state lit', shape: 'square' },
            { color: 'var(--orange)', label: 'backtracker gave up (step budget)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips presets={WHICH_EXAMPLES} input={input} />
          <Segmented label="Rule" value={rule} onChange={setRule} options={RULES} />
        </>,
        <>
          <RegexFields input={input} />
        </>,
      ]}
    >
      <div className="re-stage stage-pad">
        <NfaDrawing
          construction={c}
          placement={placement}
          visibleTo={WHOLE_MACHINE}
          lit={lit}
          ends
          ariaLabel={`NFA for ${input.parsed.source}${chosen ? ` at the end of the ${rule === 'first' ? 'leftmost-first' : 'longest'} match` : ', no match'}`}
        />
        <div className="re-strip">
          <SectionTitle>Subject</SectionTitle>
          {input.subject.length ? (
            <ArrayStrip values={input.subject} cellMax={44} cellState={(i) => (inSpan(i) ? 'done' : 'idle')} />
          ) : (
            <p className="empty-note">the empty subject</p>
          )}
        </div>
        <p className="re-note">
          The NFA does not prefer: it reports every end it can reach. A backtracking engine picks the first success in its own order, so <code>a|ab</code> returns the shorter match when <code>a</code> is listed first. A POSIX engine picks the longest. A lazy quantifier such as <code>a*?</code> only flips the preference order; it describes the same language.
        </p>
      </div>
      <ProvenanceRow>
          {real !== undefined ? (
            <Provenance kind="real">this browser's RegExp on this fixed example returned {real ? `"${real.text}" at ${real.index}` : 'no match'}</Provenance>
          ) : (
            <Provenance kind="not-run">the browser's RegExp is compared only on the four preset pairs; nothing you type is handed to it</Provenance>
          )}
          <Provenance kind="toy">leftmost-first comes from this lesson's backtracker, longest from its NFA run</Provenance>
          <Provenance kind="from-memory">PCRE, Java, Python and JavaScript backtrack; POSIX regcomp rules say longest: check each engine's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}

const describeSpan = (text: string | null) => (text === null ? 'no match' : text === '' ? 'empty match' : `"${text}"`);
