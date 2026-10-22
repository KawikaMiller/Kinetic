import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { parseBoundedInt } from '../../core/parse';
import { N_MAX, baseTable, checkN, isRun, shorRun, type ShorRun } from './shor';

const DEFAULT_N = 15;
const DEFAULT_A = 7;
const TEXT_LIMIT = 1_000_000_000;
const PRESETS: { label: string; N: number; a: number }[] = [
  { label: 'N = 15, a = 7', N: 15, a: 7 },
  { label: 'N = 15, a = 14', N: 15, a: 14 },
  { label: 'N = 21, a = 4', N: 21, a: 4 },
  { label: 'N = 21, a = 2', N: 21, a: 2 },
];

const outcome = (run: ShorRun): string => (run.failure ? `fails: ${run.failure}` : `works: ${run.factors![0]} x ${run.factors![1]}`);

function workings(run: ShorRun): string[] {
  const { N, a, r } = run;
  const lines = [`powers of ${a} mod ${N}: ${run.powers.map((p, i) => `${a}^${i + 1} = ${p}`).join(', ')}`, `order r = ${r}, found by a loop of ${run.steps} multiplications`];
  if (run.failure === 'r is odd') lines.push(`r = ${r} is odd, so a^(r/2) is not a whole power: this base fails`);
  else {
    lines.push(`r = ${r} is even: a^(r/2) = ${a}^${r / 2} = ${run.half} mod ${N}`);
    if (run.failure) lines.push(`a^(r/2) = ${run.half} = -1 mod ${N}: this base fails`);
    else lines.push(`gcd(${run.half} - 1, ${N}) = ${run.factors![0]} and gcd(${run.half} + 1, ${N}) = ${run.factors![1]}`, `${N} = ${run.factors![0]} x ${run.factors![1]}`);
  }
  return lines;
}

/** Scene 2: Shor's classical post-processing on tiny N, with the order found by the slow loop. */
export function ShorScene({ picker }: { picker: ReactNode }) {
  const [text, setText] = useState({ N: String(DEFAULT_N), a: String(DEFAULT_A) });
  const [applied, setApplied] = useState({ N: DEFAULT_N, a: DEFAULT_A });
  const [error, setError] = useState<string | null>(null);

  const apply = (next: { N: string; a: string }) => {
    setText(next);
    const n = parseBoundedInt(next.N, { min: 0, max: TEXT_LIMIT });
    const a = parseBoundedInt(next.a, { min: 0, max: TEXT_LIMIT });
    if (!n.ok) return setError(`N: ${n.error}`);
    if (!a.ok) return setError(`a: ${a.error}`);
    const ok = checkN(n.value);
    if (!ok.ok) return setError(ok.error);
    if (a.value < 2 || a.value >= n.value) return setError(`a must be between 2 and ${n.value - 1}.`);
    const run = shorRun(n.value, a.value);
    if (!isRun(run)) return setError(run.error);
    setError(null);
    setApplied({ N: n.value, a: a.value });
  };
  const load = (N: number, a: number) => apply({ N: String(N), a: String(a) });

  const run = useMemo(() => shorRun(applied.N, applied.a), [applied]);
  const table = useMemo(() => baseTable(applied.N), [applied.N]);
  if (!isRun(run)) throw new Error('applied (N, a) is always valid');

  const intro = run.failure
    ? `N = ${run.N}, a = ${run.a}: the order is ${run.r}, and this base fails (${run.failure}). A quantum computer would only supply r; everything else on this page is ordinary arithmetic.`
    : `N = ${run.N}, a = ${run.a}: the order is ${run.r}, so ${run.N} = ${run.factors![0]} x ${run.factors![1]}. A quantum computer would supply r quickly; this page finds it with a loop of ${run.steps} multiplications, which is why the method does not scale here.`;

  return (
    <StageFrame
      height={520}
      intro={intro}
      introKey={`shor|${applied.N}|${applied.a}`}
      stats={
        <Stats>
          <Stat label="Order r" value={run.r} sub={`found by a loop of ${run.steps} steps`} color="var(--info)" />
          <Stat label="This base" value={run.failure ? 'fails' : 'works'} color={run.failure ? 'var(--bad)' : 'var(--ok)'} sub={run.failure ?? `${run.factors![0]} x ${run.factors![1]} = ${run.N}`} />
          <Stat label={`Bases that work (N = ${table.N})`} value={`${table.works} of ${table.coprime}`} sub={`a in 2..${table.N - 1}; ${table.works} of phi(N) = ${table.phi} counting a = 1`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'a base that works', shape: 'square' }, { color: 'var(--bad)', label: 'a base that fails, with the reason', shape: 'square' }, { color: 'var(--info)', label: 'the order r', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <TextField label={`N (odd composite up to ${N_MAX})`} value={text.N} onChange={(v) => apply({ ...text, N: v })} onBlur={() => setText({ N: String(applied.N), a: String(applied.a) })} width={90} spellCheck={false} />
          <TextField label="a" value={text.a} onChange={(v) => apply({ ...text, a: v })} onBlur={() => setText({ N: String(applied.N), a: String(applied.a) })} width={90} spellCheck={false} />
          {error && <Hint tone="bad">{error} Keeping N = {applied.N}, a = {applied.a}.</Hint>}
        </>,
        <ControlGroup key="presets" label="Try">
          {PRESETS.map((p) => (
            <ChipButton key={p.label} on={applied.N === p.N && applied.a === p.a} onClick={() => load(p.N, p.a)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad pq-stage">
        <ConsolePanel title="the working" lines={workings(run)} />
        <p className="pq-note">
          A quantum computer&apos;s contribution would be finding r in time that grows slowly with the size of N. Every other line here is ordinary arithmetic, and the loop above takes r steps, which is why it does not scale.
        </p>
        <WideRegion minWidth={420} noun="table">
          <table className="pq-table" aria-label={`Every base coprime to ${table.N}`}>
            <thead>
              <tr><th>a</th><th>order r</th><th>a^(r/2) mod N</th><th>outcome</th></tr>
            </thead>
            <tbody>
              {table.rows.map(({ a, run: row }) => (
                <tr key={a} className={a === applied.a ? 'is-picked' : ''}>
                  <td><button type="button" className="pq-pick" onClick={() => load(applied.N, a)}>{a}</button></td>
                  <td>{row.r}</td>
                  <td>{row.half ?? '-'}</td>
                  <td className={row.failure ? 'tone-bad' : 'tone-ok'}>{outcome(row)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
      </div>
      <ProvenanceRow>
        <Provenance kind="not-run">a quantum computer is described, not run: the order comes from a classical loop on a number of at most {N_MAX}</Provenance>
        <ClaimLabel kind="standard">for an odd N with two distinct prime factors, at least half of the bases a work (from memory, verify); the table is evidence for the two numbers shown, not a proof</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
