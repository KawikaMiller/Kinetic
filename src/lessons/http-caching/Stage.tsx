import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Segmented, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, humanDuration } from '../../core/format';
import { parseBoundedInt } from '../../core/parse';
import { radioKeyTarget } from '../../core/radio';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { requestFrames } from './frames';
import {
  OUTCOME_LABEL, OUTCOME_TONE, PRESETS, USERS, cacheControl, etagFor, replay, type EtagMode, type Event, type Policy, type PresetId,
  type UserId, type VaryHeader,
} from './model';
import './styles.css';

const STEP_MS = 1300;
/** RFC 9111 §1.2.2: caches treat delta-seconds above 2^31 as 2^31. */
const MAX_SECONDS = 2 ** 31;
const WAITS = [0, 5, 30, 60, 5 * 60, 30 * 60, 3600, 86_400, 4 * 86_400, 30 * 86_400, 365 * 86_400, 2 * 365 * 86_400];
const HONEST = 'Simulated caches following RFC 9111 for the directives shown; real browsers add heuristics and limits, and differ on reload.';

type Flag = 'public' | 'private' | 'noStore' | 'noCache' | 'mustRevalidate' | 'immutable';
type NumKey = 'maxAge' | 'sMaxAge' | 'swr';
const DIRECTIVES: ({ kind: 'flag'; key: Flag; label: string } | { kind: 'num'; key: NumKey; label: string })[] = [
  { kind: 'num', key: 'maxAge', label: 'max-age' },
  { kind: 'num', key: 'sMaxAge', label: 's-maxage' },
  { kind: 'flag', key: 'noCache', label: 'no-cache' },
  { kind: 'flag', key: 'noStore', label: 'no-store' },
  { kind: 'flag', key: 'private', label: 'private' },
  { kind: 'flag', key: 'public', label: 'public' },
  { kind: 'flag', key: 'mustRevalidate', label: 'must-revalidate' },
  { kind: 'num', key: 'swr', label: 'stale-while-revalidate' },
  { kind: 'flag', key: 'immutable', label: 'immutable' },
];
const DEFAULT_SECONDS: Record<NumKey, number> = { maxAge: 60, sMaxAge: 600, swr: 600 };
const ACTORS = (user: UserId) => [
  { id: 'browser', label: `${USERS[user].name}'s browser`, tone: 'info' as Tone },
  { id: 'shared', label: 'Shared cache (CDN)', tone: 'violet' as Tone },
  { id: 'origin', label: 'Origin' },
];

const INTRO = (
  <>Compose the origin's headers, then send requests as Ada or Ben and let time pass. Each request walks browser → shared cache → origin
    only as far as it must. {HONEST}</>
);

const textsOf = (p: Policy): Record<NumKey, string> => ({
  maxAge: String(p.maxAge ?? DEFAULT_SECONDS.maxAge),
  sMaxAge: String(p.sMaxAge ?? DEFAULT_SECONDS.sMaxAge),
  swr: String(p.swr ?? DEFAULT_SECONDS.swr),
});

/** A row of toggle chips with one tab stop: arrow keys move focus, Space/Enter toggles. */
function useToolbar(count: number) {
  const [at, setAt] = useState(0);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  return (i: number) => ({
    tabIndex: i === at ? 0 : -1,
    ref: (el: HTMLButtonElement | null) => {
      items.current[i] = el;
    },
    onFocus: () => setAt(i),
    onKeyDown: (e: KeyboardEvent) => {
      const next = radioKeyTarget(e.key, i, count);
      if (next === null) return;
      e.preventDefault();
      items.current[next]?.focus();
    },
  });
}

