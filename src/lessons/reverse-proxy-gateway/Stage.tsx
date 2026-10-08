import { useMemo, useState } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { SectionTitle } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, TextField, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { minWidthForText } from '../../core/scale';
import type { Tone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { REASON, introFor, runFrames, statusTone, type GwFrame } from './frames';
import {
  API_HOST, CLIENT_IP, DEFAULT_CONFIG, DEFAULT_ROUTES, PRESETS, SERVICES, STAGES, STAGE_LABEL, parsePath, parsePrefix, prefixMatches, presetRequests, route,
  runRequests, type GatewayConfig, type Route, type ServiceId, type StageId,
} from './model';
import './styles.css';

const STEP_MS = 1300;
const HONEST = 'Scripted gateway: the services, their latencies and the tokens are simulated, and no request leaves this page.';

export function Stage() {
  const [presetId, setPresetId] = useState(PRESETS[0].id);
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const [routes, setRoutes] = useState<Route[]>(() => [...DEFAULT_ROUTES]);
  const [authAtEdge, setAuthAtEdge] = useState(true);
  const [mtls, setMtls] = useState(false);
  const [spoof, setSpoof] = useState(false);

  const cfg: GatewayConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, routes, authAtEdge, health: { ...DEFAULT_CONFIG.health, ...preset.health } }),
    [routes, authAtEdge, preset],
  );
  const results = useMemo(() => runRequests(presetRequests(preset, spoof), cfg), [preset, spoof, cfg]);
  const frames = useMemo(() => runFrames(results, cfg, mtls, introFor(preset.label, results.length)), [results, cfg, mtls, preset]);
  const player = usePlayer<GwFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const f = player.frame;
  const cur = f.k >= 0 ? results[f.k] : null;
  /** Responses the client has had so far: every earlier request, plus this one once it's on its way back. */
  const done = results.slice(0, f.stage === null ? f.k + 1 : f.k);
  // A refused connection (502) never reached the service, so there's nothing it "saw".
  const reached = cur && cur.out.status !== 502 && (f.stage === 'forward' || (f.stage === null && cur.out.ran.includes('forward')));

  return (
    <StageFrame
      player={player}
      height={560}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'request' },
        { color: 'var(--hi)', label: 'active stage' },
        { color: 'var(--ok)', label: '2xx from upstream' },
        { color: 'var(--orange)', label: '4xx (401, 404, 429)' },
        { color: 'var(--bad)', label: '5xx (502, 504)' },
        { color: 'var(--violet)', label: 'encrypted link' },
      ]} />}
      controls={[
        <ControlGroup key="p" label="Send" inline>
          {PRESETS.map((p) => <ChipButton key={p.id} tone="info" size="md" on={p.id === presetId} onClick={() => setPresetId(p.id)}>{p.label}</ChipButton>)}
        </ControlGroup>,
        <>
          <Toggle label="Auth" value={!authAtEdge} onChange={(v) => setAuthAtEdge(!v)} off="At the gateway" on="In each service" />
          <Toggle label="Gateway to services" value={mtls} onChange={setMtls} off="Plain HTTP" on="mTLS" />
          <Toggle label="Client's own X-Forwarded-For" value={spoof} onChange={setSpoof} off="None" on="Sends one" />
        </>,
      ]}
    >
      <div className="stage-pad gw">
        <Pipeline frame={f} cfg={cfg} mtls={mtls} cur={cur} />
        <div className="gw-row">
          <RouteTable routes={routes} setRoutes={setRoutes} active={cur?.out.route ?? null} />
          <div className="gw-side">
            <ServiceView cur={reached ? cur : null} />
            <ConsolePanel
              title="responses"
              empty="(none yet)"
              lines={done.map(({ req, out }) => ({ text: `${req.method} ${req.host}${req.path} → ${out.status} ${REASON[out.status]}`, tone: statusTone(out.status) as Tone }))}
            />
          </div>
        </div>
        <Hint block>
          {HONEST} Auth in the gateway does the check once, but the services still shouldn't trust the network blindly (the zero-trust lesson):
          with mTLS inside, only the gateway can reach them. Load balancing, rate-limit algorithms and caching have their own lessons.
        </Hint>
      </div>
    </StageFrame>
  );
}

// ── The pipeline scene ──────────────────────────────────────────────────

const W = 780;
const H = 262;
const TRACK_Y = 84;
const BOX_Y = 150;
const STAGE_X = (i: number) => 178 + i * 78;
const CLIENT_AT = { x: 56, y: BOX_Y };
const SVC_X = 706;
const SVC_Y: Record<ServiceId, number> = { users: 66, orders: 120, reports: 174, static: 228 };
const SHORT: Record<StageId, string> = { tls: 'TLS', route: 'route', auth: 'auth', rate: 'rate', headers: 'headers', forward: 'forward' };
const PIPE_MIN_W = minWidthForText(W, 10);

