import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { refocusAfterRemove } from '../../core/refocus';
import { toneVar } from '../../core/tone';
import { counterexampleStart, poolCaption } from './captions';
import { exhaustiveText, sampledText, truncatedText } from '../../core/checkPhrases';
import type { NetState } from '../../core/pureProtocol';
import { ACCEPTORS, BUGS, PROPOSERS, RETRY_BALLOTS, chosenText, configFor, describeMessage, isAcceptor, isProposer, type Bug, type PaxosMsg, type PaxosState } from './protocol';
import {
  DEFAULT_OPTIONS, EXHAUSTIVE_BALLOTS, OFFSET_WINDOW_MS, SEED_RANGE, SEEDS_TOTAL, THREE_BALLOT_STATE_CAP, exhaustiveSearch, nodeRecord, runPaxosSeed, seedFor, sweepSeeds,
} from './search';
import { PRESETS, POOL_CAP, acceptNow, applyOp, replayOps, runSteps, type Op } from './session';

const TONE: Record<string, 'amber' | 'pink'> = { P1: 'amber', P2: 'pink' };
const BALLOT_OPTIONS = [
  { value: 'two' as const, label: '2 ballots (P1: 1, P2: 2)' },
  { value: 'three' as const, label: '3 ballots (P1: 1 and 3, P2: 2)' },
];
/** One step of a counterexample: each acceptor's promise and votes, and what is chosen. */
function traceState(state: NetState<PaxosState, PaxosMsg>): ReactNode {
  const nodes = nodeRecord(state);
  return (
    <ul className="px-trace">
      {ACCEPTORS.map((a) => {
        const s = nodes[a];
        return <li key={a}>{a}: {isAcceptor(s) ? `promised ${s.promised}, votes ${s.votes.map(([b, v]) => `${b}${v}`).join(' ') || 'none'}` : ''}</li>;
      })}
      <li><b>{chosenText(nodes)}</b></li>
    </ul>
  );
}

const BOUNDS_TWO = '3 acceptors, 2 proposers, ballots 1 and 2, messages may be reordered, delayed, duplicated or lost';

interface Searched {
  bug: Bug;
  ballots: 'two' | 'three';
  window: number;
}