export function Stage() {
  const [presetId, setPresetId] = useState<PresetId | null>('asset');
  const [resource, setResource] = useState(PRESETS.asset.resource);
  const [policy, setPolicyState] = useState<Policy>(PRESETS.asset.policy);
  const [texts, setTexts] = useState(textsOf(PRESETS.asset.policy));
  const [errors, setErrors] = useState<Partial<Record<NumKey, string>>>({});
  const [events, setEvents] = useState<Event[]>([]);
  const [clock, setClock] = useState(0);
  const [waitIndex, setWaitIndex] = useState(3);
  const [reload, setReload] = useState(false);
  const toolbar = useToolbar(DIRECTIVES.length);

  const { outcomes } = useMemo(() => replay(policy, resource, events), [policy, resource, events]);
  const last = outcomes.at(-1) ?? null;
  useIntroCaption(INTRO);
  const frames = useMemo(() => requestFrames(last, INTRO, resource.body), [last, resource.body]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: true });
  const step = player.frame.step;

  const restart = () => {
    setEvents([]);
    setClock(0);
  };
  const setPolicy = (next: Policy) => {
    setPolicyState(next);
    setPresetId(null);
    restart();
  };
  const load = (id: PresetId) => {
    const pr = PRESETS[id];
    setPolicyState(pr.policy);
    setResource(pr.resource);
    setTexts(textsOf(pr.policy));
    setErrors({});
    setPresetId(id);
    restart();
  };
  const send = (user: UserId) => setEvents((es) => [...es, { kind: 'request', t: clock, user, reload }]);
  const deploy = () => setEvents((es) => [...es, { kind: 'deploy', t: clock }]);
  const wait = WAITS[waitIndex];

  const toggleNum = (key: NumKey) => {
    if (policy[key] !== null) return setPolicy({ ...policy, [key]: null });
    const parsed = parseBoundedInt(texts[key], { min: 0, max: MAX_SECONDS });
    setPolicy({ ...policy, [key]: parsed.ok ? parsed.value : DEFAULT_SECONDS[key] });
  };
  const editNum = (key: NumKey, text: string) => {
    setTexts((t) => ({ ...t, [key]: text }));
    const parsed = parseBoundedInt(text, {
      min: 0, max: MAX_SECONDS,
      messages: { tooBig: () => `Caches cap seconds at ${MAX_SECONDS.toLocaleString('en-US')} (RFC 9111 §1.2.2).` },
    });
    setErrors((e) => ({ ...e, [key]: parsed.ok ? undefined : parsed.error }));
    if (parsed.ok && policy[key] !== null && policy[key] !== parsed.value) setPolicy({ ...policy, [key]: parsed.value });
  };
  const toggleVary = (h: VaryHeader) =>
    setPolicy({ ...policy, vary: policy.vary.includes(h) ? policy.vary.filter((x) => x !== h) : [...policy.vary, h] });

  const originBytes = outcomes.reduce((s, o) => s + o.originBytes, 0);
  const full = outcomes.flatMap((o) => o.originStatuses).filter((s) => s === 200).length;
  const notModified = outcomes.flatMap((o) => o.originStatuses).filter((s) => s === 304).length;

  return (
    <StageFrame
      player={player}
      height={460}
      stats={
        <Stats>
          <Stat label="Clock" value={`t = ${humanDuration(clock)}`} />
          <Stat label="Origin 200s" value={full} sub={bytes(full * resource.body, { base: 1000 }) + ' of bodies'} color="var(--hi)" />
          <Stat label="Origin 304s" value={notModified} sub={`saved ${bytes(notModified * resource.body, { base: 1000 })}`} color="var(--violet)" />
          <Stat label="Origin link" value={bytes(originBytes, { base: 1000 })} sub="response bytes" />
        </Stats>
      }
      controls={[
        <>
          <Slider label="Wait" value={waitIndex} min={0} max={WAITS.length - 1} onChange={setWaitIndex} format={(i) => humanDuration(WAITS[i])} />
          <Button onClick={() => setClock((c) => c + wait)} disabled={wait === 0}>
            Let {humanDuration(wait)} pass
          </Button>
        </>,
        <>
          <Button variant="primary" onClick={() => send('A')}>Ada requests</Button>
          <Button variant="primary" onClick={() => send('B')}>Ben requests</Button>
          <Toggle label="Request" value={reload} onChange={setReload} off="Normal" on="Reload" />
          <Button onClick={deploy}>Deploy a new version</Button>
          <Button onClick={restart}>Start over</Button>
        </>,
      ]}
    >
      <div className="stage-pad hc">
        <div className="hc-presets" role="group" aria-label="Presets">
          {(Object.keys(PRESETS) as PresetId[]).map((id) => (
            <ChipButton key={id} tone="info" size="md" on={presetId === id} onClick={() => load(id)}>{PRESETS[id].label}</ChipButton>
          ))}
        </div>
        <div className="hc-top">
          <Box className="hc-composer">
            <SectionTitle weight="regular" hint={`for ${resource.path}`}>Origin response headers</SectionTitle>
            <div className="hc-directives" role="toolbar" aria-label="Cache-Control directives">
              {DIRECTIVES.map((d, i) => {
                const on = d.kind === 'flag' ? policy[d.key] : policy[d.key] !== null;
                return (
                  <button
                    key={d.key}
                    type="button"
                    {...toolbar(i)}
                    aria-pressed={on}
                    className={`chip chip-button tone-info ${on ? 'is-on is-solid' : ''}`}
                    onClick={() => (d.kind === 'flag' ? setPolicy({ ...policy, [d.key]: !policy[d.key] }) : toggleNum(d.key))}
                  >
                    {d.label}
                  </button>
                );
              })}
            </div>
            <div className="hc-fields">
              {DIRECTIVES.filter((d) => d.kind === 'num').map((d) => (
                <div key={d.key} className="hc-field">
                  <TextField label={`${d.label} (s)`} value={texts[d.key as NumKey]} onChange={(v) => editNum(d.key as NumKey, v)} width={110} disabled={policy[d.key as NumKey] === null} />
                  {errors[d.key as NumKey] && <span className="hc-error" role="alert">{errors[d.key as NumKey]}</span>}
                </div>
              ))}
            </div>
            <div className="hc-validators">
              <Segmented label="ETag" value={policy.etag} onChange={(v: EtagMode) => setPolicy({ ...policy, etag: v })} options={[{ value: 'none', label: 'none' }, { value: 'strong', label: 'strong' }, { value: 'weak', label: 'weak W/' }]} />
              <Toggle label="Last-Modified" value={policy.lastModified} onChange={(v) => setPolicy({ ...policy, lastModified: v })} off="none" on="30 days ago" />
              <div className="hc-vary" role="group" aria-label="Vary">
                <span className="hc-label">Vary</span>
                <ChipButton tone="violet" on={policy.vary.includes('accept-encoding')} onStyle="solid" onClick={() => toggleVary('accept-encoding')}>Accept-Encoding</ChipButton>
                <ChipButton tone="violet" on={policy.vary.includes('cookie')} onStyle="solid" onClick={() => toggleVary('cookie')}>Cookie</ChipButton>
              </div>
            </div>
            {resource.perUser && (
              <Toggle label="The developer" value={!policy.private} onChange={(forgot) => setPolicy({ ...policy, private: !forgot })} off="sent private" on="forgot private" />
            )}
            <Hint block>
              Changing a header starts the timeline again with empty caches. must-revalidate only matters here together with stale-while-revalidate: it forbids the stale serving that
              window would allow. A reload sends max-age=0, so a shared cache revalidates too, except for an immutable copy in the browser. s-maxage also stops stale serving in a shared
              cache (RFC 9111 §5.2.2.10), though many CDNs serve stale under it anyway.
            </Hint>
          </Box>
          <HeaderBlock policy={policy} />
        </div>
        <div className="hc-main">
          <div className="hc-ladder">
            <SectionTitle weight="regular" hint={last ? `t = ${humanDuration(last.t)}` : 'no requests yet'}>Latest request</SectionTitle>
            {last ? (
              <SequenceDiagram
                actors={ACTORS(last.user)}
                messages={last.messages.map((m, i) => ({ id: `m${i}`, from: m.from, to: m.to, label: m.label, note: m.note, tone: m.tone }))}
                step={step}
                currentStyle="tone"
                ariaLabel="Path of the latest request"
              />
            ) : (
              <p className="empty-note">Press Ada requests to send the first request.</p>
            )}
          </div>
          <Trail outcome={last} />
        </div>
        <Log outcomes={outcomes} />
        <Hint block>
          {HONEST} Users: Ada (accepts br) and Ben (accepts gzip) are fictional, each with their own browser cache. Byte counts are illustrative
          ({resource.body.toLocaleString('en-US')} B body, headers taken as a fixed size). Heuristic freshness (no max-age, but a Last-Modified)
          uses the common 10% rule from RFC 9111 §4.2.2.
        </Hint>
      </div>
    </StageFrame>
  );
}