function Pipeline({ frame, cfg, mtls, cur }: { frame: GwFrame; cfg: GatewayConfig; mtls: boolean; cur: ReturnType<typeof runRequests>[number] | null }) {
  const out = cur?.out;
  const at = frame.stage ? STAGES.indexOf(frame.stage) : -1;
  const prev = at > 0 ? { x: STAGE_X(at - 1), y: TRACK_Y } : { x: CLIENT_AT.x, y: TRACK_Y };
  const label = cur ? `${cur.req.method} ${cur.req.path}` : '';
  const svc = out?.route?.service;
  const back = frame.stage === null && out;
  const from = back ? (out.stoppedAt === 'forward' ? { x: SVC_X - 60, y: SVC_Y[svc!] } : { x: STAGE_X(STAGES.indexOf(out.stoppedAt)), y: TRACK_Y }) : null;

  return (
    <WideRegion minWidth={PIPE_MIN_W} label="Gateway pipeline: scroll sideways to see all of it">
        <svg viewBox={`0 0 ${W} ${H}`} className="gw-svg" role="img" aria-label={cur ? `${label}: at ${frame.stage ? STAGE_LABEL[frame.stage] : 'the client'}` : 'Gateway pipeline'}>
          <line x1={CLIENT_AT.x + 44} y1={BOX_Y} x2={140} y2={BOX_Y} className="gw-link is-edge" />
          <text x={118} y={BOX_Y - 8} textAnchor="middle" className="gw-link-label is-edge">HTTPS</text>
          {SERVICES.map((s) => (
            <line key={s} x1={606} y1={BOX_Y} x2={SVC_X - 56} y2={SVC_Y[s]} className={`gw-link ${mtls ? 'is-edge' : 'is-inside'}`} />
          ))}
          <text x={598} y={184} textAnchor="end" className={`gw-link-label ${mtls ? 'is-edge' : 'is-inside'}`}>to services: {mtls ? 'mTLS' : 'plain HTTP'}</text>
          <rect x={136} y={36} width={472} height={156} rx={14} className="gw-zone" />
          <text x={150} y={54} className="scene-zone">gateway (reverse proxy)</text>
          <SceneNode at={CLIENT_AT} w={88} h={54} title="client" sub={CLIENT_IP} />
          {STAGES.map((s, i) => {
            // The stage that answered is outlined, forward included for 502/504; a service's own answer outlines the service instead.
            const stopped = out && out.stoppedAt === s && (frame.stage === s || frame.stage === null) && !(s === 'forward' && out.fromService);
            const ranAt = out ? out.ran.indexOf(s) : -1;
            const passed = ranAt >= 0 && ranAt < (frame.stage ? at : out!.ran.length) && !stopped;
            return (
              <SceneNode key={s} at={{ x: STAGE_X(i), y: BOX_Y }} w={68} h={52} title={SHORT[s]}
                sub={stopped ? `${out.status}` : passed ? 'passed' : ''} on={frame.stage === s}
                tone={stopped ? statusTone(out.status) : frame.stage === s ? 'hi' : undefined} className={stopped ? 'gw-stopped' : ''} />
            );
          })}
          {SERVICES.map((s) => {
            const h = cfg.health[s];
            // A route to this service needs a token (static files don't), so it checks JWTs when auth moves into the services.
            const guarded = cfg.routes.some((x) => x.service === s && x.auth);
            // A down service never receives the request, so it doesn't light up.
            const receiving = frame.stage === 'forward' && svc === s && h !== 'down' && !(!!out && out.fromService && out.status >= 400);
            const rejected = !!out && out.fromService && out.status >= 400 && svc === s && (frame.stage === 'forward' || frame.stage === null);
            return (
              <SceneNode key={s} at={{ x: SVC_X, y: SVC_Y[s] }} w={112} h={40} title={`/${s}`}
                sub={rejected ? `${out!.status}` : h === 'down' ? 'down' : h === 'slow' ? `slow (${cfg.latency.slow} s)` : cfg.authAtEdge || !guarded ? 'up' : 'up · checks JWT'}
                on={receiving}
                tone={rejected ? statusTone(out!.status) : receiving ? 'hi' : undefined}
                className={rejected ? 'gw-stopped' : ''} variant={h === 'down' ? 'dim' : 'default'} />
            );
          })}
          {cur && frame.stage && (
            <Packet key={`q${frame.k}-${frame.stage}`} path={[prev, { x: STAGE_X(at), y: TRACK_Y }]} label={label} color="var(--info)" arrive="stay" duration={0.6} />
          )}
          {back && from && (
            <Packet key={`r${frame.k}`} path={[from, { x: CLIENT_AT.x + 10, y: TRACK_Y }]} label={`${out.status}`} color={`var(--${statusTone(out.status)})`} arrive="stay" duration={0.9} />
          )}
        </svg>
    </WideRegion>
  );
}

