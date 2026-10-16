import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { n, verdictCaption } from './captions';
import { Honesty } from './Honesty';
import {
  PAIR_MAX, PAIR_MIN, PAIR_PRESETS, PROGRAMS, eventText, programOf, secretBytes, secretHex, tracesOpening, verdict, type ProgramId,
} from './traces';

const PROGRAM_OPTIONS = PROGRAMS.map((p) => ({ value: p.id, label: p.label }));
const FIELD_OPTIONS = {
  min: PAIR_MIN,
  max: PAIR_MAX,
  prefixes: ['hex'] as const,
  plainRadix: 16 as const,
  underscores: true,
  spaces: true,
  messages: {
    empty: 'Type up to eight hex digits.',
    invalid: (typed: string) => `"${typed}" is not hex: use the digits 0-9 and a-f.`,
    tooBig: () => 'That is more than eight hex digits (four bytes).',
  },
};

export function TracesScene({ picker }: { picker: ReactNode }) {
  const [open] = useState(tracesOpening);
  const [programId, setProgramId] = useState<ProgramId>(open.program);
  const [a, setA] = useState(open.a);
  const [b, setB] = useState(open.b);
  const [typedA, setTypedA] = useState(secretHex(open.a));
  const [typedB, setTypedB] = useState(secretHex(open.b));
  const [error, setError] = useState<string | null>(null);

  const program = programOf(programId);
  const result = useMemo(() => verdict(program, secretBytes(a), secretBytes(b)), [program, a, b]);
  const all = useMemo(() => PROGRAMS.map((p) => verdict(p, secretBytes(a), secretBytes(b))), [a, b]);
  const caption = verdictCaption(result, program.label);

  const commit = (which: 'a' | 'b', typed: string) => {
    const parsed = parseBoundedInt(typed, FIELD_OPTIONS);
    const other = which === 'a' ? b : a;
    if (!parsed.ok) return setError(parsed.error);
    if (parsed.value === other) return setError('The two secrets must differ: the test compares what two different secrets look like.');
    setError(null);
    if (which === 'a') {
      setA(parsed.value);
      setTypedA(secretHex(parsed.value));
    } else {
      setB(parsed.value);
      setTypedB(secretHex(parsed.value));
    }
  };
  const loadPair = (pair: { a: number; b: number }) => {
    setA(pair.a);
    setB(pair.b);
    setTypedA(secretHex(pair.a));
    setTypedB(secretHex(pair.b));
    setError(null);
  };

  const column = (label: string, trace: typeof result.traceA, secret: number) => (
    <Box className="tsc-trace">
      <SectionTitle hint={secretHex(secret)}>{label}</SectionTitle>
      <ol aria-label={`${label} trace`}>
        {trace.map((e, i) => (
          <li key={i} className={result.firstDifference === i ? 'is-diff' : undefined}>{eventText(e)}</li>
        ))}
        {trace.length === 0 && <li className="is-empty">no events</li>}
      </ol>
    </Box>
  );

  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Verdict for this program" value={result.leaks ? 'leaks' : 'no leak here'} color={result.leaks ? 'var(--bad)' : 'var(--ok)'} sub={result.leaks ? `traces differ at event ${n((result.firstDifference ?? 0) + 1)}` : 'traces identical for this pair'} />
          <Stat label="Programs that leak" value={`${all.filter((v) => v.leaks).length} of ${all.length}`} sub="for this pair of secrets" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the traces differ: leaks', shape: 'square' },
            { color: 'var(--ok)', label: 'identical traces', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Program" value={programId} onChange={setProgramId} options={PROGRAM_OPTIONS} />
        </>,
        <>
          <TextField label="Secret 1 (4 bytes, hex)" value={typedA} onChange={setTypedA} onEnter={() => commit('a', typedA)} onBlur={() => commit('a', typedA)} width={150} spellCheck={false} />
          <TextField label="Secret 2 (4 bytes, hex)" value={typedB} onChange={setTypedB} onEnter={() => commit('b', typedB)} onBlur={() => commit('b', typedB)} width={150} spellCheck={false} />
          <ControlGroup label="Pairs" inline>
            {PAIR_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={a === p.a && b === p.b} onClick={() => loadPair(p)}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="tsc-stage stage-pad">
        <div className="tsc-traces">
          <CodePanel className="tsc-code" title="the program" lines={program.code} />
          {column('Trace for secret 1', result.traceA, a)}
          {column('Trace for secret 2', result.traceB, b)}
        </div>
        {error && <p className="tsc-refused" role="alert">{error} The old pair is kept.</p>}
        <Box>
          <SectionTitle hint="the same pair, every program">What an observer of branches and memory lines could tell apart</SectionTitle>
          <table className="data-table table-cards tsc-verdicts">
            <thead>
              <tr><th>Program</th><th>Verdict</th></tr>
            </thead>
            <tbody>
              {all.map((v) => (
                <tr key={v.programId} className={v.programId === programId ? 'tsc-row-on' : undefined}>
                  <td data-label="Program">{programOf(v.programId).label}</td>
                  <td data-label="Verdict" className={v.leaks ? 'tsc-leaks' : 'tsc-clean'}>{v.leaks ? 'leaks' : 'does not leak in this model'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>
            This is the method behind &quot;constant-time&quot; code: run it on different secrets and check that the control flow and the memory lines touched do not depend on them. A pair that passes proves little: try another pair, such as the one with a zero byte.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a branch and cache-line trace of five tiny lesson programs, not a real CPU</Provenance>
          <Provenance kind="from-memory">tools that automate this check exist, such as dudect and ctgrind; verify what each does before relying on it</Provenance>
        </ProvenanceRow>
        <Honesty simulated={false} />
      </div>
    </StageFrame>
  );
}
