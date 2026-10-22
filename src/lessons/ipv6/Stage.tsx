import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { BitStrip } from '../../components/BitStrip';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { chunkGroups } from '../../core/bits';
import { useIntroCaption } from '../../core/caption';
import { power, superscript } from '../../core/format';
import { mulberry32 } from '../../core/random';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { SLAAC_ACTORS, compressFrames, raceFrames, slaacAddresses, slaacFrames, slaacMessages, type CompressFrame, type IidMode, type Rule } from './frames';
import {
  ATTEMPT_DELAY_MS, EXAMPLE_MAC, PRESETS, RACE, TYPE_LABEL, addressBits, approx, classify, eui64, fieldOfBit, formatCanonical, formatFull, groupParts,
  happyEyeballs, parseIPv6, randomIid, zeroRun, type CompressStage, type Field, type Hextets,
} from './model';
import './styles.css';

type SceneId = 'address' | 'slaac' | 'dual';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'address', label: 'Address' },
  { value: 'slaac', label: 'SLAAC' },
  { value: 'dual', label: 'Dual stack' },
];

const FIELD_TONE: Record<Field, Tone> = { site: 'info', subnet: 'violet', iid: 'orange' };
const FIELD_LEGEND = [
  { color: 'var(--info)', label: '/48 site prefix' },
  { color: 'var(--violet)', label: 'subnet ID (to /64)' },
  { color: 'var(--orange)', label: 'interface ID' },
];
const STEP_MS = 1400;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'address' });
  if (scene === 'slaac') return <SlaacScene picker={picker} />;
  if (scene === 'dual') return <DualScene picker={picker} />;
  return <AddressScene picker={picker} />;
}

/** The 128 bits in eight 16-bit groups, coloured by field and labelled with each group's hex. */
function AddressBits({ h, ariaLabel }: { h: Hextets; ariaLabel: string }) {
  return (
    <div className="v6-bits">
      <BitStrip
        bits={addressBits(h)}
        groups={chunkGroups(128, 16, { label: (k) => h[k].toString(16).padStart(4, '0') })}
        toneOf={(i) => FIELD_TONE[fieldOfBit(i)]}
        size="sm"
        ariaLabel={ariaLabel}
      />
    </div>
  );
}

// ── Address: compress / expand, type, bits ──────────────────────────────

const RULES: { n: Rule; text: string }[] = [
  { n: 1, text: 'Lowercase hex, 8 groups of 16 bits' },
  { n: 2, text: 'Drop leading zeros in each group' },
  { n: 3, text: 'The longest run of 2+ zero groups becomes "::" (the first if tied, once only)' },
];

