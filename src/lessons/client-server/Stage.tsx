import { AnimatePresence, motion } from 'motion/react';
import { useMemo, useState, type ReactNode } from 'react';
import { Box } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Controls, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { midpoint } from '../../core/geometry';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

type Scenario = 'request' | 'scale' | 'down' | 'breaking';
type Client = 'browser' | 'mobile' | 'cli';
type NodeId = Client | 'lb' | 'api1' | 'api2' | 'api3' | 'db';
type Kind = 'req' | 'db' | 'ok' | 'bad';

const COLOR: Record<Kind, string> = { req: 'var(--info)', db: 'var(--violet)', ok: 'var(--ok)', bad: 'var(--bad)' };

const POS: Record<NodeId, { x: number; y: number }> = {
  browser: { x: 95, y: 70 },
  mobile: { x: 95, y: 180 },
  cli: { x: 95, y: 290 },
  lb: { x: 450, y: 180 },
  api1: { x: 640, y: 180 },
  api2: { x: 640, y: 80 },
  api3: { x: 640, y: 280 },
  db: { x: 840, y: 180 },
};

const CLIENT_LABEL: Record<Client, string> = { browser: 'Web app', mobile: 'Mobile app', cli: 'CLI / script' };

interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  kind: Kind;
  fail?: boolean;
}

interface CsFrame extends Frame {
  msg: Msg | null;
  down: boolean;
  version: 'v1' | 'v2' | 'both';
  json: string | null;
  screens: Record<Client, { text: string; tone?: 'ok' | 'bad' }>;
  sent: number;
  errors: number;
}

const USER_V1 = '{ "id": 42, "name": "Ada", "email": "ada@ex.com" }';
const CART = '{ "items": [ "book", "lamp", "mug" ] }';
const USER_V2 = '{ "id": 42, "fullName": "Ada", "email": "ada@ex.com" }';

const blank = (): CsFrame['screens'] => ({ browser: { text: '…' }, mobile: { text: '…' }, cli: { text: '$ _' } });