// ── Routing table ───────────────────────────────────────────────────────

function RouteTable({ routes, setRoutes, active }: { routes: Route[]; setRoutes: (r: Route[]) => void; active: Route | null }) {
  const [prefix, setPrefix] = useState('/orders/export/csv');
  const [service, setService] = useState<ServiceId>('reports');
  const [error, setError] = useState<string | null>(null);
  const [tryPath, setTryPath] = useState('/orders/export/2024');
  const path = parsePath(tryPath);
  const winner = path.ok ? route(routes, API_HOST, path.value) : null;
  const add = () => {
    const p = parsePrefix(prefix, routes.filter((r) => r.host === API_HOST).map((r) => r.prefix));
    if (!p.ok) return setError(p.error);
    setError(null);
    setRoutes([...routes, { id: `r-added-${p.value}`, host: API_HOST, prefix: p.value, service, auth: true }]);
  };
  return (
    <div className="gw-routes">
      <SectionTitle weight="regular" hint="longest prefix wins">Routing table</SectionTitle>
      <div className="gw-table-wrap">
      <table className="data-table">
        <thead><tr><th>host</th><th>prefix</th><th>service</th><th>auth</th><th /></tr></thead>
        <tbody>
          {routes.map((r) => {
            const wins = winner?.id === r.id;
            const alsoMatches = !wins && path.ok && r.host === API_HOST && prefixMatches(r.prefix, path.value);
            return (
              <tr key={r.id} className={`${active?.id === r.id ? 'is-active' : ''} ${wins ? 'is-winner' : ''} ${alsoMatches ? 'is-also' : ''}`}>
                <td>{r.host}</td><td><code>{r.prefix}</code></td><td>{r.service}</td><td>{r.auth ? 'JWT' : 'public'}</td>
                <td><ChipButton tone="muted" ariaLabel={`Remove route ${r.host}${r.prefix}`} onClick={() => setRoutes(routes.filter((x) => x.id !== r.id))}>×</ChipButton></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <div className="gw-form">
        <TextField label={`Try a path on ${API_HOST}`} value={tryPath} onChange={setTryPath} width={210} spellCheck={false} />
        <p className="gw-msg" role="status">
          {!path.ok ? <span className="gw-err">{path.error}</span> : winner ? <>→ <b>{winner.service}</b> via <code>{winner.prefix}</code></> : <>→ no match: 404</>}
        </p>
      </div>
      <div className="gw-form">
        <TextField label="New prefix" value={prefix} onChange={setPrefix} onEnter={add} width={170} spellCheck={false} />
        <Segmented label="Service" value={service} onChange={setService} options={SERVICES.map((s) => ({ value: s, label: s }))} />
        <Button onClick={add}>Add route</Button>
        <p className={`gw-msg ${error ? 'gw-err' : ''}`} role="status">{error ?? 'Matching is by whole path segments: /orders matches /orders/7, not /ordersX.'}</p>
      </div>
    </div>
  );
}

// ── What the service sees ───────────────────────────────────────────────

function ServiceView({ cur }: { cur: ReturnType<typeof runRequests>[number] | null }) {
  const fwd = cur?.out.forwarded;
  const lines = cur && fwd ? [`${cur.req.method} ${cur.req.path} HTTP/1.1`, ...fwd.map(([h, v]) => `${h}: ${v}`)] : [];
  const xffLine = lines.findIndex((l) => l.startsWith('X-Forwarded-For'));
  return (
    <div className="gw-sees">
      <SectionTitle weight="regular" hint={cur?.out.route ? `as ${cur.out.route.service} receives it` : ''}>What the service sees</SectionTitle>
      {lines.length ? (
        <CodePanel lines={lines} gutter="none" stateOf={(i) => (i === xffLine ? 'now' : 'idle')} className="gw-headers" />
      ) : <p className="empty-note">No request has reached a service.</p>}
      <Hint block>
        X-Forwarded-For is only trustworthy when your own proxy set it: a client can send any value, so trust only the entries your proxies
        appended (here, the last one).
      </Hint>
    </div>
  );
}
