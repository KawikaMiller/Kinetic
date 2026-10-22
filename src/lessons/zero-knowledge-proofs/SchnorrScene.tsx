import { useState, type ReactNode } from 'react';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, TextField } from '../../components/ui';
import { humanDuration, power } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { mulberry32 } from '../../core/random';
import {
  DEFAULT_R, DEFAULT_X, GROUPS, ILLUSTRATIVE_RATE, REAL_COST, commit, guessRun, publicKey, respond, searchSecret, verify, workings, type Group,
} from './schnorr';

const GROUP_OPTIONS = [
  { value: 'A' as const, label: 'Group A (p = 23, 5 bits)' },
  { value: 'B' as const, label: 'Group B (p = 2039, 11 bits)' },
];
const DEFAULT_SEED = 7;
const GUESS_ROUNDS = 1000;
const DEFAULT_C = 3n;
const fmt = (n: number) => n.toLocaleString('en-US');

/** Scene 2: a working proof of knowledge of a discrete logarithm (Schnorr identification) in a toy group, with the cheats against it. */
export function SchnorrScene({ picker }: { picker: ReactNode }) {
  const [id, setId] = useState<Group['id']>('A');
  const G = GROUPS[id];
  const [x, setX] = useState(DEFAULT_X);
  const [xText, setXText] = useState(String(DEFAULT_X));
  const [error, setError] = useState<string | null>(null);
  const [r, setR] = useState(DEFAULT_R);
  const [c, setC] = useState(DEFAULT_C);
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [guess, setGuess] = useState<ReturnType<typeof guessRun> | null>(null);
  const [searched, setSearched] = useState<ReturnType<typeof searchSecret> | null>(null);
  const [showZero, setShowZero] = useState(false);

  const y = publicKey(G, x);
  const t = commit(G, r);
  const s = respond(G, r, c, x);
  const check = verify(G, y, t, c, s);
  const ok = check.ok;
  const lines = workings(G, x, r, c);

  const switchGroup = (next: Group['id']) => {
    const H = GROUPS[next];
    const nx = x < H.q ? x : x % (H.q - 1n) + 1n;
    setId(next);
    setX(nx);
    setXText(String(nx));
    setR(r % H.q);
    setC(c % H.q);
    setGuess(null);
    setSearched(null);
    setError(null);
  };
  const typeX = (text: string) => {
    setXText(text);
    const parsed = parseBoundedInt(text, { min: 1, max: Number(G.q - 1n), messages: { tooBig: () => `Keep x between 1 and ${G.q - 1n}.`, tooSmall: () => `Keep x between 1 and ${G.q - 1n}.` } });
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setX(BigInt(parsed.value));
    setSearched(null);
    setGuess(null);
  };
  const drawR = () => setR(BigInt(Math.floor(mulberry32(seed)() * Number(G.q))));

  const zeroCheck = verify(G, y, commit(G, 3n), 0n, 3n);

  return (
    <StageFrame
      height={640}
      intro={`g^s = ${check.lhs} and t y^c = ${check.rhs}: the verifier ${ok ? 'accepts' : 'rejects'}. The prover never sent x = ${x}, only t and s.`}
      introKey={`schnorr|${id}|${x}|${r}|${c}`}
      stats={
        <Stats>
          <Stat label="Group" value={`${G.bits}-bit p`} sub={`p = ${G.p}, q = ${G.q}, g = ${G.g}: a toy`} />
          <Stat label="Public key y" value={String(y)} color="var(--info)" sub="g^x mod p" />
          <Stat label="Verifier" value={ok ? 'accepts' : 'rejects'} color={ok ? 'var(--ok)' : 'var(--bad)'} sub={`challenge c = ${c}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'the secret x, never sent', shape: 'square' },
            { color: 'var(--info)', label: 'the committed t', shape: 'square' },
            { color: 'var(--hi)', label: 'the challenge c', shape: 'square' },
            { color: 'var(--ok)', label: 'accepted', shape: 'square' },
            { color: 'var(--bad)', label: 'rejected', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<Group['id']> label="Group" options={GROUP_OPTIONS} value={id} onChange={switchGroup} />
        </>,
        <>
          <TextField label={`secret x (1 to ${G.q - 1n})`} value={xText} onChange={typeX} onBlur={() => { setXText(String(x)); setError(null); }} width={90} spellCheck={false} />
          <Slider label="r (the prover's random number)" value={Number(r)} min={0} max={Number(G.q - 1n)} onChange={(v) => setR(BigInt(v))} />
          <Slider label="c (the verifier's challenge)" value={Number(c)} min={0} max={Number(G.q - 1n)} onChange={(v) => setC(BigInt(v))} />
          {error && <Hint tone="bad">{error} Keeping x = {String(x)}.</Hint>}
        </>,
        <>
          <SeedField seed={seed} onSeed={(n) => { setSeed(n); setGuess(null); }} />
          <Button onClick={drawR}>Draw r from the seed</Button>
          <ControlGroup label="Try">
            <ChipButton on={id === 'A' && x === 7n && r === 5n && c === 3n} onClick={() => { switchGroup('A'); setX(7n); setXText('7'); setR(5n); setC(3n); }}>x 7, r 5, c 3</ChipButton>
            <ChipButton on={id === 'A' && x === 7n && r === 5n && c === 4n} onClick={() => { switchGroup('A'); setX(7n); setXText('7'); setR(5n); setC(4n); }}>same t, c 4</ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="stage-pad zk-stage">
        <ConsolePanel title="one round, with every modular power" lines={lines} preserveWhitespace />
        <div className="zk-cheats">
          <div className="zk-cheat">
            <b>Cheat (a): guess the challenge.</b> Without x, fix a guessed c', pick s at random, and send t = g^s y^(-c'); it passes exactly when the verifier's c equals c'.{' '}
            <Button onClick={() => setGuess(guessRun(G, y, seed, GUESS_ROUNDS))}>Run {fmt(GUESS_ROUNDS)} seeded rounds</Button>{' '}
            {guess && <span>{guess.passed} of {fmt(GUESS_ROUNDS)} passed (seed {seed}); the formula 1/q = 1/{String(G.q)} predicts about {guess.expected.toFixed(1)} (sigma {guess.sigma.toFixed(1)}).</span>}
          </div>
          <div className="zk-cheat is-bad">
            <b>Cheat (b): a predictable verifier.</b> If the verifier always picks c = 0, any t = g^s passes.{' '}
            <Button onClick={() => setShowZero(!showZero)}>{showZero ? 'Hide' : 'Show'} the check</Button>{' '}
            {showZero && <span>s = 3, t = {String(commit(G, 3n))}: g^3 = {String(zeroCheck.lhs)} and t y^0 = {String(zeroCheck.rhs)}: {zeroCheck.ok ? 'accepted' : 'rejected'}, with no knowledge of x. A verifier that always asks c = 0 asks nothing of the prover.</span>}
          </div>
          <div className="zk-cheat">
            <b>Cheat (c): search.</b> In a toy group the discrete logarithm takes at most {String(G.q)} tries.{' '}
            <Button onClick={() => setSearched(searchSecret(G, y))}>Try every s</Button>{' '}
            {searched && <span>found x = {String(searched.x)} after {searched.tries} {searched.tries === 1 ? 'try' : 'tries'}: that is exactly why a toy proves nothing. For a group of order about {power(256)} the best generic method needs about {power(REAL_COST.log2)} steps, about {humanDuration(REAL_COST.seconds)} at a made-up {fmt(ILLUSTRATIVE_RATE)} steps per second.</span>}
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy" seed={seed}>a {G.bits}-bit toy group (group A is 5 bits, group B is 11 bits), seeded randomness, not constant-time: proves nothing about any real system. Never copy this code</Provenance>
        <Provenance kind="illustrative">the {fmt(ILLUSTRATIVE_RATE)} steps per second is a made-up rate for the real-size cost line</Provenance>
        <Provenance kind="from-memory">Schnorr identification is the protocol shape (Schnorr, around 1989 to 1991: verify the citation)</Provenance>
        <ClaimLabel kind="theorem">a prover who answers two challenges for one commitment must know x: argued here, shown on the next scene by the extractor</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
