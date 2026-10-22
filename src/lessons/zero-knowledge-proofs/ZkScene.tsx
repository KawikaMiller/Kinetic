import { useMemo, useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_R, DEFAULT_X, GROUP_A, commit, compareTriples, extract, publicKey, readExponent, realTriples, respond, simulatedTriples, verify, type Triple,
} from './schnorr';

const G = GROUP_A;
const DEFAULT_SEED = 7;
const FAKES = 6;
const fmtTriple = (t: Triple) => `(${t.t}, ${t.c}, ${t.s})`;

interface Shown {
  triple: Triple;
  source: 'real' | 'simulated';
}

/** Scene 3: soundness as an extractor, and zero knowledge by exhaustion: the real and the simulated transcripts are the same set. */
export function ZkScene({ picker }: { picker: ReactNode }) {
  const [xText, setXText] = useState(String(DEFAULT_X));
  const [x, setX] = useState(DEFAULT_X);
  const [error, setError] = useState<string | null>(null);
  const [c1, setC1] = useState(4);
  const [c2, setC2] = useState(3);
  const [rewound, setRewound] = useState(false);
  const [broken, setBroken] = useState(false);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [reveal, setReveal] = useState(false);

  const y = publicKey(G, x);
  const real = useMemo(() => realTriples(G, x), [x]);
  const sim = useMemo(() => simulatedTriples(G, y, broken), [y, broken]);
  const cmp = useMemo(() => compareTriples(G, y, real, sim), [y, real, sim]);
  const fakes = useMemo<Shown[]>(() => {
    const rnd = mulberry32(seed);
    const simulated = simulatedTriples(G, y);
    return Array.from({ length: FAKES }, () => {
      const isReal = rnd() < 0.5;
      const pool = isReal ? real : simulated;
      return { triple: pool[Math.floor(rnd() * pool.length)], source: isReal ? 'real' : 'simulated' } satisfies Shown;
    });
  }, [seed, real, y]);

  const typeX = (text: string) => {
    setXText(text);
    const parsed = readExponent(text, 'x', 1n, G.q - 1n);
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setX(parsed.value);
    setRewound(false);
  };

  const t = commit(G, DEFAULT_R);
  const s1 = respond(G, DEFAULT_R, BigInt(c1), x);
  const s2 = respond(G, DEFAULT_R, BigInt(c2), x);
  const extracted = c1 === c2 ? null : extract(G, BigInt(c1), s1, BigInt(c2), s2);

  const intro = cmp.identical
    ? `The ${cmp.count} real triples and the ${sim.length} simulated triples are the same set, each triple exactly once: for an honest verifier who picks c at random, a transcript tells it nothing it could not have made without x.`
    : `${cmp.missing} of the ${sim.length} simulated triples are not real triples (and ${cmp.unmatched} real ones are never simulated); the first it fails to make valid is ${cmp.firstFailing ? fmtTriple(cmp.firstFailing) : 'none'}.`;

  return (
    <StageFrame
      height={720}
      intro={intro}
      introKey={`zk|${x}|${broken}|${cmp.identical}`}
      stats={
        <Stats>
          <Stat label="Real triples" value={real.length} color="var(--sky)" sub="each r with each c" />
          <Stat label="Simulated triples" value={sim.length} color="var(--amber)" sub="each s with each c, no secret" />
          <Stat label="Same set" value={cmp.identical ? 'yes' : 'no'} color={cmp.identical ? 'var(--ok)' : 'var(--bad)'} sub={cmp.identical ? 'each triple exactly once' : `${cmp.missing} simulated are not real`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--sky)', label: 'a real transcript', shape: 'square' }, { color: 'var(--amber)', label: 'a simulated transcript', shape: 'square' }, { color: 'var(--ok)', label: 'identical sets', shape: 'square' }, { color: 'var(--bad)', label: 'a broken simulator', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <TextField label="secret x (1 to 10)" value={xText} onChange={typeX} onBlur={() => { setXText(String(x)); setError(null); }} width={80} spellCheck={false} />
          <Toggle label="Simulator" value={broken} onChange={setBroken} off="Correct: t = g^s y^(-c)" on="Forgets y^(-c) (broken)" />
          {error && <Hint tone="bad">{error} Keeping x = {String(x)}.</Hint>}
        </>,
        <>
          <Slider label="first challenge c" value={c1} min={0} max={Number(G.q - 1n)} onChange={(v) => { setC1(v); setRewound(false); }} />
          <Slider label="second challenge c'" value={c2} min={0} max={Number(G.q - 1n)} onChange={(v) => { setC2(v); setRewound(false); }} />
          <Button variant="primary" onClick={() => setRewound(true)}>Rewind: ask the same commitment twice</Button>
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} />
          <Button onClick={() => setReveal(!reveal)}>{reveal ? 'Hide' : 'Reveal'} which are real</Button>
        </>,
      ]}
    >
      <div className="stage-pad zk-stage">
        <div className="zk-cheat">
          <b>Soundness, as an extractor.</b> Run the prover twice with the same commitment t = {String(t)} (the same r = {String(DEFAULT_R)}) and two different challenges.{' '}
          {rewound ? (
            c1 === c2 ? (
              <span className="tone-bad">The same challenge twice gives nothing: pick two different challenges.</span>
            ) : (
              <span>
                Answers: (c = {c1}, s = {String(s1)}) and (c = {c2}, s = {String(s2)}), both accepted ({String(verify(G, y, t, BigInt(c1), s1).ok)}, {String(verify(G, y, t, BigInt(c2), s2).ok)}). Then x = (s - s') / (c - c') = ({String(s1)} - {String(s2)}) / ({c1} - {c2}) = {String(extracted)} mod {String(G.q)}: the secret. This is why r must be fresh each session and never reused.
              </span>
            )
          ) : (
            <span>Press Rewind to see what two answers to one commitment give away.</span>
          )}{' '}
          A real verifier never allows two answers to one commitment: this is a proof technique, not an attack on the protocol.
        </div>
        <div className="zk-lists">
          <div>
            <b className="tone-sky">Real triples (t, c, s): {real.length}</b>
            <div className="zk-scroll"><ConsolePanel title="the honest prover, every r and c" lines={real.map(fmtTriple)} /></div>
          </div>
          <div>
            <b className="tone-amber">Simulated triples (t, c, s): {sim.length}</b>
            <div className="zk-scroll"><ConsolePanel title="the simulator, every s and c" lines={sim.map(fmtTriple)} /></div>
          </div>
        </div>
        {!cmp.identical && cmp.firstFailing && <p className="zk-refusal" role="alert">The broken simulator fails: its first triple the verifier rejects is {fmtTriple(cmp.firstFailing)} (it needs t = g^s y^(-c) and forgot the y factor).</p>}
        <div className="zk-cheat">
          <b>Spot the fake.</b> Six transcripts, each from the real prover or the simulator. Every one passes the verifier&apos;s equation, so they cannot be told apart.
          <div className="zk-fakes" role="list" aria-label="Six transcripts">
            {fakes.map((f, i) => (
              <span key={i} role="listitem" className={`zk-fake ${reveal ? (f.source === 'real' ? 'is-real' : 'is-sim') : ''}`}>
                {fmtTriple(f.triple)}: {verify(G, y, f.triple.t, f.triple.c, f.triple.s).ok ? 'accepted' : 'rejected'}{reveal ? ` (${f.source})` : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={seed}>an 11-element exponent group in a 5-bit field: proves nothing about any real system, and the code is not constant-time</Provenance>
        <ClaimLabel kind="theorem">honest-verifier zero knowledge: argued, not run beyond this group; checked here by listing all {real.length} real and {sim.length} simulated triples. A verifier that picks its challenges adaptively is not covered (named, not shown)</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
