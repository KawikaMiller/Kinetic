import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { group, keygenFrames } from './frames';
import { keygen, parseParam, type KeyStep, type KeyStepId, type RsaKey, type RsaParams } from './model';
import { KeyStats, ToyNote } from './Parts';

const STEP_MS = 1500;

const PRESETS: { label: string; p: string; q: string; e: string }[] = [
  { label: '61, 53, e = 17', p: '61', q: '53', e: '17' },
  { label: '1009, 1013, e = 65537', p: '1009', q: '1013', e: '65537' },
  { label: 'p not prime (57)', p: '57', q: '53', e: '17' },
  { label: 'p = q', p: '61', q: '61', e: '17' },
  { label: 'e shares a factor (15)', p: '61', q: '53', e: '15' },
  { label: '61, 53, e = 65537 (bigger than φ)', p: '61', q: '53', e: '65537' },
];

/** The row label, its formula, and which colour the value wears. */
const ROW: Record<KeyStepId, { name: ReactNode; formula: string; tone?: 'info' | 'violet' }> = {
  p: { name: 'p', formula: 'a prime, kept secret', tone: 'violet' },
  q: { name: 'q', formula: 'a different prime, kept secret', tone: 'violet' },
  distinct: { name: 'p ≠ q', formula: 'two different primes' },
  n: { name: 'n', formula: 'p × q, public', tone: 'info' },
  phi: { name: 'φ', formula: '(p − 1)(q − 1), kept secret', tone: 'violet' },
  'e-range': { name: 'e', formula: 'e > 1, public', tone: 'info' },
  gcd: { name: 'gcd(e, φ)', formula: 'must be 1' },
  d: { name: 'd', formula: 'e⁻¹ mod φ, private', tone: 'violet' },
};

function rowValue(s: KeyStep, p: RsaParams): string {
  if (s.id === 'p') return group(p.p);
  if (s.id === 'q') return group(p.q);
  if (s.id === 'e-range') return group(p.e);
  if (s.id === 'distinct') return s.ok ? 'yes' : 'no';
  return s.value === undefined ? '' : group(s.value);
}

export function KeygenScene({ picker, params, rsaKey, onParams }: {
  picker: ReactNode;
  params: RsaParams;
  rsaKey: RsaKey;
  onParams: (p: RsaParams) => void;
}) {
  const [text, setText] = useState({ p: String(params.p), q: String(params.q), e: String(params.e) });
  const [errors, setErrors] = useState<string[]>([]);
  const g = useMemo(() => keygen(params), [params]);
  const frames = useMemo(() => keygenFrames(g, params.p, params.q, params.e), [g, params]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { shown, done } = player.frame;
  const visible = g.steps.slice(0, shown);
  const showEuclid = g.euclid && visible.some((s) => s.id === 'gcd');

  const generate = (t = text) => {
    const parsed = (['p', 'q', 'e'] as const).map((k) => parseParam(k, t[k]));
    const bad = parsed.flatMap((r) => (r.ok ? [] : [r.error]));
    setErrors(bad);
    if (bad.length > 0) return;
    const [p, q, e] = parsed.map((r) => (r.ok ? r.value : 0n));
    onParams({ p, q, e });
  };
  const load = (pr: (typeof PRESETS)[number]) => {
    const t = { p: pr.p, q: pr.q, e: pr.e };
    setText(t);
    generate(t);
  };
  const field = (k: 'p' | 'q' | 'e') => (
    <TextField label={k} value={text[k]} onChange={(v) => setText({ ...text, [k]: v })} onEnter={() => generate()} width={90} spellCheck={false} />
  );

  return (
    <StageFrame
      player={player}
      height={360}
      stats={<KeyStats rsaKey={rsaKey} />}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'public: n and e' },
            { color: 'var(--violet)', label: 'private 🔒: p, q, φ, d' },
            { color: 'var(--hi)', label: 'the check now' },
            { color: 'var(--ok)', label: 'check passed' },
            { color: 'var(--bad)', label: 'invalid choice' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {field('p')}
          {field('q')}
          {field('e')}
          <Button variant="primary" onClick={() => generate()}>Generate</Button>
          {errors.length > 0 && <Hint tone="bad">{errors.join(' ')} Still showing p = {group(params.p)}, q = {group(params.q)}, e = {group(params.e)}.</Hint>}
        </>,
        <ControlGroup key="presets" label="Try">
          {PRESETS.map((pr) => (
            <ChipButton key={pr.label} on={params.p === BigInt(pr.p) && params.q === BigInt(pr.q) && params.e === BigInt(pr.e)} onClick={() => load(pr)}>
              {pr.label}
            </ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad rsa-keygen">
        <ol className="rsa-steps" aria-label="Key generation checks">
          {visible.map((s, i) => {
            const now = i === shown - 1 && !done;
            const row = ROW[s.id];
            const state = !s.ok ? 'is-bad' : now ? 'is-now' : 'is-ok';
            return (
              <li key={s.id} className={`rsa-step ${state}`}>
                <b className="rsa-step-name">{row.name}</b>
                <span className="rsa-step-formula">{row.formula}</span>
                <span className={`rsa-step-value ${row.tone && s.ok ? `tone-${row.tone}` : ''}`}>
                  {rowValue(s, params)}{row.tone === 'violet' && s.ok ? ' 🔒' : ''}
                </span>
                <span className="rsa-step-mark" aria-label={s.ok ? 'passed' : 'failed'}>{s.ok ? '✓' : '✕'}</span>
              </li>
            );
          })}
          {visible.length === 0 && <li className="rsa-step is-pending">Press play to check p, q and e one at a time.</li>}
        </ol>
        {showEuclid && <EuclidTable g={g} />}
        <ToyNote />
      </div>
    </StageFrame>
  );
}

function EuclidTable({ g }: { g: ReturnType<typeof keygen> }) {
  return (
    <div className="rsa-euclid">
      <p className="rsa-sub">Euclid's remainders for gcd(φ, e), as in the GCD lesson: a = q·b + r until r = 0.</p>
      <table className="data-table rsa-table">
        <thead>
          <tr>
            <th>a</th>
            <th>b</th>
            <th>q</th>
            <th>r</th>
          </tr>
        </thead>
        <tbody>
          {g.euclid!.map((s, i) => (
            <tr key={i}>
              <td>{group(s.a)}</td>
              <td>{group(s.b)}</td>
              <td>{group(s.q)}</td>
              <td>{group(s.r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