export function PoolScene({ picker }: { picker: ReactNode }) {
  const [bug, setBug] = useState<Bug>('none');
  const [ops, setOps] = useState<Op[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [seed, setSeed] = useState(seedFor('none'));
  const [window, setWindow] = useState<number>(OFFSET_WINDOW_MS.default);
  const [ballots, setBallots] = useState<'two' | 'three'>('two');
  const [searched, setSearched] = useState<Searched | null>(null);

  const config = useMemo(() => configFor(RETRY_BALLOTS, bug), [bug]);
  const session = useMemo(() => replayOps(config, ops), [config, ops]);
  const exhaustive = useMemo(
    () => (searched ? exhaustiveSearch(EXHAUSTIVE_BALLOTS[searched.ballots], searched.bug, searched.ballots === 'three' ? THREE_BALLOT_STATE_CAP : undefined) : null),
    [searched],
  );
  const sweep = useMemo(() => (searched ? sweepSeeds({ ...DEFAULT_OPTIONS, bug: searched.bug, offsetWindowMs: searched.window }) : null), [searched]);
  const run = useMemo(() => runPaxosSeed({ ...DEFAULT_OPTIONS, bug, offsetWindowMs: window }, seed), [bug, window, seed]);
  const traceSteps = useMemo(() => (exhaustive?.violation?.path ?? []).map((p) => ({ actor: p.actor, text: p.text, state: p.state })), [exhaustive]);

  const act = (op: Op) => {
    const r = applyOp(session, op);
    if (r.ok) {
      setOps([...ops, op]);
      setMessage(null);
    } else setMessage({ ok: false, text: r.reason });
  };
  const chooseBug = (next: Bug) => {
    setBug(next);
    setOps([]);
    setMessage(null);
    setSeed(seedFor(next));
    setSearched(null);
  };
  const bugLabel = bug === 'none' ? null : (BUGS.find((b) => b.value === bug)?.label ?? null);
  const chosen = chosenText(session.nodes);
  const refusal = message && !message.ok ? message.text : null;
  const caption = poolCaption({ session, steps: ops.length, refusal, bugLabel });

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={`${bug}|${ops.length}|${message?.text ?? ''}|${session.note}`}
      stats={
        <Stats>
          <Stat label="Verdict" value={chosen} color={chosen === 'chosen: none' ? 'var(--dim)' : chosen.includes(',') ? 'var(--bad)' : 'var(--ok)'} sub="computed from the acceptors' votes" />
          <Stat label="Steps" value={ops.length} sub="starts, deliveries, drops, duplicates" />
          <Stat label="In flight" value={session.pool.length} sub={`pool cap ${POOL_CAP}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a promise' },
            { color: 'var(--violet)', label: 'an accept that became a vote' },
            { color: 'var(--ok)', label: 'a chosen value' },
            { color: 'var(--bad)', label: 'two chosen values, or a dropped message' },
            { color: 'var(--hi)', label: 'the message being delivered' },
            { color: 'var(--dim)', label: 'an accept that was refused' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Protocol" options={BUGS} value={bug} onChange={chooseBug} />
        </>,
        <>
          {PRESETS.map((p) => (
            <ChipButton key={p.id} tone="violet" onClick={() => { setOps(runSteps(config, p.steps).ops); setMessage(null); }}>
              {p.label}
            </ChipButton>
          ))}
          <Button onClick={() => { setOps(ops.slice(0, -1)); setMessage(null); }} softDisabled={ops.length === 0}>Undo</Button>
          <Button onClick={() => { setOps([]); setMessage(null); }}>Reset</Button>
        </>,
        <>
          <Segmented label="Search" options={BALLOT_OPTIONS} value={ballots} onChange={setBallots} />
          <Slider label="P2 starts up to" value={window} min={OFFSET_WINDOW_MS.min} max={OFFSET_WINDOW_MS.max} step={5} format={(v) => `${v} ms later`} onChange={setWindow} />
          <SeedField seed={seed} onSeed={setSeed} />
          <Button variant="primary" onClick={() => setSearched({ bug, ballots, window })}>Try to break it</Button>
        </>,
      ]}
    >
      <div className="px-stage stage-pad">
        <div className="px-nodes">
          {ACCEPTORS.map((a) => {
            const s = session.nodes[a];
            return (
              <Box key={a} className="px-node" style={{ '--c': 'var(--sky)' } as CSSProperties}>
                <SectionTitle className="px-title">{a}</SectionTitle>
                <div className="px-line">{isAcceptor(s) ? `promised ${s.promised}` : ''}</div>
                <div className="px-line">{isAcceptor(s) && s.votes.length > 0 ? s.votes.map(([b, v]) => `vote ${b} ${v}`).join(', ') : 'no vote yet'}</div>
              </Box>
            );
          })}
          {PROPOSERS.map((p) => {
            const s = session.nodes[p];
            return (
              <Box key={p} className="px-node px-start" style={{ '--c': toneVar(TONE[p]) } as CSSProperties}>
                <SectionTitle className="px-title" hint={p === 'P1' ? 'wants A' : 'wants B'}>{p}</SectionTitle>
                <div className="px-line">{isProposer(s) ? `ballot ${s.ballot === 0 ? 'none' : s.ballot}, ${s.phase}` : ''}</div>
                <div className="px-line">{isProposer(s) ? `promises ${s.promises.length} of ${ACCEPTORS.length}${s.proposed ? `, proposes ${s.proposed}` : ''}` : ''}</div>
                <Button onClick={() => act({ kind: 'start', proposer: p })}>{isProposer(s) && s.started > 0 ? `${p} retry with a higher ballot` : `${p} start`}</Button>
                <Button onClick={() => { setMessage(acceptNow(session, p)); }}>{p} send Accept now</Button>
              </Box>
            );
          })}
        </div>
        {message?.ok && <Hint block>{message.text}</Hint>}
        <Box>
          <SectionTitle hint="you are the network: deliver, drop or duplicate any message">Messages in flight</SectionTitle>
          <div className="px-pool">
            {session.pool.length === 0 && <Hint block>Nothing in flight: press a proposer's start button.</Hint>}
            {session.pool.map((m) => (
              <div key={m.id} className="px-msg">
                <span className="chip tone-info mono">{m.from} to {m.to}: {describeMessage(m.payload)}</span>
                {(['deliver', 'drop', 'duplicate'] as const).map((kind) => (
                  <Button
                    key={kind}
                    onClick={(e) => {
                      if (kind !== 'duplicate') refocusAfterRemove(e.currentTarget, { group: '.px-pool', fallback: '.px-start button' });
                      act({ kind, id: m.id });
                    }}
                  >
                    {kind === 'deliver' ? 'Deliver' : kind === 'drop' ? 'Drop' : 'Duplicate'}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </Box>
        <Hint block>
          Seeded schedule {seed}{bug === 'none' ? '' : ' with the planted bug'}: {run.violation ? <span className="hl bad wrap">{run.violation}</span> : run.decidedAt === null ? 'no value chosen by the end of the run' : `${run.value} chosen at ${Math.round(run.decidedAt)} ms, and at most one value chosen after every event`}.
        </Hint>
        {exhaustive && sweep && searched && (
          <Box>
            <SectionTitle hint={searched.bug === 'none' ? 'the correct protocol' : (BUGS.find((b) => b.value === searched.bug)?.label ?? '')}>Try to break it: both checks</SectionTitle>
            <div className="px-line">
              <b>Exhaustive:</b>{' '}
              {exhaustive.violation
                ? `${exhaustive.violation.message}: the shortest counterexample has ${exhaustive.violation.path.length} steps (found after ${integer(exhaustive.states)} states)`
                : exhaustive.truncated
                  ? truncatedText(exhaustive.states)
                  : exhaustiveText(exhaustive.states, searched.ballots === 'two' ? BOUNDS_TWO : '3 acceptors, 2 proposers, 3 ballots')}
              .
            </div>
            {!exhaustive.violation && !exhaustive.truncated && (
              <div className="px-line">Chosen in {integer(exhaustive.chosenA)} states (A), {integer(exhaustive.chosenB)} (B) and neither in {integer(exhaustive.none)}; no state has both.</div>
            )}
            <div className="px-line">
              <b>Sampled:</b>{' '}
              {sweep.failing.length === 0
                ? sampledText(SEEDS_TOTAL, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1)
                : `fails on ${sweep.failing.length} of ${SEEDS_TOTAL} seeds (${SEED_RANGE.from} to ${SEED_RANGE.to - 1}); lowest failing seed ${sweep.lowestFailing}: ${sweep.message}`}
              . Delay 1 to 10 ms, duplication, one acceptor cut off for a while, P2 starting up to {searched.window} ms late.
            </div>
            {!exhaustive.violation && !exhaustive.truncated && (
              <Hint block>
                This explored every schedule of 3 acceptors, 2 proposers and {searched.ballots === 'two' ? '2' : '3'} ballots. The proof that holds for any number of ballots is the intersection argument below, which this check supports and does not replace.
              </Hint>
            )}
            {exhaustive.violation && (
              <TracePlayer
                initial={exhaustive.init}
                steps={traceSteps}
                startText={counterexampleStart({ bugLabel: BUGS.find((b) => b.value === searched.bug)?.label ?? null, steps: exhaustive.violation.path.length, message: exhaustive.violation.message })}
                label="Steps of the shortest counterexample"
                renderState={traceState}
              />
            )}
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded runs on distSim; the search covers every schedule of its bounds</Provenance>
          <Provenance kind="toy">single-decree Paxos, 3 acceptors, silent rejections</Provenance>
          <ClaimLabel kind="standard">the intersection argument: any two majorities share an acceptor</ClaimLabel>
          <Provenance kind="from-memory">Lamport: the Part-Time Parliament (1998, written about 1989) and Paxos Made Simple (2001); check both</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
