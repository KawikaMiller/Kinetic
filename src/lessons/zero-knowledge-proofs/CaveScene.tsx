import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import {
  MAX_ROUNDS, PATTERN_MIN, SIDE_NAME, answers, appendCall, cheaterGame, meter, patternFalseAlarm, policyCall, proverKind, survival, verifierCaption, verifierCall, type Policy, type Side,
} from './cave';

type Role = 'verifier' | 'cheater';
const ROLE_OPTIONS = [{ value: 'verifier' as const, label: 'You are the verifier' }, { value: 'cheater' as const, label: 'You are the cheater' }];
const POLICY_OPTIONS = [
  { value: 'manual' as const, label: 'You choose each call' },
  { value: 'always-left' as const, label: 'Always left' },
  { value: 'alternate' as const, label: 'Strictly alternating' },
  { value: 'random' as const, label: 'Seeded random' },
];
const DEFAULT_SEED = 7;
const GAMES = 1000;
const GAME_ROUNDS = 5;
const NO_SIDES: readonly Side[] = [];

/** The cave: a ring with a door; the entrance at the bottom, the called side highlighted, and where the prover went shown only once it is known. */
function CaveDrawing({ called, entered, caught }: { called: Side | null; entered: Side | null; caught: boolean }) {
  return (
    <svg className="zk-cave" viewBox="0 0 360 220" role="img" aria-label={`The cave: a ring with a door in the middle${called ? `, the verifier called the ${SIDE_NAME[called]} path` : ''}`}>
      <path className={`zk-path ${called === 'L' ? 'is-called' : ''}`} d="M180 196 C 60 196, 40 120, 70 70 C 90 40, 140 36, 160 40" />
      <path className={`zk-path ${called === 'R' ? 'is-called' : ''}`} d="M180 196 C 300 196, 320 120, 290 70 C 270 40, 220 36, 200 40" />
      <rect className="zk-door" x="160" y="28" width="40" height="24" rx="4" />
      <text x="180" y="44" textAnchor="middle" className="zk-label">door</text>
      <text x="50" y="130" textAnchor="middle" className="zk-label">left</text>
      <text x="310" y="130" textAnchor="middle" className="zk-label">right</text>
      <text x="180" y="214" textAnchor="middle" className="zk-label">entrance</text>
      {entered && <circle className={caught ? 'zk-prover is-caught' : 'zk-prover'} cx={entered === 'L' ? 70 : 290} cy={80} r="9" />}
    </svg>
  );
}

