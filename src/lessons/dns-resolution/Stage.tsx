import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { useScenePicker } from '../../components/ScenePicker';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA, humanDuration } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { ACTORS, changeCaption, ladder, lookupFrames, type DnsFrame, type Lowering } from './frames';
import {
  LOWERED_TTL, NEW_IP, NEW_NAME, NEW_NAME_IP, OLD_IP, RESOLVERS, TTL_STEPS, cacheKey, createInternet, exampleZone, flipOf, purge,
  remaining, resolve, setRecord, type Cache, type Internet, type Lookup, type RType, type TtlPlan,
} from './model';
import './styles.css';

type SceneId = 'resolve' | 'change';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'resolve', label: 'Resolve' },
  { value: 'change', label: 'Change a record' },
];
const HONEST = 'Simulated resolvers and a fictional zone: nothing here queries real DNS. Latencies are illustrative.';

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'resolve' });
  return scene === 'change' ? <ChangeScene picker={picker} /> : <ResolveScene picker={picker} />;
}

// ── Resolve ─────────────────────────────────────────────────────────────

const QUESTIONS: { name: string; type: RType }[] = [
  { name: 'example.com', type: 'A' },
  { name: 'example.com', type: 'AAAA' },
  { name: 'www.example.com', type: 'A' },
  { name: 'example.com', type: 'MX' },
  { name: 'shop.example.com', type: 'A' },
  { name: NEW_NAME, type: 'A' },
];
const qKey = (q: { name: string; type: RType }) => `${q.name} ${q.type}`;
const STEP_MS = 1300;
const WAITS = [60, 600, 3600];

const RESOLVE_INTRO = <>Pick a name and press Look up. The resolver starts with an empty cache, so the first lookup walks the whole tree.</>;

