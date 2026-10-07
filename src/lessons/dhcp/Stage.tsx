import { useMemo, useState, type ReactNode } from 'react';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram, type SequenceMessage } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { humanDuration } from '../../core/format';
import { mulberry32 } from '../../core/random';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { introFor, leaseIntro, sceneFrames, blankStart, type DhcpFrame } from './frames';
import {
  doraScene, exhaustedScene, leaseScene, leaseTimers, relayScene, twoServersScene, type Config, type FieldKey, type FieldState,
  type PoolView, type Scene, type SlotStatus,
} from './model';
import './styles.css';

type SceneId = 'dora' | 'two' | 'exhausted' | 'relay' | 'lease';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'dora', label: 'DORA' },
  { value: 'two', label: 'Two servers' },
  { value: 'exhausted', label: 'Pool empty' },
  { value: 'relay', label: 'Relay' },
  { value: 'lease', label: 'Lease clock' },
];

const STEP_MS = 1500;
/** Seed for the link-local pick, so the scene (and its screenshots) are reproducible. */
const APIPA_SEED = 7;
const HOUR = 3600;
/** The clock shows one and a half leases, so a renewed lease is visible past the first expiry. */
const CLOCK_SPAN = 1.5;
/** Narrowest width where the T2 and end markers' labels stay apart. */
const CLOCK_MIN_W = 520;
const HONEST = 'Scripted exchange with made-up MAC addresses; timings are compressed (a 24-hour lease runs in seconds).';

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'dora' });
  if (scene === 'lease') return <LeaseScene picker={picker} />;
  return <ExchangeScene key={scene} id={scene} picker={picker} />;
}

const BUILD: Record<Exclude<SceneId, 'lease'>, () => Scene> = {
  dora: () => doraScene(),
  two: () => twoServersScene(),
  exhausted: () => exhaustedScene(mulberry32(APIPA_SEED)),
  relay: () => relayScene(),
};

const ladder = (scene: Scene): SequenceMessage[] =>
  scene.steps.map((s) => ({ id: s.id, from: s.from, to: s.to, label: s.label, note: s.note, lost: s.lost, tone: s.tone }));

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'broadcast' },
      { color: 'var(--violet)', label: 'unicast' },
      { color: 'var(--hi)', label: 'current message' },
      { color: 'var(--ok)', label: 'ACK / configured' },
    ]}
  />
);