function script(s: Scenario): CsFrame[] {
  const frames: CsFrame[] = [];
  let cur: CsFrame = { msg: null, down: false, version: 'v1', json: null, screens: blank(), sent: 0, errors: 0 };
  const push = (p: Partial<CsFrame> & { say: ReactNode }, screens?: Partial<CsFrame['screens']>) => {
    cur = { ...cur, msg: null, ...p, screens: { ...cur.screens, ...screens } };
    if (cur.msg?.kind === 'req') cur.sent += 1;
    if (cur.msg?.fail || cur.msg?.kind === 'bad') cur.errors += 1;
    frames.push(cur);
  };
  const m = (from: NodeId, to: NodeId, label: string, kind: Kind, fail = false): Msg => ({ from, to, label, kind, fail });

  if (s === 'request') {
    push({ say: <>Three very different <b>clients</b>, one <b>server</b>. Clients ask, the server answers. Only the server ever touches the <span className="hl violet">database</span>.</> });
    push({ msg: m('browser', 'api1', 'GET /users/42', 'req'), say: <>The web app sends an HTTP request: <span className="hl info">GET /users/42</span>.</> });
    push({ msg: m('api1', 'db', 'SELECT … id=42', 'db'), say: <>The server checks permissions, then queries its database. The client has no idea this happens.</> });
    push({ msg: m('db', 'api1', 'row', 'db'), say: <>The database returns a row…</> });
    push({ msg: m('api1', 'browser', '200 OK + JSON', 'ok'), json: USER_V1, say: <>…and the server turns it into <span className="hl ok">JSON</span>: the shape promised by the API contract.</> }, { browser: { text: 'Hello, Ada', tone: 'ok' } });
    push({ msg: m('mobile', 'api1', 'GET /users/42', 'req'), say: <>The mobile app calls <b>the exact same endpoint</b>.</> });
    push({ msg: m('api1', 'mobile', '200 OK + JSON', 'ok'), json: USER_V1, say: <>Same JSON back. The phone draws it natively; the server neither knows nor cares.</> }, { mobile: { text: 'Ada · ada@ex.com', tone: 'ok' } });
    push({ msg: m('cli', 'api1', 'curl /users/42', 'req'), say: <>Even a script in a terminal can be a client.</> });
    push({ msg: m('api1', 'cli', '200 OK + JSON', 'ok'), json: USER_V1, say: <>That's the point of an API: <b>one contract</b>, any number of clients.</> }, { cli: { text: '{"id":42,"name":"Ada"…', tone: 'ok' } });
    push({ hold: 2, say: <>Clients depend on the <span className="hl">contract</span> (endpoints + JSON shapes), never on how the server works inside. That's what lets each side change independently.</> });
  }

  if (s === 'scale') {
    push({ say: <>Traffic grows, so we run <b>three identical copies</b> of the server behind a <span className="hl">load balancer</span>.</> });
    push({ msg: m('browser', 'lb', 'GET /cart + token', 'req'), say: <>Request 1 carries everything needed, including who you are (a <b>token</b>).</> });
    push({ msg: m('lb', 'api2', 'GET /cart', 'req'), say: <>The load balancer picks <b>api-2</b>.</> });
    push({ msg: m('api2', 'db', 'cart for user 42', 'db'), say: <>api-2 loads the cart from the shared database.</> });
    push({ msg: m('db', 'api2', '3 items', 'db'), say: <>…</> });
    push({ msg: m('api2', 'browser', '200 · 3 items', 'ok'), json: CART, say: <>Answer: 3 items.</> }, { browser: { text: 'Cart: 3 items', tone: 'ok' } });
    push({ msg: m('browser', 'lb', 'GET /cart + token', 'req'), say: <>Request 2, a second later…</> });
    push({ msg: m('lb', 'api3', 'GET /cart', 'req'), say: <>…lands on a <b>different</b> server: api-3. It has never seen this user before.</> });
    push({ msg: m('api3', 'db', 'cart for user 42', 'db'), say: <>Doesn't matter: the state lives in the database, and identity travels in the request.</> });
    push({ msg: m('db', 'api3', '3 items', 'db'), say: <>…</> });
    push({ msg: m('api3', 'browser', '200 · 3 items', 'ok'), json: CART, say: <><span className="hl ok">Same answer.</span></> }, { browser: { text: 'Cart: 3 items', tone: 'ok' } });
    push({ hold: 2, say: <>The servers are <span className="hl">stateless</span>: they remember nothing between requests. So any copy can answer any request, and you scale by adding copies.</> });
  }

  if (s === 'down') {
    push({ say: <>Everything's fine… until the server <b>crashes</b>.</> });
    push({ down: true, say: <><span className="hl bad">api-1 is down.</span> Clients can't see that. They only see what happens when they call.</> });
    push({ msg: m('mobile', 'api1', 'GET /users/42', 'req', true), say: <>The mobile app sends a request into the void…</> });
    push({ say: <>…and after a few seconds, a <span className="hl bad">timeout</span>. A good client shows a friendly error, not a blank screen.</> }, { mobile: { text: "Can't connect. Retrying…", tone: 'bad' } });
    push({ msg: m('mobile', 'api1', 'retry (after 2 s)', 'req', true), say: <>It <b>retries</b>, waiting longer each time (backoff) so a crowd of clients doesn't hammer a recovering server.</> });
    push({ down: false, say: <>The server comes back up.</> });
    push({ msg: m('mobile', 'api1', 'retry (after 4 s)', 'req'), say: <>Next retry…</> });
    push({ msg: m('api1', 'mobile', '200 OK + JSON', 'ok'), json: USER_V1, say: <><span className="hl ok">Success.</span></> }, { mobile: { text: 'Ada · ada@ex.com', tone: 'ok' } });
    push({ hold: 2, say: <>The network is <b>not</b> reliable. Every client call needs a plan for timeouts, errors and retries.</> });
  }

  if (s === 'breaking') {
    push({ say: <>The team ships API <span className="hl">v2</span> and renames <code>name</code> → <code>fullName</code>. The web app is updated in the same deploy.</> });
    push({ version: 'v2', msg: m('browser', 'api1', 'GET /users/42', 'req'), say: <>The new web app asks for a user…</> });
    push({ version: 'v2', msg: m('api1', 'browser', '200 OK + JSON', 'ok'), json: USER_V2, say: <>…gets <code>fullName</code>, and knows what to do with it. ✓</> }, { browser: { text: 'Hello, Ada', tone: 'ok' } });
    push({ version: 'v2', msg: m('mobile', 'api1', 'GET /users/42', 'req'), say: <>But the mobile app was installed <b>months ago</b>. Many users never update.</> });
    push({ version: 'v2', msg: m('api1', 'mobile', '200 OK + JSON', 'bad'), json: USER_V2, hold: 1.3, say: <>It still reads <code>user.name</code>, which no longer exists: <span className="hl bad">Hello, undefined</span>. You just broke clients you can't redeploy.</> }, { mobile: { text: 'Hello, undefined', tone: 'bad' } });
    push({ version: 'both', say: <>Fix: <b>version the API</b>. <span className="hl">/v1</span> keeps the old shape; <span className="hl">/v2</span> has the new one. (Or make changes <b>additive</b>: add fullName, keep name.)</> });
    push({ version: 'both', msg: m('mobile', 'api1', 'GET /v1/users/42', 'req'), say: <>The old app keeps calling /v1…</> });
    push({ version: 'both', msg: m('api1', 'mobile', '200 OK + JSON', 'ok'), json: USER_V1, say: <>…and gets exactly what it expects. ✓</> }, { mobile: { text: 'Ada · ada@ex.com', tone: 'ok' } });
    push({ version: 'both', hold: 2, say: <>Once published, an API is a <span className="hl">promise</span>. Adding is safe; renaming or removing breaks every client you don't control.</> });
  }

  return frames;
}

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: 'request', label: 'A request' },
  { value: 'scale', label: 'Scale out' },
  { value: 'down', label: 'Server down' },
  { value: 'breaking', label: 'Breaking change' },
];

export function Stage() {
  const [scenario, setScenario] = useState<Scenario>('request');
  const frames = useMemo(() => script(scenario), [scenario]);
  const player = usePlayer(frames, { interval: 1300 });
  const f = player.frame;
  const scaled = scenario === 'scale';
  const servers: NodeId[] = scaled ? ['api2', 'api1', 'api3'] : ['api1'];
  const active = new Set<NodeId>(f.msg ? [f.msg.from, f.msg.to] : []);

  const endpoints =
    f.version === 'v1'
      ? ['GET /users/{id} → { id, name, email }', 'GET /cart → { items: [...] }']
      : f.version === 'v2'
        ? ['GET /users/{id} → { id, fullName, email }', 'GET /cart → { items: [...] }']
        : ['GET /v1/users/{id} → { id, name, email }', 'GET /v2/users/{id} → { id, fullName, email }'];

  return (
    <StageFrame
      player={player}
      height={480}
      stats={
        <Stats>
          <Stat label="Requests" value={f.sent} color="var(--info)" />
          <Stat label="Errors" value={f.errors} color={f.errors ? 'var(--bad)' : 'var(--muted)'} />
          <Stat label="Servers up" value={`${f.down ? 0 : servers.length}/${servers.length}`} color={f.down ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: COLOR.req, label: 'request', shape: 'dot' },
            { color: COLOR.db, label: 'database query', shape: 'dot' },
            { color: COLOR.ok, label: 'response', shape: 'dot' },
            { color: COLOR.bad, label: 'failure', shape: 'dot' },
          ]}
        />
      }
      controls={
        <Controls>
          <Segmented label="Scenario" value={scenario} onChange={setScenario} options={SCENARIOS} />
        </Controls>
      }
    >
      <div className="cs">
        <svg className="cs-scene" viewBox="0 0 920 350" role="img" aria-label="Clients calling a server API">
          <text x={95} y={20} textAnchor="middle" className="scene-zone">CLIENTS</text>
          <text x={scaled ? 545 : 640} y={20} textAnchor="middle" className="scene-zone">SERVER SIDE (yours)</text>
          <rect x={scaled ? 385 : 560} y={32} width={scaled ? 530 : 355} height={306} rx={16} className="cs-boundary" />

          {(['browser', 'mobile', 'cli'] as Client[]).map((c) => (
            <line key={c} x1={POS[c].x + 70} y1={POS[c].y} x2={scaled ? POS.lb.x - 34 : POS.api1.x - 50} y2={scaled ? POS.lb.y : POS.api1.y} className="scene-edge" />
          ))}
          {scaled && servers.map((s) => <line key={s} x1={POS.lb.x + 34} y1={POS.lb.y} x2={POS[s].x - 50} y2={POS[s].y} className="scene-edge" />)}
          {servers.map((s) => (
            <line key={`db-${s}`} x1={POS[s].x + 50} y1={POS[s].y} x2={POS.db.x - 42} y2={POS.db.y} className="scene-edge cs-edge-db" />
          ))}

          {(['browser', 'mobile', 'cli'] as Client[]).map((c) => (
            <ClientBox key={c} id={c} on={active.has(c)} screen={f.screens[c]} version={c === 'mobile' ? 'v1 · installed months ago' : c === 'browser' && f.version !== 'v1' ? 'updated today' : ''} />
          ))}

          {scaled && (
            <g className={`cs-node ${active.has('lb') ? 'on' : ''}`}>
              <polygon points={hexagon(POS.lb.x, POS.lb.y, 32)} />
              <text x={POS.lb.x} y={POS.lb.y + 4} textAnchor="middle" className="cs-node-label">LB</text>
            </g>
          )}

          {servers.map((s) => (
            <SceneNode
              key={s}
              at={POS[s]}
              w={100}
              h={56}
              titleDy={-4}
              title={s === 'api1' ? 'api-1' : s === 'api2' ? 'api-2' : 'api-3'}
              sub={f.down ? '✗ down' : scaled ? 'stateless' : f.version === 'both' ? '/v1 + /v2' : f.version}
              on={active.has(s)}
              variant={f.down ? 'bad' : 'default'}
            />
          ))}

          <g className={`cs-node cs-db ${active.has('db') ? 'on' : ''}`}>
            <ellipse cx={POS.db.x} cy={POS.db.y - 26} rx={40} ry={10} />
            <rect x={POS.db.x - 40} y={POS.db.y - 26} width={80} height={52} />
            <ellipse cx={POS.db.x} cy={POS.db.y + 26} rx={40} ry={10} />
            <text x={POS.db.x} y={POS.db.y + 5} textAnchor="middle" className="cs-node-label">DB</text>
          </g>

          {f.msg && <MessagePill key={player.index} msg={f.msg} />}
        </svg>

        <div className="cs-panels">
          <Box className="cs-panel">
            <span className="cs-panel-title">API contract</span>
            {endpoints.map((e) => (
              <motion.code key={e} className="cs-endpoint" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}>
                {e}
              </motion.code>
            ))}
          </Box>
          <Box className="cs-panel">
            <span className="cs-panel-title">Last response body</span>
            <AnimatePresence mode="wait">
              <motion.code key={f.json ?? 'none'} className="cs-json" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {f.json ?? '(nothing yet)'}
              </motion.code>
            </AnimatePresence>
          </Box>
        </div>
      </div>
    </StageFrame>
  );
}

function hexagon(cx: number, cy: number, r: number) {
  return Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  }).join(' ');
}

function ClientBox({ id, on, screen, version }: { id: Client; on: boolean; screen: { text: string; tone?: 'ok' | 'bad' }; version: string }) {
  const { x, y } = POS[id];
  const icon = id === 'browser' ? '🌐' : id === 'mobile' ? '📱' : '⌨';
  return (
    <g className={`cs-node cs-client ${on ? 'on' : ''}`}>
      <rect x={x - 70} y={y - 34} width={140} height={68} rx={10} />
      <text x={x - 58} y={y - 14} className="cs-client-title">
        {icon} {CLIENT_LABEL[id]}
      </text>
      <rect x={x - 60} y={y - 6} width={120} height={22} rx={5} className={`cs-screen ${screen.tone ?? ''}`} />
      <text x={x - 54} y={y + 9} className={`cs-screen-text ${screen.tone ?? ''}`}>
        {screen.text.length > 22 ? screen.text.slice(0, 21) + '…' : screen.text}
      </text>
      {version && (
        <text x={x} y={y + 48} textAnchor="middle" className="cs-node-sub cs-client-ver">
          {version}
        </text>
      )}
    </g>
  );
}

/** Offset past the midpoint where a failed request "falls into the void". */
const VOID_OFFSET = 40;

function MessagePill({ msg }: { msg: Msg }) {
  const a = POS[msg.from];
  const b = POS[msg.to];
  const mid = midpoint(a, b);
  const end = msg.fail ? { x: mid.x + VOID_OFFSET, y: mid.y } : b;
  // Travel, then fade on arrival so the target's screen stays readable.
  return <Packet path={[a, end]} label={msg.label} color={COLOR[msg.fail ? 'bad' : msg.kind]} duration={1.15} height={22} charW={6.4} />;
}