function ResolveScene({ picker }: { picker: ReactNode }) {
  const [net, setNet] = useState<Internet>(createInternet);
  const [cache, setCache] = useState<Cache>({});
  const [now, setNow] = useState(0);
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [before, setBefore] = useState<Cache>({});
  const setCaption = useSetCaption();
  useIntroCaption(RESOLVE_INTRO);

  const frames = useMemo<DnsFrame[]>(() => (lookup ? lookupFrames(lookup) : [{ step: -1 }]), [lookup]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const atEnd = !lookup || player.frame.step === lookup.steps.length - 1;
  const shownCache = atEnd ? cache : before;
  const created = net.zones.auth.records.some((r) => r.name === NEW_NAME);
  const authDown = net.down.includes('auth');
  const servedKey = lookup && atEnd ? servedFrom(lookup) : null;

  const look = () => {
    const l = resolve(net, cache, question.name, question.type, now);
    setBefore(purge(cache, now));
    setCache(l.cache);
    setLookup(l);
  };
  const idle = (say: ReactNode) => {
    setLookup(null);
    setCaption(say);
  };
  const doWait = (s: number) => {
    setNow(now + s);
    idle(<>{humanDuration(s)} pass (t = {humanDuration(now + s)}). Cached entries count down; any that reach zero are dropped.</>);
  };
  const create = () => {
    setNet(setRecord(net, NEW_NAME, 'A', NEW_NAME_IP, 3600));
    idle(<>{NEW_NAME} A {NEW_NAME_IP} now exists on ns1.example.com. Look it up again: does the resolver know yet?</>);
  };
  const flush = () => {
    setCache({});
    idle(<>Cache flushed: the next lookup starts from the root again.</>);
  };
  const toggleAuth = (up: boolean) => {
    setNet({ ...net, down: up ? [] : ['auth'] });
    idle(up ? <>ns1.example.com answers again.</> : <>ns1.example.com stops answering. Cached answers keep working until they expire; anything else times out.</>);
  };

  return (
    <StageFrame
      player={player}
      height={360}
      stats={
        <Stats>
          <Stat label="Clock" value={`t = ${humanDuration(now)}`} sub="moves when you press Wait" />
          <Stat label="Result" value={lookup && atEnd ? lookup.rcode : NA} sub={lookup && atEnd ? `${lookup.ms} ms (illustrative)` : 'press Look up'} color={lookup && atEnd ? rcodeColor(lookup.rcode) : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'query' },
            { color: 'var(--violet)', label: 'referral / CNAME' },
            { color: 'var(--ok)', label: 'answer' },
            { color: 'var(--bad)', label: 'NXDOMAIN' },
            { color: 'var(--orange)', label: 'timeout / SERVFAIL' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={look}>Look up</Button>
          <Toggle label="ns1.example.com" value={!authDown} onChange={toggleAuth} off="Down" on="Up" />
        </>,
        <ControlGroup key="q" label="Name">
          {QUESTIONS.map((q) => (
            <ChipButton key={qKey(q)} on={qKey(q) === qKey(question)} onClick={() => setQuestion(q)}>{qKey(q)}</ChipButton>
          ))}
        </ControlGroup>,
        <>
          {WAITS.map((s) => (
            <Button key={s} onClick={() => doWait(s)}>Wait {humanDuration(s)}</Button>
          ))}
          <Button onClick={flush}>Flush cache</Button>
          {question.name === NEW_NAME && <Button onClick={create} disabled={created}>{created ? `${NEW_NAME} created` : `Create ${NEW_NAME}`}</Button>}
        </>,
      ]}
    >
      <div className="stage-pad dn">
        {lookup ? (
          <SequenceDiagram actors={ACTORS} messages={ladder(lookup)} step={player.frame.step} ariaLabel={`Resolving ${lookup.name} ${lookup.type}`} />
        ) : (
          <p className="dn-empty">Nothing on the wire yet: press Look up.</p>
        )}
        <div className="dn-panels">
          <CachePanel cache={shownCache} now={now} served={servedKey} />
          <Records created={created} />
        </div>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

const rcodeColor = (r: Lookup['rcode']) => (r === 'NOERROR' ? 'var(--ok)' : r === 'NXDOMAIN' ? 'var(--bad)' : 'var(--orange)');

/** The cache entry a lookup was answered from, if it was a cache hit. */
function servedFrom(l: Lookup): string | null {
  const hit = [...l.steps].reverse().find((s) => s.kind === 'cache-hit' || s.kind === 'cache-negative');
  return hit ? cacheKey(hit.name, l.type) : null;
}

function CachePanel({ cache, now, served }: { cache: Cache; now: number; served: string | null }) {
  const entries = Object.values(cache).filter((e) => remaining(e, now) > 0).sort((a, b) => a.name.localeCompare(b.name) || a.type.localeCompare(b.type));
  return (
    <div className="dn-panel">
      <SectionTitle weight="regular" hint="TTL left">Resolver cache</SectionTitle>
      {entries.length === 0 && <p className="dn-empty">empty</p>}
      <ul className="dn-cache">
        {entries.map((e) => {
          const left = remaining(e, now);
          const tone = e.key === served ? 'hi' : e.kind === 'negative' ? 'bad' : e.kind === 'referral' ? 'violet' : 'info';
          return (
            <li key={e.key} className={e.key === served ? 'is-served' : ''}>
              <span className="dn-cache-name">{e.name} {e.type}</span>
              <span className="dn-cache-data">{e.kind === 'referral' ? `→ ${e.data}` : e.data}</span>
              <Bar value={left} max={e.ttl} tone={tone} height={6} trailing={<span className="dn-ttl">{humanDuration(left)}</span>} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const PURPOSE: Record<RType, string> = {
  A: 'IPv4 address',
  AAAA: 'IPv6 address',
  CNAME: 'alias: "look up this other name"',
  MX: 'mail server, with priority',
  TXT: 'free text (SPF, site checks)',
  NS: 'which server is authoritative',
  SOA: 'zone settings; last field = negative TTL',
};

function Records({ created }: { created: boolean }) {
  const records = [...exampleZone().records.filter((r) => !r.name.startsWith('loop')), ...(created ? [{ name: NEW_NAME, type: 'A' as RType, ttl: 3600, data: NEW_NAME_IP }] : [])];
  return (
    <div className="dn-panel dn-records">
      <SectionTitle weight="regular" hint="fictional zone">example.com on ns1.example.com</SectionTitle>
      <div className="dn-table-wrap">
        <table className="data-table">
          <thead><tr><th>Name</th><th>Type</th><th>Value</th><th>TTL</th><th>For</th></tr></thead>
          <tbody>
            {records.map((r) => (
              <tr key={`${r.name}-${r.type}`}>
                <td>{r.name}</td><td>{r.type}</td><td className="dn-value">{r.data}</td><td>{humanDuration(r.ttl)}</td><td className="dn-purpose">{PURPOSE[r.type]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Change a record ─────────────────────────────────────────────────────

const LOWERINGS: { value: Lowering; label: string }[] = [
  { value: 'never', label: "Don't" },
  { value: 'at-change', label: 'At the change' },
  { value: 'ahead', label: 'One TTL ahead' },
];
const HOUR = 3600;
/** Above this span the timeline counts hours, below it minutes. */
const HOURS_ABOVE_S = 4 * HOUR;
const MIN_SPAN_S = 120;
const LEAD_SHARE = 0.25;

function planFor(ttl: number, lowering: Lowering): TtlPlan {
  if (lowering === 'never') return { ttl, lowered: null };
  return { ttl, lowered: { ttl: LOWERED_TTL, at: lowering === 'at-change' ? 0 : -ttl } };
}

function ChangeScene({ picker }: { picker: ReactNode }) {
  const [ttlIndex, setTtlIndex] = useState(TTL_STEPS.length - 1);
  const [lowering, setLowering] = useState<Lowering>('never');
  const setCaption = useSetCaption();
  const ttl = TTL_STEPS[ttlIndex];
  const plan = planFor(ttl, lowering);
  const flips = RESOLVERS.map((r) => flipOf(r, plan));

  useEffect(() => {
    setCaption(changeCaption(RESOLVERS, planFor(ttl, lowering), lowering), { quiet: true });
  }, [ttl, lowering, setCaption]);

  const span = Math.max(MIN_SPAN_S, Math.max(...flips.map((f) => f.flip)) * 1.1);
  const hours = span > HOURS_ABOVE_S;
  const unit = hours ? HOUR : 60;
  const u = (s: number) => s / unit;
  const start = -span * LEAD_SHARE;

  return (
    <StageFrame
      height={300}
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: `old IP ${OLD_IP} (still correct)` },
            { color: 'var(--orange)', label: 'old IP, now stale' },
            { color: 'var(--ok)', label: `new IP ${NEW_IP}` },
            { color: 'var(--hi)', label: 'record changed', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Record TTL" value={ttlIndex} min={0} max={TTL_STEPS.length - 1} onChange={setTtlIndex} format={(i) => humanDuration(TTL_STEPS[i])} />
        </>,
        <Segmented key="lower" label={`Lower the TTL to ${LOWERED_TTL} s`} value={lowering} onChange={setLowering} options={LOWERINGS} />,
      ]}
    >
      <div className="stage-pad dn">
        <SectionTitle weight="regular" hint={`time since the change, in ${hours ? 'hours' : 'minutes'}`}>
          example.com A: {OLD_IP} → {NEW_IP}
        </SectionTitle>
        <WideRegion minWidth={TIMELINE_MIN_W} label="Timeline: scroll sideways to see all of it">
          <GanttLanes
            lanes={RESOLVERS.map((r) => ({ id: r.id, label: r.label }))}
            bars={flips.flatMap((f) => [
              { id: `${f.resolver.id}-old`, lane: f.resolver.id, start: u(start), end: 0, tone: 'muted' as const, label: 'old' },
              ...(f.flip > 0 ? [{ id: `${f.resolver.id}-stale`, lane: f.resolver.id, start: 0, end: u(f.flip), tone: 'orange' as const, label: 'stale' }] : []),
              { id: `${f.resolver.id}-new`, lane: f.resolver.id, start: u(f.flip), end: u(span), tone: 'ok' as const, label: 'new' },
            ])}
            domain={[u(start), u(span)]}
            markers={[{ at: 0, label: 'changed', tone: 'hi' }]}
            unit={hours ? ' h' : ' min'}
            axis
            size="md"
            labelWidth={104}
            ariaLabel="When each resolver switches to the new address"
          />
        </WideRegion>
        <table className="data-table dn-flips">
          <thead><tr><th>Resolver</th><th>Cached the old IP</th><th>With TTL</th><th>Sees the new IP</th></tr></thead>
          <tbody>
            {flips.map((f) => (
              <tr key={f.resolver.id}>
                <td>{f.resolver.label}</td>
                <td>{humanDuration(-f.cachedAt)} before</td>
                <td>{humanDuration(f.ttlHeld)}</td>
                <td className="dn-flip">{f.flip === 0 ? 'at the change' : `${humanDuration(f.flip)} after`}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Hint block>When each resolver first cached the record is illustrative; the flip times are computed from it and the TTL.</Hint>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

const TIMELINE_MIN_W = 520;
