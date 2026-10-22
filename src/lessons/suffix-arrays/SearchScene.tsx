import { useMemo, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { DEFAULT_TEXT, EMPTY_PATTERN_MESSAGE, PATTERN_MAX, SURROGATE_NOTE, parsePattern, search, suffixArray, type Bound } from './model';
import { PATTERN_PRESETS } from './presets';
import { useField } from './useField';

function ProbeTable({ title, bound, text, pattern }: { title: string; bound: Bound; text: string; pattern: string }) {
  return (
    <table className="sa-table sa-probes">
      <caption className="sa-caption">{title}: lands on {bound.index} after {bound.probes.length} {bound.probes.length === 1 ? 'probe' : 'probes'}</caption>
      <thead>
        <tr><th scope="col">probe at SA</th><th scope="col">first {pattern.length} letters of that suffix</th><th scope="col">then</th></tr>
      </thead>
      <tbody>
        {bound.probes.map((p, i) => (
          <tr key={i}>
            <td>{p.pos} (text position {p.start})</td>
            <td><code>{p.shown === '' ? '(ended)' : p.shown}</code></td>
            <td>{p.goesRight ? `lo moves up to ${p.pos + 1}` : `hi comes down to ${p.pos}`}</td>
          </tr>
        ))}
        {bound.probes.length === 0 && <tr><td colSpan={3}>no probes: the range was already empty ({text.length === 0 ? 'no suffixes' : 'nothing to compare'})</td></tr>}
      </tbody>
    </table>
  );
}

/** Scene 3: two binary searches over the suffix array bracket every occurrence of a pattern. */
export function SearchScene({ picker }: { picker: ReactNode }) {
  const field = useField(parsePattern, '');
  const pattern = field.value;
  const text = DEFAULT_TEXT;
  const sa = useMemo(() => suffixArray(text), [text]);
  const result = useMemo(() => (pattern === '' ? null : search(text, sa, pattern)), [text, sa, pattern]);

  return (
    <StageFrame
      height={460}
      intro={
        result === null
          ? <>Type a pattern to search the suffix array of {text}. Each probe compares only as many letters as the pattern has.</>
          : <>Two binary searches over the sorted suffixes of {text} bracket the pattern {pattern}: the range is [{result.lo}, {result.hi}), so it occurs {result.count} {result.count === 1 ? 'time' : 'times'}.</>
      }
      introKey={`search|${pattern}`}
      stats={
        <Stats>
          <Stat label="Range" value={result ? `[${result.lo}, ${result.hi})` : '–'} color="var(--hi)" sub="lower bound to upper bound" />
          <Stat label="Occurrences" value={result ? result.count : '–'} color={result && result.count > 0 ? 'var(--ok)' : 'var(--dim)'} sub="the width of the range" />
          <Stat label="Text positions" value={result ? (result.count > 0 ? result.positions.join(', ') : 'none') : '–'} color="var(--info)" sub="SA[lo .. hi)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the range [lo, hi): suffixes that start with the pattern', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label={`Pattern (1 to ${PATTERN_MAX})`} value={field.draft} onChange={field.set} maxLength={PATTERN_MAX} width={140} spellCheck={false} />
          {PATTERN_PRESETS.map((p) => (
            <ChipButton key={p} tone="info" on={pattern === p} onClick={() => field.set(p)}>{p}</ChipButton>
          ))}
          <Hint tone={field.error ? 'bad' : 'faint'}>
            <span role="status">{field.error ?? (pattern === '' ? EMPTY_PATTERN_MESSAGE : field.surrogates ? SURROGATE_NOTE : `Searching ${text}. Overlapping occurrences count.`)}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="sa-stage stage-pad">
        <div className="sa-array sa-has-range">
          <span className="sa-rowlabel">suffix array of {text}</span>
          <ArrayStrip
            values={sa}
            showIndex
            fontSize={13}
            cellMax={44}
            ranges={result && result.count > 0 ? [{ from: result.lo, to: result.hi - 1, tone: 'ok', labels: ['lo', 'hi - 1'] }] : []}
            cellState={(i) => (result && i >= result.lo && i < result.hi ? 'done' : 'idle')}
          />
        </div>
        <table className="sa-table sa-sorted">
          <caption className="sa-caption">The suffixes of {text} in sorted order</caption>
          <thead>
            <tr><th scope="col">SA index</th><th scope="col">start</th><th scope="col">suffix</th></tr>
          </thead>
          <tbody>
            {sa.map((start, k) => (
              <tr key={start} className={result && k >= result.lo && k < result.hi ? 'is-hit' : ''}>
                <td>{k}</td>
                <td>{start}</td>
                <td><code>{text.slice(start)}</code></td>
              </tr>
            ))}
          </tbody>
        </table>
        {result && (
          <div className="sa-probe-pair">
            <ProbeTable title="Lower bound" bound={result.lower} text={text} pattern={pattern} />
            <ProbeTable title="Upper bound" bound={result.upper} text={text} pattern={pattern} />
          </div>
        )}
        {result && result.count === 0 && <p className="sa-note">The bounds meet at {result.lo}: an empty range, so {pattern} does not occur in {text}.</p>}
      </div>
      <ProvenanceRow>
        <Provenance kind="real">nothing simulated: every probe is a real comparison against the suffix array above</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