function ExchangeScene({ id, picker }: { id: Exclude<SceneId, 'lease'>; picker: ReactNode }) {
  const scene = useMemo(() => BUILD[id](), [id]);
  const frames = useMemo(() => sceneFrames(scene, introFor(id), blankStart(scene.steps[0].pools)), [scene, id]);
  const messages = useMemo(() => ladder(scene), [scene]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const current = f.step >= 0 ? scene.steps[f.step] : null;

  return (
    <StageFrame player={player} height={340} legend={LEGEND} controls={[<>{picker}</>]}>
      <div className="stage-pad dh">
        <div className="dh-main">
          <div className="dh-ladder">
            <SequenceDiagram actors={scene.actors} messages={messages} step={f.step} ariaLabel={`DHCP exchange: ${SCENES.find((s) => s.value === id)!.label}`} />
          </div>
          <ConfigPanel config={f.config} />
        </div>
        {current?.event === 'apipa' && <ApipaNote />}
        <Pools pools={f.pools} />
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

// ── Lease clock ─────────────────────────────────────────────────────────

function LeaseScene({ picker }: { picker: ReactNode }) {
  const [hours, setHours] = useState(24);
  const [serverUp, setServerUp] = useState(true);
  const lease = hours * HOUR;
  const scene = useMemo(() => leaseScene(lease, serverUp), [lease, serverUp]);
  const frames = useMemo<DhcpFrame[]>(
    () => sceneFrames(scene, leaseIntro(lease, serverUp), { config: scene.steps[0].config, pools: scene.steps[0].pools, t: 0 }),
    [scene, lease, serverUp],
  );
  const messages = useMemo(() => ladder(scene), [scene]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const { t1, t2, expiry } = leaseTimers(lease);
  const renewed = serverUp && f.step >= 1;
  const expired = !serverUp && f.step === scene.steps.length - 1;
  /** The clock is drawn in hours; the model counts seconds. */
  const h = (seconds: number) => seconds / HOUR;
  const domain: [number, number] = [0, h(lease * CLOCK_SPAN)];

  return (
    <StageFrame
      player={player}
      height={340}
      legend={LEGEND}
      controls={[
        <>
          {picker}
          <Toggle label="At renewal the server is" value={serverUp} onChange={setServerUp} off="Down" on="Up" />
        </>,
        <Slider key="lease" label="Lease" value={hours} min={1} max={24} onChange={setHours} format={(h) => humanDuration(h * HOUR)} />,
      ]}
    >
      <div className="stage-pad dh">
        <SectionTitle weight="regular" hint={`now: ${humanDuration(f.t)} in (compressed)`}>Lease clock</SectionTitle>
        <WideRegion minWidth={CLOCK_MIN_W} label="Lease clock: scroll sideways to see all of it">
        <GanttLanes
          lanes={[{ id: 'lease', label: 'lease' }]}
          bars={[
            { id: 'first', lane: 'lease', start: 0, end: h(renewed ? t1 : expiry), tone: expired ? 'bad' : 'ok', label: expired ? 'expired' : 'bound' },
            ...(renewed ? [{ id: 'renewed', lane: 'lease', start: h(t1), end: h(t1 + lease), tone: 'ok' as Tone, label: 'renewed' }] : []),
          ]}
          domain={domain}
          now={h(f.t)}
          markers={[
            { at: h(t1), label: 'T1', tone: 'violet' },
            { at: h(t2), label: 'T2', tone: 'info' },
            { at: h(expiry), label: 'end', tone: 'bad' },
          ]}
          unit=" h"
          axis
          size="md"
          labelWidth={56}
          ariaLabel={`Lease of ${humanDuration(lease)}: T1 at ${humanDuration(t1)}, T2 at ${humanDuration(t2)}`}
          className="dh-clock"
        />
        </WideRegion>
        <Hint block>Hours since the lease began. T1 (renew) at 50% and T2 (rebind) at 87.5% of the lease, the RFC 2131 defaults; end = expiry.</Hint>
        <div className="dh-main">
          <div className="dh-ladder">
            <SequenceDiagram actors={scene.actors} messages={messages} step={f.step} ariaLabel="Lease renewal" />
          </div>
          <ConfigPanel config={f.config} />
        </div>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

// ── Side panels ─────────────────────────────────────────────────────────

const FIELDS: { key: FieldKey; label: string }[] = [
  { key: 'ip', label: 'IP address' },
  { key: 'mask', label: 'Subnet mask' },
  { key: 'router', label: 'Router' },
  { key: 'dns', label: 'DNS server' },
  { key: 'lease', label: 'Lease' },
];
const FIELD_TONE: Record<FieldState, string> = { empty: 'dh-empty', offered: 'dh-offered', set: 'tone-ok', 'link-local': 'tone-orange' };

/** The laptop's interface settings, filling in as the exchange goes. */
function ConfigPanel({ config }: { config: Config }) {
  return (
    <div className="dh-config">
      <SectionTitle weight="regular">Laptop's interface</SectionTitle>
      <table className="data-table">
        <tbody>
          {FIELDS.map(({ key, label }) => {
            const f = config[key];
            return (
              <tr key={key}>
                <th scope="row">{label}</th>
                <td className={`dh-field ${FIELD_TONE[f.state]}`}>
                  {f.value || '–'}
                  {f.state === 'offered' && <span className="dh-tag">offered</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

const SLOT_TONE: Record<SlotStatus, Tone> = { free: 'muted', offered: 'info', leased: 'violet' };

/** Each server's pool: every address as a chip, free, offered or leased. */
function Pools({ pools }: { pools: readonly PoolView[] }) {
  return (
    <div className="dh-pools">
      {pools.map((p) => (
        <div key={p.label} className="dh-pool">
          <span className="dh-pool-label">{p.label}</span>
          <div className="dh-pool-chips" role="list" aria-label={`Pool of ${p.label}`}>
            {p.pool.addrs.map((a) => {
              const s = p.pool.slots[a];
              return (
                <span key={a} role="listitem" className={`chip tone-${SLOT_TONE[s.status]} dh-slot is-${s.status}`} title={`${a}: ${s.status}`}>
                  .{a.split('.')[3]} <span className="dh-slot-status">{s.status}</span>
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function ApipaNote() {
  return (
    <p className="dh-apipa">
      <b>Why your laptop says 169.254…</b> No DHCP server answered, so it gave itself a link-local address. That's enough to reach a printer on
      the same link, but with no router and no DNS there's no internet. Fix the DHCP side (a full pool, a dead server, a missing relay), then
      reconnect.
    </p>
  );
}