function HeaderBlock({ policy }: { policy: Policy }) {
  const cc = cacheControl(policy);
  const lines = [
    'HTTP/1.1 200 OK',
    cc ? `Cache-Control: ${cc}` : '(no Cache-Control)',
    ...(policy.etag !== 'none' ? [`ETag: ${etagFor(policy.etag, 1, null)}`] : []),
    ...(policy.lastModified ? ['Last-Modified: (30 days before t = 0)'] : []),
    ...(policy.vary.length ? [`Vary: ${policy.vary.map((v) => (v === 'cookie' ? 'Cookie' : 'Accept-Encoding')).join(', ')}`] : []),
  ];
  return <CodePanel title="What the origin sends" lines={lines} gutter="none" className="hc-headers" />;
}

function Trail({ outcome }: { outcome: ReturnType<typeof replay>['outcomes'][number] | null }) {
  if (!outcome) return null;
  const mark = (ok: boolean | null): ReactNode => (ok === null ? null : <span className={`hc-mark tone-${ok ? 'ok' : 'dim'}`}>{ok ? '✓' : '✗'}</span>);
  return (
    <div className="hc-trail">
      <SectionTitle weight="regular" hint="the rules each cache applied">Decision trail</SectionTitle>
      <div className="hc-table-wrap">
        <table className="data-table">
          <tbody>
            {outcome.trail.map((r, i) => (
              <tr key={i}>
                <th scope="row">{r.layer}</th>
                <td>{r.check}</td>
                <td>{mark(r.ok)} {r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Log({ outcomes }: { outcomes: ReturnType<typeof replay>['outcomes'] }) {
  if (!outcomes.length) return null;
  return (
    <div className="hc-log">
      <SectionTitle weight="regular">Every request so far</SectionTitle>
      <div className="hc-table-wrap">
        <table className="data-table">
          <thead>
            <tr><th scope="col">t</th><th scope="col">who</th><th scope="col">result</th><th scope="col">answered by</th><th scope="col">origin bytes</th></tr>
          </thead>
          <tbody>
            {outcomes.map((o, i) => (
              <tr key={i} className={o.leak ? 'hc-leak' : undefined}>
                <td>{humanDuration(o.t)}</td>
                <td>{USERS[o.user].name}{o.reload ? ' (reload)' : ''}</td>
                <td>
                  <span className={`chip tone-${OUTCOME_TONE[o.kind]}`}>{OUTCOME_LABEL[o.kind]}</span>
                  {o.leak && <span className="chip tone-bad">got {USERS[o.owner!].name}'s page</span>}
                  {o.sharedStoredPersonal && !o.leak && <span className="chip tone-bad">shared cache kept {USERS[o.owner!].name}'s page</span>}
                </td>
                <td>{o.answeredBy}</td>
                <td>{bytes(o.originBytes, { base: 1000 })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
