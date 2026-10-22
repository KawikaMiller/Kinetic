import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { Fp } from '../../core/field';
import { bits, consistentCounts, drawCoeffs, exhaustiveSecrecy, MAX_SMALL_SHARES, SECRECY_WORK_LIMIT, SMALL_PRIMES, secrecyButtonText, secrecyWork, sharesLeaveText, type Secrecy, type Share } from './shamir';

const fmt = (n: number) => n.toLocaleString('en-US');
const PRIME_OPTIONS = SMALL_PRIMES.map((p) => ({ value: p, label: `GF(${p})` }));
const K_OPTIONS = [{ value: 2, label: 'k = 2' }, { value: 3, label: 'k = 3' }];
const DEFAULTS = { p: 7, k: 3, s: 2, a1: 3, a2: 1 };
const DEFAULT_SEED = 5;
const CELL = 34;

/** Scene 1: the polynomial hides the secret. Tick the shares an adversary holds; the bars count the polynomials that fit each candidate secret. */
export function PolyScene({ picker }: { picker: ReactNode }) {
  const [v, setV] = useState(DEFAULTS);
  const [held, setHeld] = useState<readonly number[]>([]);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [proof, setProof] = useState<{ key: string; result: Secrecy } | null>(null);
  const { p, k } = v;
  const key = `${p}|${k}`;
  const shareCount = Math.min(MAX_SMALL_SHARES, p - 1);
  const F = useMemo(() => Fp(BigInt(p)), [p]);
  const coeffs = k === 3 ? [BigInt(v.a1), BigInt(v.a2)] : [BigInt(v.a1)];
  const y = (x: number) => Number(F.evalPoly([BigInt(v.s), ...coeffs], BigInt(x)));
  const heldShares: Share[] = held.filter((x) => x <= shareCount).map((x) => ({ x: BigInt(x), y: BigInt(y(x)) }));
  const counts = consistentCounts(p, k, heldShares);
  const top = Math.max(...counts);
  const possible = counts.filter((c) => c > 0).length;
  const equal = counts.every((c) => c === counts[0] && c > 0);

  const set = (patch: Partial<typeof DEFAULTS>) => setV({ ...v, ...patch });
  const setField = (np: number) => {
    setV({ ...v, p: np, s: Math.min(v.s, np - 1), a1: Math.min(v.a1, np - 1), a2: Math.min(v.a2, np - 1) });
    setHeld([]);
  };
  const toggle = (x: number) => setHeld(held.includes(x) ? held.filter((h) => h !== x) : [...held, x].sort((a, b) => a - b));
  const draw = () => {
    const [a1, a2] = drawCoeffs(seed, 2, BigInt(p)).map(Number);
    set({ a1, a2 });
  };

  const intro = equal
    ? `${heldShares.length} share${heldShares.length === 1 ? '' : 's'} held: each of the ${p} secrets fits ${counts[0]} polynomial${counts[0] === 1 ? '' : 's'}, so every secret is equally possible.`
    : possible === 1
      ? `${heldShares.length} shares held: exactly one polynomial fits, and the secret is certain: ${counts.indexOf(top)}.`
      : `${heldShares.length} shares held: ${possible} of the ${p} secrets are still possible.`;
  const shown = proof && proof.key === key ? proof.result : null;

  return (
    <StageFrame
      height={560}
      intro={intro}
      introKey={`poly|${p}|${k}|${v.s}|${v.a1}|${v.a2}|${held.join(',')}`}
      stats={
        <Stats>
          <Stat label="Field" value={`GF(${p})`} sub={`a ${bits(p)}-bit field: a toy`} />
          <Stat label="Shares held" value={`${heldShares.length} of ${k}`} color={heldShares.length >= k ? 'var(--bad)' : 'var(--info)'} sub={sharesLeaveText(k)} />
          <Stat label="Secrets still possible" value={`${possible} of ${p}`} color={possible === 1 ? 'var(--ok)' : undefined} sub="by counting every polynomial" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the secret (x = 0)', shape: 'square' },
            { color: 'var(--info)', label: 'a share with a custodian', shape: 'square' },
            { color: 'var(--bad)', label: 'a share the adversary holds', shape: 'square' },
            { color: 'var(--ok)', label: 'the secret, once certain', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<number> label="Field" options={PRIME_OPTIONS} value={p} onChange={setField} />
          <Segmented<number> label="Threshold" options={K_OPTIONS} value={k} onChange={(nk) => set({ k: nk })} />
        </>,
        <>
          <Slider label="secret s" value={v.s} min={0} max={p - 1} onChange={(s) => set({ s })} />
          <Slider label="a1" value={v.a1} min={0} max={p - 1} onChange={(a1) => set({ a1 })} />
          {k === 3 && <Slider label="a2" value={v.a2} min={0} max={p - 1} onChange={(a2) => set({ a2 })} />}
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
          <Button onClick={draw}>Draw coefficients from the seed</Button>
          <ControlGroup label="The adversary holds share">
            {Array.from({ length: shareCount }, (_, i) => i + 1).map((x) => (
              <ChipButton key={x} on={held.includes(x)} tone="bad" onClick={() => toggle(x)}>{x}</ChipButton>
            ))}
          </ControlGroup>
          <Button onClick={() => setProof({ key, result: exhaustiveSecrecy(p, k) })} softDisabled={secrecyWork(p, k) > SECRECY_WORK_LIMIT}>Check secrecy exhaustively</Button>
          {secrecyWork(p, k) > SECRECY_WORK_LIMIT && <Hint tone="muted">GF({p}) with k = {k} is too large to check on a button press; GF(5) and GF(7) with k = 3, and every field with k = 2, are offered.</Hint>}
        </>,
      ]}
    >
      <div className="stage-pad ss-stage">
        <p className="ss-equation">f(x) = {v.s} + {v.a1}x{k === 3 ? ` + ${v.a2}x^2` : ''} over GF({p}) (a {bits(p)}-bit field)</p>
        <CellGrid
          rows={p}
          cols={p}
          size={{ cell: CELL }}
          rowLabels={Array.from({ length: p }, (_, r) => r)}
          colLabels={Array.from({ length: p }, (_, c) => c)}
          ariaLabel={`The polynomial f over GF(${p}) as dots: x runs across, f(x) runs down`}
          cell={(r, c) => {
            if (y(c) !== r) return { fill: 'outline' };
            if (c === 0) return { tone: possible === 1 ? 'ok' : 'hi', fill: 'solid', text: 's' };
            if (c > shareCount) return { tone: 'muted', fill: 'tint' };
            return { tone: held.includes(c) ? 'bad' : 'info', fill: 'solid', text: String(c) };
          }}
        />
        <div className="ss-bars" role="list" aria-label="How many polynomials fit each candidate secret">
          {counts.map((c, s) => (
            <div key={s} role="listitem">
              <Bar value={c} max={top || 1} tone={possible === 1 && c > 0 ? 'ok' : equal ? 'muted' : 'info'} label={`secret ${s}`} trailing={`${fmt(c)} ${c === 1 ? 'polynomial' : 'polynomials'}`} height={6} />
            </div>
          ))}
        </div>
        {shown && (
          <p className={shown.exactlyOne ? 'ss-proof is-ok' : 'ss-proof is-bad'} role="status">
            {shown.exactlyOne
              ? `GF(${p}), k = ${k}: all ${fmt(shown.cases)} sets of ${k - 1} share${k === 2 ? '' : 's'} (every choice of x-values and y-values) were tried; each of the ${p} secrets had exactly one polynomial each time (${fmt(shown.checks)} checks).`
              : 'Some set of shares narrowed the secret down.'}
          </p>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={seed}>GF({p}) is {bits(p)} bits: a toy field; a real system would use a much larger field, a CSPRNG, and authenticated shares. Nothing here splits a real key</Provenance>
        <ClaimLabel kind="theorem">with uniformly random coefficients, any k - 1 shares are independent of the secret: argued, not run here for large fields; {secrecyButtonText(p, k)}</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
