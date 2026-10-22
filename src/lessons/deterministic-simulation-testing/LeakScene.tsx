import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { BookingDiagram } from './BookingDiagram';
import { FIX_HUNT_N, initialLeak, randomText, type LeakState } from './init';
import { REPLAYS, defaultBooking, hunt, liveHunt, liveReplays, replayAgreement, resetAmbient, runBooking, type BookingSetup } from './model';

const SHOWN_REPLAYS = 6;

const legend = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'a trace hash that matches the previous replay' },
      { color: 'var(--bad)', label: 'a trace hash that does not' },
      { color: 'var(--orange)', label: 'the leak switch (a labelled actor)' },
      { color: 'var(--violet)', label: 'the fix' },
    ]}
  />
);

export function LeakScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<LeakState>(initialLeak);
  const setup = useMemo<BookingSetup>(() => ({ ...defaultBooking(s.seed), mode: s.fix ? 'single-writer' : 'async', leak: s.leak }), [s.seed, s.fix, s.leak]);
  const patch = (p: Partial<LeakState>) => setS((x) => ({ ...x, ...p, replays: [], twenty: null, compare: null, fixHunt: null }));
  const view = useMemo(() => runBooking({ ...setup, leak: false }), [setup]);
  // The replays read and advance the leak counter, so they run in the event handler, never inside a state updater (React may call an updater twice).
  const replayOnce = () => {
    const hash = runBooking(setup).hash;
    setS((x) => ({ ...x, replays: [...x.replays, hash].slice(-SHOWN_REPLAYS) }));
  };
  const replayTwenty = () => {
    const r = replayAgreement(setup);
    setS((x) => ({ ...x, twenty: { agree: r.agree, failed: r.failed } }));
  };
  const compare = () => {
    resetAmbient();
    const base = defaultBooking();
    const seeded = hunt(base, 1, FIX_HUNT_N);
    const first = seeded.failures[0];
    const seededReplays = first === undefined ? 0 : replayAgreement({ ...base, seed: first }).failed;
    const live = liveHunt(base, FIX_HUNT_N);
    const result = { seeded: { tries: seeded.triesToFirst, replayed: seededReplays }, live: { ...live, replayed: liveReplays(base) } };
    setS((x) => ({ ...x, compare: result }));
  };
  const fixHunt = () => setS((x) => ({ ...x, fixHunt: { failures: hunt(setup, 1, FIX_HUNT_N).failures.length, n: FIX_HUNT_N } }));

  return (
    <StageFrame
      height={600}
      intro={`Seed ${s.seed} is a failing schedule. ${s.leak ? 'With ambient randomness on, a node reads a counter that outlives the run, so each replay is a different run.' : 'The seed is the whole input, so a replay is the same run.'} ${s.fix ? 'All bookings go through r1, which alone grants.' : ''}`.trim()}
      introKey={`${s.seed}|${s.leak}|${s.fix}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="Replay agreement" value={s.twenty === null ? '–' : `${s.twenty.agree} of ${REPLAYS}`} color={s.twenty === null ? undefined : s.twenty.agree === REPLAYS ? 'var(--ok)' : 'var(--bad)'} sub="replays with the same trace hash as the first" />
          <Stat label="Failure replays" value={s.twenty === null ? '–' : `${s.twenty.failed} of ${REPLAYS}`} sub="replays of this seed that broke the rule" />
          <Stat label={`Hunt of ${FIX_HUNT_N} seeds`} value={s.fixHunt === null ? '–' : `${s.fixHunt.failures} failed`} color={s.fixHunt === null ? undefined : s.fixHunt.failures === 0 ? 'var(--ok)' : 'var(--bad)'} sub={s.fix ? 'single writer: bookings through r1' : 'independent grants'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Ambient randomness" value={s.leak} onChange={(leak) => { resetAmbient(); patch({ leak }); }} off="Off: the seed is everything" on="On: r2 reads a counter" />
          <Toggle label="Bookings" value={s.fix} onChange={(fix) => patch({ fix })} off="Independent grants" on="All through r1 (single writer)" />
        </>,
        <>
          <SeedField seed={s.seed} onSeed={(seed) => patch({ seed })} />
          <Button variant="primary" onClick={replayOnce}>Replay seed</Button>
          <Button onClick={replayTwenty}>Replay 20 times</Button>
          <Button onClick={fixHunt}>Hunt {FIX_HUNT_N} seeds</Button>
          <Button onClick={compare}>Seeded hunt versus live chaos</Button>
          <Button onClick={() => { resetAmbient(); setS(initialLeak()); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="dst-stage stage-pad">
        <Box>
          <SectionTitle hint="trace hash of each press of Replay seed, newest last">Replays</SectionTitle>
          <div className="dst-hashes">
            {s.replays.length === 0 && <Hint tone="muted" block>Press Replay seed.</Hint>}
            {s.replays.map((hash, i) => (
              <span key={i} className={`dst-hash ${i > 0 && hash === s.replays[i - 1] ? 'is-same' : i > 0 ? 'is-diff' : ''}`}>
                <code>{hash}</code>
              </span>
            ))}
          </div>
        </Box>
        <Box>
          <SectionTitle hint="the same failure probability found two ways">Seeded hunt versus live chaos</SectionTitle>
          {s.compare === null ? (
            <Hint tone="muted" block>Press "Seeded hunt versus live chaos". Both rows draw schedules that fail with the same probability; only one can be replayed.</Hint>
          ) : (
            <table className="data-table dst-table">
              <thead>
                <tr><th>How the schedule is chosen</th><th>Tried until first failure</th><th>Failure replays</th></tr>
              </thead>
              <tbody>
                <tr><th scope="row" className="keep-case">seeded hunt</th><td>{s.compare.seeded.tries ?? 'none'}</td><td>{s.compare.seeded.replayed} of {REPLAYS}</td></tr>
                <tr><th scope="row" className="keep-case">live chaos (fresh schedule each run)</th><td>{s.compare.live.failedWith === null ? 'none' : s.compare.live.tries}</td><td>{s.compare.live.replayed} of {REPLAYS}</td></tr>
              </tbody>
            </table>
          )}
          <p className="dst-note">The live row draws each run's schedule from {randomText}. A failure found that way cannot be asked for again; a seed can.</p>
        </Box>
        <Box>
          <SectionTitle hint={`the schedule of seed ${s.seed}, with the leak off`}>The failing run</SectionTitle>
          <BookingDiagram run={view} />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>the same two-replica booking system on the distSim harness</Provenance>
          <Provenance kind="simulated">the leak switch is {randomText}</Provenance>
          <Provenance kind="toy">a deliberately small bug, not a real booking system</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
