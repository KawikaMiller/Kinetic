import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { DEFAULT_TEXT, SURROGATE_NOTE, TEXT_MAX, brokenReport, checkOrder, moveItem, parseText, suffixArray, type PrefixRule } from './model';
import { TEXT_PRESETS } from './presets';
import { useField } from './useField';

const RULE_OPTIONS: { value: PrefixRule; label: string }[] = [
  { value: 'correct', label: 'Correct: ends first, sorts first' },
  { value: 'inverted', label: 'Inverted (broken)' },
];

const identity = (n: number) => Array.from({ length: n }, (_, i) => i);
const percent = (part: number, whole: number) => `${((part / whole) * 100).toFixed(1)}%`;

interface Checked {
  key: string;
  ok: boolean;
  text: string;
  /** The pair the check named, as positions in the learner's list. */
  pair: readonly [number, number] | null;
}

/** The witness panel of the broken mode: the smallest input the inverted rule gets wrong, and how often it fails over all binary strings. */
function WitnessPanel() {
  const report = useMemo(() => brokenReport(), []);
  return (
    <div className="sa-witness" role="note">
      <b>Shortest witness: {report.witness}.</b> Its suffixes are {report.witness} (position 0) and {report.witness.slice(1)} (position 1). The correct
      suffix array is [{report.correct.join(', ')}] because {report.witness.slice(1)} is a prefix of {report.witness} and ends first, so it sorts first.
      The inverted rule gives [{report.broken.join(', ')}]. It is wrong on {report.wrong.toLocaleString('en-US')} of {report.checked.toLocaleString('en-US')} strings over a and b up to
      length 10 ({percent(report.wrong, report.checked)}), which is too many for a rate to teach anything, so this smallest case is the lesson.
    </div>
  );
}

/** Scene 1: sort the suffixes by hand with move buttons, and let the page name the first pair that is out of order. */
export function SortScene({ picker }: { picker: ReactNode }) {
  const field = useField(parseText, DEFAULT_TEXT);
  const text = field.value;
  const [rule, setRule] = useState<PrefixRule>('correct');
  const [moved, setMoved] = useState<{ text: string; order: number[] }>({ text, order: identity(text.length) });
  const [checked, setChecked] = useState<Checked | null>(null);
  const order = moved.text === text ? moved.order : identity(text.length);
  const key = `${text}|${order.join()}|${rule}`;
  const shownCheck = checked?.key === key ? checked : null;
  const truth = useMemo(() => suffixArray(text, rule), [text, rule]);
  const isSorted = order.join() === truth.join();

  const move = (from: number, dir: -1 | 1) => setMoved({ text, order: moveItem(order, from, dir) });
  const check = () => {
    const verdict = checkOrder(text, order, rule);
    setChecked(
      verdict
        ? { key, ok: false, text: verdict.reason, pair: [verdict.k, verdict.k + 1] }
        : { key, ok: true, text: `The order is right: ${text.length} suffixes, each one before the next.`, pair: null },
    );
  };
  const reveal = () => {
    setMoved({ text, order: truth });
    setChecked({ key: `${text}|${truth.join()}|${rule}`, ok: true, text: 'Sorted for you: the start positions in this order are the suffix array.', pair: null });
  };

  const showSa = shownCheck?.ok === true && isSorted;
  const inPair = (i: number) => shownCheck?.pair?.includes(i) ?? false;

  return (
    <StageFrame
      height={420}
      intro={<>Reorder the {text.length} suffixes of {text} so they read in dictionary order, then press Check order. A suffix is the text from one start position to the end.</>}
      introKey={`sort|${text}|${rule}`}
      stats={
        <Stats>
          <Stat label="Suffixes" value={text.length} color="var(--info)" sub={`of ${text}`} />
          <Stat label="In place" value={isSorted ? 'sorted' : 'not yet'} color={isSorted ? 'var(--ok)' : 'var(--dim)'} sub={rule === 'correct' ? 'prefix rule: ends first, sorts first' : 'prefix rule inverted'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the first pair out of order', shape: 'square' },
            { color: 'var(--ok)', label: 'suffix array confirmed', shape: 'square' },
            { color: 'var(--info)', label: 'start position in the text', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label={`Text (1 to ${TEXT_MAX})`} value={field.draft} onChange={field.set} maxLength={TEXT_MAX} width={170} spellCheck={false} />
          {TEXT_PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={text === p} onClick={() => field.set(p)}>{p}</ChipButton>
          ))}
        </>,
        <>
          <Toggle label="Prefix rule" value={rule === 'inverted'} onChange={(inverted) => setRule(inverted ? 'inverted' : 'correct')} off={RULE_OPTIONS[0].label} on={RULE_OPTIONS[1].label} />
          <Button variant="primary" onClick={check}>Check order</Button>
          <Button onClick={reveal}>Sort for me</Button>
          <Hint>
            <span role="status">{field.error ?? (field.surrogates ? SURROGATE_NOTE : shownCheck?.text ?? 'Strings are compared by UTF-16 code unit.')}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="sa-stage stage-pad">
        <ol className="sa-list" aria-label={`Suffixes of ${text}, in the order you have placed them`}>
          {order.map((start, i) => (
            <li key={start} className={`sa-row${inPair(i) ? ' is-bad' : ''}${showSa ? ' is-ok' : ''}`}>
              <span className="sa-pos" title="start position in the text">{start}</span>
              <code className="sa-suffix">{text.slice(start)}</code>
              <span className="sa-moves">
                <Button softDisabled={i === 0} aria-label={`Move suffix ${text.slice(start)} up`} onClick={() => move(i, -1)}>Up</Button>
                <Button softDisabled={i === order.length - 1} aria-label={`Move suffix ${text.slice(start)} down`} onClick={() => move(i, 1)}>Down</Button>
              </span>
            </li>
          ))}
        </ol>
        {showSa && (
          <div className="sa-array">
            <span className="sa-rowlabel">suffix array SA</span>
            <ArrayStrip values={truth} cellState={() => 'done'} showIndex fontSize={13} cellMax={44} />
          </div>
        )}
        {rule === 'inverted' && <WitnessPanel />}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: the order is checked by a real comparison of the suffixes you see</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