function AddressScene({ picker }: { picker: ReactNode }) {
  const [h, setH] = useState<number[]>(() => {
    const r = parseIPv6(PRESETS[0].text);
    return r.ok ? r.value : [];
  });
  const [draft, setDraft] = useState(PRESETS[0].text);
  const [error, setError] = useState<string | null>(null);
  const [compressed, setCompressed] = useState(false);
  const [moved, setMoved] = useState(false);
  useIntroCaption(<>The address is shown in full: 8 groups of 4 hex digits. Switch "Show" to Compressed to watch the RFC 5952 rules shorten it.</>);

  const frames = useMemo<CompressFrame[]>(
    () => (moved ? compressFrames(h, compressed) : [{ stage: compressed ? 2 : 0, rule: 0 }]),
    [h, compressed, moved],
  );
  const player = usePlayer(frames, { interval: STEP_MS });
  const { stage, rule } = player.frame;

  const submit = () => {
    const r = parseIPv6(draft);
    if (!r.ok) return setError(r.error);
    setError(null);
    setH(r.value);
  };
  const load = (text: string) => {
    const r = parseIPv6(text);
    if (!r.ok) return;
    setDraft(text);
    setError(null);
    setH(r.value);
  };
  const type = classify(h);
  const v4 = approx(32);
  const v6 = approx(128);

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Canonical" value={<span className="v6-canon">{formatCanonical(h)}</span>} sub="RFC 5952" />
          <Stat label="Type" value={<span className="chip tone-sky v6-type">{TYPE_LABEL[type]}</span>} />
        </Stats>
      }
      legend={<Legend items={[...FIELD_LEGEND, { color: 'var(--dim)', label: 'zeros being removed' }, { color: 'var(--hi)', label: 'rule applied now', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Show" value={compressed} onChange={(v) => { setCompressed(v); setMoved(true); }} off="Full" on="Compressed" />
        </>,
        <>
          <TextField label="IPv6 address" value={draft} onChange={setDraft} onEnter={submit} width={330} maxLength={60} spellCheck={false} />
          <Button onClick={submit} disabled={!draft.trim()}>Set</Button>
          {error && <Hint tone="bad">{error}</Hint>}
        </>,
        <ControlGroup key="presets" label="Presets">
          {PRESETS.map((p) => (
            <ChipButton key={p.label} on={draft === p.text} onClick={() => load(p.text)}>{p.label}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad v6">
        <AddressText h={h} stage={stage} rule={rule} />
        <ol className="v6-rules">
          {RULES.map((r) => (
            <li key={r.n} className={r.n === rule ? 'is-current' : ''}>{r.text}{r.n === 3 && !zeroRun(h) ? ' (no such run here)' : ''}</li>
          ))}
        </ol>
        <AddressBits h={h} ariaLabel={`${formatFull(h)} as 128 bits`} />
        <div className="v6-nat">
          <SectionTitle weight="regular">No NAT needed</SectionTitle>
          <p>
            IPv4 has {power(32)} ≈ {v4.mantissa} × 10{superscript(v4.exponent)} addresses, fewer than there are phones. IPv6 has {power(128)} ≈{' '}
            {v6.mantissa} × 10{superscript(v6.exponent)}, {power(96)} times as many: every device can have its own global address, so there is
            nothing to translate. What decides what can reach you is now the firewall, not NAT.
          </p>
        </div>
        <Hint block>Addresses here are parsed and formatted live; only documentation and private ranges are used as examples.</Hint>
      </div>
    </StageFrame>
  );
}

/** The address as text, with leading zeros and the zero run shrinking away stage by stage. */
function AddressText({ h, stage, rule }: { h: Hextets; stage: CompressStage; rule: Rule }) {
  const run = zeroRun(h);
  const inRun = (i: number) => !!run && i >= run.from && i < run.from + run.len;
  const collapsed = stage === 2 && !!run;
  const tok = (chars: number, gone: boolean): CSSProperties => ({ maxWidth: gone ? 0 : `${chars}ch` });
  return (
    <div className="v6-text" aria-label={stage === 2 ? formatCanonical(h) : stage === 1 ? h.map((g) => g.toString(16)).join(':') : formatFull(h)} role="img">
      {h.map((_, i) => {
        const p = groupParts(h, i);
        const sepGone = collapsed && i >= run!.from && i <= run!.from + run!.len;
        const groupGone = collapsed && inRun(i);
        const field = FIELD_TONE[fieldOfBit(i * 16)];
        return (
          <span key={i} className="v6-slot">
            {run && i === run.from && <span className={`v6-tok v6-dc ${collapsed ? '' : 'is-gone'}`} style={tok(2, !collapsed)}>::</span>}
            {i > 0 && <span className={`v6-tok v6-sep ${sepGone ? 'is-gone' : ''}`} style={tok(1, sepGone)}>:</span>}
            <span className={`v6-tok tone-${field} v6-group ${groupGone ? 'is-gone' : ''} ${rule === 3 && inRun(i) && !collapsed ? 'is-doomed' : ''}`} style={tok(4, groupGone)}>
              <span className={`v6-tok v6-zeros ${stage >= 1 ? 'is-gone' : ''}`} style={tok(p.zeros.length, stage >= 1)}>{p.zeros}</span>
              <span className="v6-digits">{p.digits}</span>
            </span>
          </span>
        );
      })}
    </div>
  );
}

// ── SLAAC ───────────────────────────────────────────────────────────────

function SlaacScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<IidMode>('privacy');
  const [seed, setSeed] = useState(1);
  const iid = useMemo(() => (mode === 'eui64' ? eui64(EXAMPLE_MAC) : randomIid(mulberry32(seed))), [mode, seed]);
  const frames = useMemo(() => slaacFrames(iid, mode), [iid, mode]);
  const messages = useMemo(() => slaacMessages(), []);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const { step } = player.frame;
  const { linkLocal, global } = slaacAddresses(iid);
  const shown = step >= 3 ? global : linkLocal;

  return (
    <StageFrame
      player={player}
      height={320}
      legend={<Legend items={[{ color: 'var(--info)', label: 'multicast' }, { color: 'var(--hi)', label: 'current message' }, { color: 'var(--ok)', label: 'global address formed' }, ...FIELD_LEGEND]} />}
      controls={[
        <>
          {picker}
          <Toggle label="Interface ID" value={mode === 'eui64'} onChange={(v) => setMode(v ? 'eui64' : 'privacy')} off="Privacy (random)" on="EUI-64 (from MAC)" />
          {mode === 'privacy' && <Button onClick={() => setSeed(seed + 1)}>New random ID</Button>}
        </>,
      ]}
    >
      <div className="stage-pad v6">
        <SequenceDiagram actors={SLAAC_ACTORS} messages={messages} step={step} ariaLabel="SLAAC: router solicitation and advertisement" />
        {step >= 0 && (
          <>
            <SectionTitle weight="regular" hint={step >= 3 ? 'global' : 'link-local'}><span className="keep-case">{formatCanonical(shown)}</span></SectionTitle>
            <AddressBits h={shown} ariaLabel={`${formatCanonical(shown)} as 128 bits`} />
          </>
        )}
        <div className="v6-iid">
          <SectionTitle weight="regular">Where the interface ID comes from</SectionTitle>
          {mode === 'eui64' ? (
            <ol>
              <li>MAC {EXAMPLE_MAC}</li>
              <li>flip the universal/local bit (0x02 of the first byte): 02:1a:2b:3c:4d:5e</li>
              <li>insert ff:fe in the middle: <b>{iid.map((g) => g.toString(16).padStart(4, '0')).join(':')}</b></li>
            </ol>
          ) : (
            <p>64 random bits, <b>{iid.map((g) => g.toString(16).padStart(4, '0')).join(':')}</b>, replaced every so often (RFC 8981), so the address doesn't
              follow the device around the internet the way a MAC-based one would. Seeded here, so "New random ID" is reproducible.</p>
          )}
        </div>
        <Hint block>The SLAAC exchange is scripted; addresses are computed live. Real hosts also check nobody else uses the address (Duplicate Address Detection), not shown.</Hint>
      </div>
    </StageFrame>
  );
}

// ── Dual stack ──────────────────────────────────────────────────────────

const RACE_TAIL_MS = 60;

function DualScene({ picker }: { picker: ReactNode }) {
  const [broken, setBroken] = useState(false);
  const race = useMemo(() => happyEyeballs({ ...RACE, v6Ms: broken ? null : RACE.v6Ms }), [broken]);
  const frames = useMemo(() => raceFrames(race, broken), [race, broken]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const now = player.frame.now;
  const end = Math.max(race.connectedAt, race.v6Start + ATTEMPT_DELAY_MS) + RACE_TAIL_MS;
  const progress = (start: number, stop: number) => Math.max(0, Math.min(1, (now - start) / Math.max(1, stop - start)));
  const v6End = race.v6Done ?? end;

  return (
    <StageFrame
      player={player}
      height={260}
      legend={<Legend items={[{ color: 'var(--info)', label: 'attempt in progress' }, { color: 'var(--ok)', label: 'connected first (wins)' }, { color: 'var(--dim)', label: 'IPv6 path dropping packets' }, { color: 'var(--violet)', label: 'IPv6 head start ends', shape: 'line' }]} />}
      controls={[
        <>
          {picker}
          <Toggle label="IPv6 path" value={broken} onChange={setBroken} off="Works" on="Broken" />
        </>,
      ]}
    >
      <div className="stage-pad v6">
        <table className="data-table v6-dns">
          <tbody>
            <tr><td>example.com</td><td>AAAA</td><td>2001:db8::10</td></tr>
            <tr><td>example.com</td><td>A</td><td>203.0.113.10</td></tr>
          </tbody>
        </table>
        <GanttLanes
          lanes={[{ id: 'dns', label: 'DNS' }, { id: 'v6', label: 'IPv6' }, { id: 'v4', label: 'IPv4' }]}
          bars={[
            { id: 'dns', lane: 'dns', start: 0, end: race.v6Start, tone: 'muted', progress: progress(0, race.v6Start) },
            ...(now >= race.v6Start
              ? [{ id: 'v6', lane: 'v6', start: race.v6Start, end: v6End, tone: (race.v6Done === null ? 'dim' : race.winner === 'v6' && now >= race.connectedAt ? 'ok' : 'info') as Tone, kind: race.v6Done === null ? ('blocked' as const) : ('work' as const), label: race.v6Done === null ? 'no answer' : 'connect', progress: progress(race.v6Start, v6End) }]
              : []),
            ...(race.v4Start !== null && now >= race.v4Start
              ? [{ id: 'v4', lane: 'v4', start: race.v4Start, end: race.v4Done!, tone: (race.winner === 'v4' && now >= race.connectedAt ? 'ok' : 'info') as Tone, label: 'connect', progress: progress(race.v4Start, race.v4Done!) }]
              : []),
          ]}
          domain={[0, end]}
          now={now}
          markers={[{ at: race.v6Start + ATTEMPT_DELAY_MS, label: `+${ATTEMPT_DELAY_MS} ms`, tone: 'violet' }]}
          unit=" ms"
          axis
          size="md"
          labelWidth={52}
          ariaLabel="Happy Eyeballs race between IPv6 and IPv4"
        />
        <Hint block>Scripted race with illustrative timings; the {ATTEMPT_DELAY_MS} ms head start for IPv6 is RFC 8305's recommended Connection Attempt Delay.</Hint>
      </div>
    </StageFrame>
  );
}
