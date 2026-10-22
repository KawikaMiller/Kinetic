import { useMemo, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { DEFAULT_TEXT, SURROGATE_NOTE, TEXT_MAX, distinctSubstrings, lcpKasai, longestRepeated, parseText, suffixArray } from './model';
import { TEXT_PRESETS } from './presets';
import { useField } from './useField';

/** Scene 2: the LCP column beside the sorted suffixes, the longest repeat it points at, and the count of distinct substrings. */
export function LcpScene({ picker }: { picker: ReactNode }) {
  const field = useField(parseText, DEFAULT_TEXT);
  const text = field.value;
  const n = text.length;
  const sa = useMemo(() => suffixArray(text), [text]);
  const lcp = useMemo(() => lcpKasai(text, sa), [text, sa]);
  const repeat = useMemo(() => longestRepeated(text, sa, lcp), [text, sa, lcp]);
  const sum = lcp.reduce((a, b) => a + b, 0);
  const pairs = (n * (n + 1)) / 2;
  const distinct = distinctSubstrings(n, lcp);

  return (
    <StageFrame
      height={440}
      intro={
        <>
          The LCP column holds, for each suffix, how many leading letters it shares with the suffix just above it. Its largest entry
          {repeat.length > 0 ? <> ({repeat.length}) marks the longest repeated substring, {repeat.text}.</> : <> is 0, so no substring of {text} occurs twice.</>}
        </>
      }
      introKey={`lcp|${text}`}
      stats={
        <Stats>
          <Stat label="Longest repeat" value={repeat.length > 0 ? repeat.text : 'none'} color="var(--ok)" sub={repeat.length > 0 ? `length ${repeat.length}, the maximum LCP` : 'the maximum LCP is 0'} />
          <Stat label="Distinct substrings" value={distinct} color="var(--info)" sub={`${pairs} start-and-length pairs, minus the LCP sum ${sum}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'letters shared with the suffix above (the LCP)', shape: 'square' },
            { color: 'var(--hi)', label: 'the maximum LCP', shape: 'square' },
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
          <Hint><span role="status">{field.error ?? (field.surrogates ? SURROGATE_NOTE : 'Pick a preset or type a text; the table recomputes.')}</span></Hint>
        </>,
      ]}
    >
      <div className="sa-stage stage-pad">
        <table className="sa-table">
          <caption className="sa-caption">The suffixes of {text} in sorted order</caption>
          <thead>
            <tr><th scope="col">SA</th><th scope="col">suffix</th><th scope="col">LCP</th></tr>
          </thead>
          <tbody>
            {sa.map((start, k) => (
              <tr key={start} className={k === repeat.at ? 'is-max' : ''}>
                <td>{start}</td>
                <td>
                  <code><span className="sa-shared">{text.slice(start, start + lcp[k])}</span>{text.slice(start + lcp[k])}</code>
                </td>
                <td>{lcp[k]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="sa-array">
          <span className="sa-rowlabel">LCP column</span>
          <ArrayStrip values={lcp} cellState={(k) => (k === repeat.at ? 'active' : 'idle')} showIndex fontSize={13} cellMax={44} />
        </div>
        <p className="sa-note">
          Distinct substrings: {n} x {n + 1} / 2 = {pairs} pairs of start and length, and the LCP column says {sum} of them repeat an earlier one: {pairs} - {sum} = {distinct}.
          The suffix array plus the LCP column is a suffix tree flattened into arrays; the tree itself is not built here.
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: the LCP column is computed from the sorted suffixes you see</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