/** Scene 1: the Ali Baba cave as verifier (with a prover who may be cheating) and as cheater. */
export function CaveScene({ picker }: { picker: ReactNode }) {
  const [role, setRole] = useState<Role>('verifier');
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [policy, setPolicy] = useState<Policy>('manual');
  const [calls, setCalls] = useState<readonly Side[]>(NO_SIDES);
  const [entered, setEntered] = useState<readonly Side[]>(NO_SIDES);
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [sim, setSim] = useState<ReturnType<typeof survival> | null>(null);

  const kind = proverKind(seed);
  const rounds = useMemo(() => answers(kind, seed, calls, policy), [kind, seed, calls, policy]);
  const m = meter(rounds);
  const game = cheaterGame(seed, entered);
  const decided = accepted !== null;
  const full = calls.length >= MAX_ROUNDS;
  const caught = m.failedAt !== null;
  const callsClosed = full || decided || caught;
  const enterClosed = game.caughtAt !== null || entered.length >= MAX_ROUNDS;

  const reset = () => {
    setCalls(NO_SIDES);
    setEntered(NO_SIDES);
    setAccepted(null);
    setSim(null);
  };
  const call = (side: Side) => setCalls(appendCall(kind, seed, policy, calls, side, decided));
  const enter = (side: Side) => {
    if (enterClosed) return;
    setEntered([...entered, side]);
  };

  const lastRound = rounds[rounds.length - 1];
  const intro =
    role === 'cheater'
      ? game.caughtAt !== null
        ? `Caught in round ${game.caughtAt}: you went ${SIDE_NAME[entered[game.caughtAt - 1]]} and the verifier called ${SIDE_NAME[verifierCall(seed, game.caughtAt - 1)]}. Surviving n rounds takes luck of probability 2^-n.`
        : entered.length === 0
          ? 'You do not know the passphrase. Choose a side to enter each round; the verifier calls a random side, and the first mismatch ends the game.'
          : `Survived ${game.survived} round${game.survived === 1 ? '' : 's'} by luck: the chance of surviving that many was 1/${2 ** game.survived}.`
      : verifierCaption(kind, rounds, accepted);

  return (
    <StageFrame
      height={560}
      intro={intro}
      introKey={`cave|${role}|${seed}|${policy}|${calls.join('')}|${entered.join('')}|${accepted}`}
      stats={
        <Stats>
          {role === 'verifier' ? (
            <>
              <Stat label="Rounds passed" value={`${m.passed} of ${calls.length}`} color={m.failedAt ? 'var(--bad)' : 'var(--ok)'} sub={m.failedAt ? `failed in round ${m.failedAt}` : 'in a row'} />
              <Stat label="Confidence 1 - 2^-n" value={m.value} color={m.struck ? 'var(--bad)' : 'var(--ok)'} sub={m.struck ? 'struck: your calls follow a pattern' : 'assuming unpredictable calls'} />
            </>
          ) : (
            <>
              <Stat label="Rounds survived" value={game.survived} color={game.caughtAt ? 'var(--bad)' : 'var(--ok)'} sub={game.caughtAt ? `caught in round ${game.caughtAt}` : 'by luck so far'} />
              <Stat label="Chance of surviving n rounds" value={`2^-n`} sub={`n = 5: ${2 ** -5} (3.1%)`} />
            </>
          )}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the side called', shape: 'line' },
            { color: 'var(--violet)', label: 'the prover and its secret', shape: 'dot' },
            { color: 'var(--ok)', label: 'a passed round', shape: 'square' },
            { color: 'var(--bad)', label: 'a caught prover or a refused meter', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented<Role> label="Role" options={ROLE_OPTIONS} value={role} onChange={(r) => { setRole(r); reset(); }} />
          <SeedField seed={seed} onSeed={(s) => { setSeed(s); reset(); }} />
        </>,
        role === 'verifier' ? (
          <>
            <Segmented<Policy> label="How you call" options={POLICY_OPTIONS} value={policy} onChange={(p) => { setPolicy(p); reset(); }} />
            {policy === 'manual' ? (
              <ControlGroup label="Call a side">
                <Button onClick={() => call('L')} softDisabled={callsClosed}>Left</Button>
                <Button onClick={() => call('R')} softDisabled={callsClosed}>Right</Button>
                <Button onClick={() => call(verifierCall(seed, calls.length))} softDisabled={callsClosed}>Random</Button>
              </ControlGroup>
            ) : (
              <Button onClick={() => call(policyCall(policy, calls.length, seed))} softDisabled={callsClosed}>Call the next round</Button>
            )}
            <Button variant="primary" onClick={() => setAccepted(true)} softDisabled={calls.length === 0 || decided}>Accept</Button>
            <Button onClick={() => setAccepted(false)} softDisabled={calls.length === 0 || decided}>Reject</Button>
            <Button onClick={reset}>Reset</Button>
            {full && <Hint tone="muted">That is {MAX_ROUNDS} rounds, the most this page plays: Accept, Reject or Reset.</Hint>}
            {caught && !decided && <Hint tone="muted">The prover was caught in round {m.failedAt}, so the calls stop: Accept, Reject or Reset.</Hint>}
          </>
        ) : (
          <>
            <ControlGroup label="Enter the cave by the">
              <Button onClick={() => enter('L')} softDisabled={enterClosed}>Left path</Button>
              <Button onClick={() => enter('R')} softDisabled={enterClosed}>Right path</Button>
            </ControlGroup>
            <Button onClick={() => setSim(survival(seed, GAME_ROUNDS, GAMES))}>Simulate {GAMES.toLocaleString('en-US')} seeded games of {GAME_ROUNDS} rounds</Button>
            <Button onClick={reset}>Reset</Button>
            {entered.length >= MAX_ROUNDS && game.caughtAt === null && <Hint tone="muted">That is {MAX_ROUNDS} rounds, the most this page plays: Reset to start again.</Hint>}
          </>
        ),
      ]}
    >
      <div className="stage-pad zk-stage">
        <CaveDrawing
          called={role === 'verifier' ? (calls[calls.length - 1] ?? null) : game.caughtAt ? verifierCall(seed, game.caughtAt - 1) : null}
          entered={role === 'cheater' ? (entered[entered.length - 1] ?? null) : decided && kind === 'cheater' ? (lastRound?.entered ?? null) : null}
          caught={role === 'cheater' ? game.caughtAt !== null : !!lastRound && !lastRound.passed}
        />
        {role === 'verifier' ? (
          <>
            <Bar value={m.value} max={1} tone={m.struck ? 'bad' : 'ok'} height={10} label={`confidence ${m.value}${m.struck ? ' (struck out: predictable calls)' : ''}`} ariaLabel="Confidence in the prover" />
            <div className="zk-rounds" role="list" aria-label="The rounds">
              {rounds.map((r, i) => (
                <span key={i} role="listitem" className={`zk-round ${r.passed ? 'is-ok' : 'is-bad'}`}>
                  {i + 1}: called {SIDE_NAME[r.call]}{decided && r.entered ? `, went ${SIDE_NAME[r.entered]}` : ''}: {r.passed ? 'came out' : 'stuck'}
                </span>
              ))}
            </div>
            <p className="zk-note">The prover is seeded (seed {seed}) and does not say whether it knows the passphrase until you decide. In this model a cheating prover guesses from your earlier calls: it repeats the side you called last (left in round 1), so it passes every round of a one-sided run and is caught at the first change, including strict alternation. A cleverer cheater could ride more patterns; this model only shows why the meter needs unpredictable calls. A run of {PATTERN_MIN} or more calls on one side or strictly alternating is flagged as struck; for fair random calls that false alarm has probability 2^-(n-2): {patternFalseAlarm(PATTERN_MIN) * 100}% at {PATTERN_MIN} calls, {(patternFalseAlarm(MAX_ROUNDS) * 100).toFixed(1)}% at {MAX_ROUNDS}.</p>
          </>
        ) : (
          <>
            <div className="zk-rounds" role="list" aria-label="Your rounds">
              {entered.map((s, i) => (
                <span key={i} role="listitem" className={`zk-round ${game.caughtAt !== null && i + 1 === game.caughtAt ? 'is-bad' : 'is-ok'}`}>
                  {i + 1}: you went {SIDE_NAME[s]}, called {SIDE_NAME[verifierCall(seed, i)]}
                </span>
              ))}
            </div>
            {sim && (
              <p className="zk-note">
                {sim.survived} of {sim.games.toLocaleString('en-US')} seeded games survived {sim.rounds} rounds, against {sim.expected} expected (2^-{sim.rounds} x {sim.games}); sigma is {sim.sigma.toFixed(1)} (seed {seed}), so within 3 sigma means between {(sim.expected - 3 * sim.sigma).toFixed(1)} and {(sim.expected + 3 * sim.sigma).toFixed(1)}: {sim.withinThreeSigma ? 'inside' : 'outside'}.
              </p>
            )}
          </>
        )}
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>the prover, the verifier and the cheater are seeded models: a real system uses a CSPRNG</Provenance>
        <Provenance kind="from-memory">the cave is the standard teaching story (Quisquater and others, 1989: verify the citation)</Provenance>
        <ClaimLabel kind="theorem">after n passed rounds with unpredictable calls a cheater slips through with probability 2^-n: argued, not run here; the page samples it over seeded games</ClaimLabel>
      </ProvenanceRow>
    </StageFrame>
  );
}
