import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal } from '../../core/format';
import { duelCaption, duelHint } from './captions';
import { livenessText } from '../../core/checkPhrases';
import { DUEL_BALLOTS, drainAccepts, replayDuel } from './duel';
import { ACCEPTORS, chosenPairs, isAcceptor } from './protocol';
import { BACKOFF_MAX_MS, DEFAULT_OPTIONS, LOSS_PERCENT, RETRY_TIMEOUT_MS, SEED_RANGE, SEEDS_TOTAL, cachedSweep } from './search';

const msText = (v: number | null) => (v === null ? 'none' : `${decimal(v, 1)} ms`);

export function DuelScene({ picker }: { picker: ReactNode }) {
  const [ballots, setBallots] = useState<number>(DUEL_BALLOTS.default);
  const [stopped, setStopped] = useState(false);
  const [loss, setLoss] = useState<number>(LOSS_PERCENT.min);
  const duel = useMemo(() => replayDuel(ballots), [ballots]);
  const after = useMemo(() => drainAccepts(duel.stopped), [duel]);
  const plain = useMemo(() => cachedSweep({ ...DEFAULT_OPTIONS, lossPercent: loss, backoff: false }), [loss]);
  const backoff = useMemo(() => cachedSweep({ ...DEFAULT_OPTIONS, lossPercent: loss, backoff: true }), [loss]);
  const sameRows = plain.decided === backoff.decided && plain.median === backoff.median && plain.p95 === backoff.p95;
  const shown = stopped ? after.session : duel.session;
  const chosen = chosenPairs(shown.nodes);
  const pendingAccepts = shown.pool.filter((m) => m.payload.type === 'accept').length;

  return (
    <StageFrame
      height={470}
      intro={duelCaption({ ballots, steps: duel.steps, votes: stopped ? after.votes : duel.votesCast, stopped, value: chosen[0]?.value ?? null, decided: plain.decided, seeds: plain.seeds, median: plain.median })}
      introKey={`${ballots}|${stopped}|${loss}`}
      stats={
        <Stats>
          <Stat label="Steps replayed" value={duel.steps} sub={`${ballots} ballots, ${duel.steps / ballots} steps each`} />
          <Stat label="Votes cast" value={stopped ? after.votes : duel.votesCast} color={stopped ? 'var(--ok)' : 'var(--dim)'} sub={stopped ? 'after the last Accept lands' : 'in the scripted duel'} />
          <Stat label="Chosen" value={chosen.length === 0 ? 'none' : chosen.map((c) => `${c.value} at ballot ${c.ballot}`).join(', ')} color={chosen.length === 0 ? 'var(--dim)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a promise' },
            { color: 'var(--dim)', label: 'an Accept that is refused' },
            { color: 'var(--violet)', label: 'a vote' },
            { color: 'var(--ok)', label: 'a chosen value' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Duelling ballots" value={ballots} min={DUEL_BALLOTS.min} max={DUEL_BALLOTS.max} format={(v) => `${v} ballots`} onChange={(v) => { setBallots(v); setStopped(false); }} />
          <Button onClick={() => setStopped(!stopped)}>{stopped ? 'Resume duelling' : 'Stop duelling'}</Button>
        </>,
        <>
          <Slider label="Message loss" value={loss} min={LOSS_PERCENT.min} max={LOSS_PERCENT.max} format={(v) => `${v}%`} onChange={setLoss} />
        </>,
      ]}
    >
      <div className="px-stage stage-pad">
        <Box>
          <SectionTitle hint="scripted, replayed through the protocol: not a found livelock">The duel</SectionTitle>
          <table className="data-table">
            <thead><tr><th>acceptor</th><th>promised</th><th>votes</th></tr></thead>
            <tbody>
              {ACCEPTORS.map((a) => {
                const s = shown.nodes[a];
                return isAcceptor(s) ? <tr key={a}><td>{a}</td><td>{s.promised}</td><td>{s.votes.length === 0 ? 'none' : s.votes.map(([b, v]) => `(${b}, ${v})`).join(' ')}</td></tr> : null;
              })}
            </tbody>
          </table>
          <Hint block>
            {duelHint({ stopped, refused: after.refused, chosen: chosen.map((c) => c.value), pendingAccepts, votes: duel.votesCast, steps: duel.steps })}
          </Hint>
        </Box>
        <Box>
          <SectionTitle hint={`${SEEDS_TOTAL} seeded schedules, seeds ${SEED_RANGE.from} to ${SEED_RANGE.to - 1}; retry timeout ${RETRY_TIMEOUT_MS} ms`}>Liveness, separately from safety</SectionTitle>
          <table className="data-table">
            <thead><tr><th>retry</th><th>decided</th><th>median</th><th>95th percentile</th></tr></thead>
            <tbody>
              <tr><td>fixed timeout</td><td>{plain.decided} of {plain.seeds}</td><td>{msText(plain.median)}</td><td>{msText(plain.p95)}</td></tr>
              <tr><td>randomised backoff (+0 to {BACKOFF_MAX_MS} ms)</td><td>{backoff.decided} of {backoff.seeds}</td><td>{msText(backoff.median)}</td><td>{msText(backoff.p95)}</td></tr>
            </tbody>
          </table>
          <Hint block>
            {livenessText(plain.seeds - plain.decided, plain.seeds, 'the end of the run')} with a fixed timeout and {livenessText(backoff.seeds - backoff.decided, backoff.seeds, 'the end of the run')} with backoff, at {loss}% loss. {sameRows ? 'The two rows are identical: backoff only changes a retry, and this setting needs none (raise the loss to see them differ). ' : ''}Random schedules usually decide; the duel above illustrates why Paxos alone does not promise to terminate.
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="scripted">the duel is a recorded schedule, replayed through the protocol</Provenance>
          <Provenance kind="simulated" seed={`${SEED_RANGE.from} to ${SEED_RANGE.to - 1}`}>liveness sampled over seeded schedules</Provenance>
          <ClaimLabel kind="standard">Paxos safety does not depend on timing; progress needs a stable proposer</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
