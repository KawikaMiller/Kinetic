import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { isProbablePrime, modInverse, modPow, mod } from '../../core/numberTheory';
import { fermatCensus, fermatVerdict } from './modpow';
import { N_PRESETS, OPENING, parseBase, parseN, parseP } from './presets';

/** Scene 4: the same trick elsewhere: Fermat's inverse a^(p-2) against egcd, and the plain Fermat test over every base. */
export function FermatScene({ picker }: { picker: ReactNode }) {
  const [a, setA] = useState<bigint>(OPENING.fermat.a);
  const [aDraft, setADraft] = useState(String(OPENING.fermat.a));
  const [p, setP] = useState<bigint>(OPENING.fermat.p);
  const [pDraft, setPDraft] = useState(String(OPENING.fermat.p));
  const [n, setN] = useState<number>(OPENING.fermat.n);
  const [nDraft, setNDraft] = useState(String(OPENING.fermat.n));
  const [errors, setErrors] = useState<{ a: string | null; p: string | null; n: string | null }>({ a: null, p: null, n: null });

  const field = <T,>(parse: (t: string) => { ok: true; value: T } | { ok: false; error: string }, key: 'a' | 'p' | 'n', set: (v: T) => void, setDraft: (s: string) => void) => (text: string) => {
    setDraft(text);
    const parsed = parse(text);
    if (parsed.ok) {
      set(parsed.value);
      setErrors((e) => ({ ...e, [key]: null }));
    } else {
      setErrors((e) => ({ ...e, [key]: parsed.error }));
    }
  };

  const reduced = mod(a, p);
  const fermat = useMemo(() => modPow(a, p - 2n, p), [a, p]);
  const euclid = useMemo(() => modInverse(a, p), [a, p]);
  const pPrime = useMemo(() => isProbablePrime(p), [p]);
  const works = (reduced * fermat) % p === 1n;
  const census = useMemo(() => fermatCensus(n), [n]);
  const nPrime = useMemo(() => isProbablePrime(BigInt(n)).prime, [n]);
  const verdict = fermatVerdict(n, census, nPrime);
  const exposing = census.shareFactor + (census.coprime - census.passing);
  const error = errors.a ?? errors.p ?? errors.n;

  return (
    <StageFrame
      height={470}
      intro={
        <>
          For p = {p.toString()} ({pPrime.prime ? 'prime' : 'not prime'}), a^(p-2) mod p gives {fermat.toString()} and the Euclid table gives {euclid === null ? 'no inverse' : euclid.toString()}. The plain Fermat test on {n} {verdict === 'carmichael' ? 'is fooled: every base coprime to it passes' : verdict === 'prime' ? 'passes for every base, as a prime must' : 'is exposed by at least one base'}.
        </>
      }
      introKey={`${a}-${p}-${n}-${verdict}`}
      stats={
        <Stats>
          <Stat label={`a^(p-2) mod p`} value={fermat.toString()} color="var(--ok)" sub={`a = ${a.toString()}${reduced !== a ? `, which is ${reduced.toString()} mod p` : ''}`} />
          <Stat label="Inverse by egcd" value={euclid === null ? 'none' : euclid.toString()} color={euclid === null ? 'var(--bad)' : 'var(--ok)'} sub={euclid === null ? 'a shares a factor with p' : 'core/numberTheory egcd'} />
          <Stat label="Same answer?" value={euclid !== null && euclid === fermat ? 'yes' : 'no'} color={euclid !== null && euclid === fermat ? 'var(--ok)' : 'var(--bad)'} sub={pPrime.prime ? (pPrime.certain ? 'p is prime (certain)' : 'p is probably prime') : 'p is not prime: a^(p-2) is not an inverse in general'} />
          <Stat label={`Fermat test on n = ${n}`} value={verdict === 'carmichael' ? 'fooled' : verdict === 'prime' ? 'passes' : 'exposed'} color={verdict === 'exposed' ? 'var(--orange)' : verdict === 'carmichael' ? 'var(--bad)' : 'var(--ok)'} sub={`${census.passing} of ${census.coprime} coprime bases pass${census.firstExposing !== null ? `; smallest exposing base ${census.firstExposing}` : ''}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'bases that pass the Fermat test', shape: 'square' },
            { color: 'var(--orange)', label: 'bases that expose n (fail the test)', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <TextField label="a" value={aDraft} onChange={field(parseBase, 'a', setA, setADraft)} width={130} spellCheck={false} />
          <TextField label="p (3 to 10^30)" value={pDraft} onChange={field(parseP, 'p', setP, setPDraft)} width={150} spellCheck={false} />
          <TextField label="n for the Fermat test (5 to 5,000)" value={nDraft} onChange={field(parseN, 'n', setN, setNDraft)} width={110} spellCheck={false} />
          {N_PRESETS.map((v) => (
            <ChipButton key={v} tone="info" on={n === v} onClick={() => { setN(v); setNDraft(String(v)); setErrors((e) => ({ ...e, n: null })); }}>{v}</ChipButton>
          ))}
          <Hint><span role="status">{error ?? 'Type your own a, p and n; each is checked and the old value kept when it is refused.'}</span></Hint>
        </>,
      ]}
    >
      <div className="me-stage stage-pad">
        <h4 className="me-h">An inverse from one exponentiation</h4>
        <p className="me-note">
          Fermat's little theorem says a^(p-1) = 1 (mod p) for a prime p and a not divisible by p, so a^(p-2) is the inverse of a. Check: {reduced.toString()} x {fermat.toString()} mod {p.toString()} = {((reduced * fermat) % p).toString()}{works ? ', an inverse' : ', not 1: no inverse here'}. The egcd route needs the Euclid table; this one is the square-and-multiply of scene 1.
        </p>
        <h4 className="me-h">The plain Fermat test, tried on every base</h4>
        <Bar value={census.passing} max={Math.max(1, census.coprime + census.shareFactor)} tone="ok" label="bases that pass" trailing={census.passing} />
        <Bar value={exposing} max={Math.max(1, census.coprime + census.shareFactor)} tone="orange" label="bases that expose n" trailing={exposing} />
        <p className="me-note">
          {verdict === 'carmichael'
            ? `${n} is composite, yet a^${n - 1} = 1 (mod ${n}) for every one of its ${census.coprime} coprime bases: the plain test is fooled by it (a Carmichael number). The ${census.shareFactor} bases that share a factor with it do expose it, and a stronger test, Miller-Rabin, is what catches such numbers (named only here).`
            : verdict === 'prime'
              ? `${n} is prime, so every base from 2 to n - 2 passes: the test never rejects a prime.`
              : `${n} is composite and ${exposing} of the ${census.coprime + census.shareFactor} bases from 2 to n - 2 expose it${census.firstExposing !== null ? `, the smallest being ${census.firstExposing}` : ''}.`}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes, not cryptography: no key is made or used</Provenance>
        <Provenance kind="real">every base is run through the lesson's modular exponentiation; nothing is typed in</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
