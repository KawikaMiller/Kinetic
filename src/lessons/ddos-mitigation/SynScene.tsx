import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import type { Frame } from '../../core/types';
import { synCaption } from './captions';
import { initialSyn, type SynUi } from './init';
import { COOKIE_SLOT_TICKS, DRAIN_RATE, FLOOD_RANGE, HANDSHAKE_TUPLE, HOLD_TICKS, MODE_NAME, RUN_TICKS, SLOTS, cookieFor, runSyn, type Mode } from './syn';

const SAMPLE_EVERY = 4;
const PLAY_MS = 90;
const MODES: Mode[] = ['plain', 'cookies', 'broken'];

interface SynFrame extends Frame {
  tick: number;
}

export function SynScene({ picker }: { picker: ReactNode }) {
  const [u, setU] = useState<SynUi>(initialSyn);
  const { sim, final } = useMemo(() => runSyn({ seed: u.seed, flood: u.flood, mode: u.mode }), [u.seed, u.flood, u.mode]);
  const frames = useMemo<SynFrame[]>(() => {
    const ticks = Array.from({ length: Math.floor(RUN_TICKS / SAMPLE_EVERY) + 1 }, (_, i) => i * SAMPLE_EVERY);
    return ticks.map((tick) => ({ tick, say: synCaption(u.mode, sim.history[tick], tick), quiet: true }));
  }, [sim, u.mode]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: false });
  const tick = player.frame.tick;
  const s = sim.history[tick];
  const cookie = cookieFor(HANDSHAKE_TUPLE, 0).toString(16).padStart(8, '0');
  const ladder = useMemo(
    () => ({
      actors: [{ id: 'client', label: 'client' }, { id: 'server', label: 'server' }],
      messages: [
        { id: 'syn', from: 'client', to: 'server', label: 'SYN' },
        { id: 'synack', from: 'server', to: 'client', label: u.mode !== 'plain' ? `SYN-ACK, cookie ${cookie}` : 'SYN-ACK' },
        { id: 'ack', from: 'client', to: 'server', label: u.mode !== 'plain' ? 'ACK, cookie + 1' : 'ACK' },
      ],
    }),
    [u.mode, cookie],
  );

  return (
    <StageFrame
      height={520}
      player={player}
      stats={
        <Stats>
          <Stat label="Half-open slots in use" value={`${s.table.length} of ${SLOTS}`} color={s.table.length === SLOTS ? 'var(--bad)' : u.mode === 'cookies' ? 'var(--ok)' : undefined} sub={[`a toy table; entries are forgotten after ${HOLD_TICKS} ticks`]} />
          <Stat label="Legitimate handshakes" value={`${s.completed} done`} color="var(--ok)" sub={[`${s.started} started, ${s.dropped} refused`]} />
          <Stat label="Flood attempts" value={s.floodSeen} sub={[`about ${sig(u.flood)} a tick; the table drains ${sig(DRAIN_RATE)} a tick`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'an entry from an abstract flood source that never answers' },
            { color: 'var(--info)', label: 'a legitimate handshake in progress' },
            { color: 'var(--ok)', label: 'a stateless cookie handshake' },
            { color: 'var(--dim)', label: 'a free slot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Server" value={u.mode} onChange={(mode: Mode) => setU((x) => ({ ...x, mode }))} options={MODES.map((m) => ({ value: m, label: MODE_NAME[m] }))} />
          <Button onClick={() => setU(initialSyn())}>Reset</Button>
        </>,
        <>
          <Slider label="Flood rate" value={u.flood} {...FLOOD_RANGE} format={(v) => `${sig(v)} per tick`} onChange={(flood) => setU((x) => ({ ...x, flood }))} />
          <SeedField seed={u.seed} onSeed={(seed) => setU((x) => ({ ...x, seed }))} />
        </>,
      ]}
    >
      <div className="dd-stage stage-pad">
        <Box>
          <SectionTitle hint="eight toy slots">The half-open table</SectionTitle>
          <div className="dd-slots" role="img" aria-label={`${s.table.length} of ${SLOTS} half-open slots in use`}>
            {Array.from({ length: SLOTS }, (_, i) => {
              const e = s.table[i];
              return <span key={i} className={`dd-slot ${e ? (e.kind === 'flood' ? 'is-flood' : 'is-legit') : u.mode === 'cookies' ? 'is-cookie' : 'is-free'}`}>{e ? (e.kind === 'flood' ? 'flood' : 'legit') : u.mode === 'cookies' ? 'none kept' : 'free'}</span>;
            })}
          </div>
        </Box>
        <Box>
          <SectionTitle hint={u.mode === 'cookies' ? 'the server keeps no state after the SYN-ACK' : u.mode === 'broken' ? 'cookies are sent, but an entry is taken from the SYN anyway' : 'the server keeps an entry from the SYN'}>The handshake</SectionTitle>
          <WideRegion minWidth={360} label="Handshake ladder: scroll sideways to see all of it">
            <SequenceDiagram actors={ladder.actors} messages={ladder.messages} ariaLabel="A legitimate three-way handshake" />
          </WideRegion>
          <p className="dd-note">
            Under cookies the sequence number in the SYN-ACK is a toy keyed hash of the four-tuple and a {COOKIE_SLOT_TICKS}-tick time slot; the server recomputes it from the ACK and accepts the current slot or the one before. A source that never answers has no ACK to check, so no state is created, unless a slot is taken before the cookie is checked (the bug mode).
          </p>
        </Box>
        <Hint tone="muted" block>
          Without cookies, every SYN takes a slot for {HOLD_TICKS} ticks. A flood above {sig(DRAIN_RATE)} a tick leaves the table full much of the time, and the higher it goes the more legitimate SYNs find no room. The flood here is only a rate: nothing is sent.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={u.seed}>{RUN_TICKS} ticks on core/simTick; the run for this seed ended with {final.dropped} legitimate handshakes refused</Provenance>
          <Provenance kind="toy">the cookie hash, the table size and the timings are toys</Provenance>
          <Provenance kind="from-memory">real SYN cookies lose some TCP options, a known trade-off; verify the details</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
