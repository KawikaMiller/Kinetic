import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { send, type AllowOrigin, type Client, type ClientRequest, type Headers, type Outcome, type ServerConfig, type Step } from './cors';

const ORIGIN = 'https://app.example.com';
const API = 'https://api.example.com';

type RequestId = 'get' | 'form' | 'json' | 'key' | 'delete';
const REQUESTS: { id: RequestId; label: string; req: Omit<ClientRequest, 'credentials'> }[] = [
  { id: 'get', label: 'GET /orders', req: { method: 'GET', path: '/orders', headers: {} } },
  { id: 'form', label: 'POST form', req: { method: 'POST', path: '/orders', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } } },
  { id: 'json', label: 'POST JSON', req: { method: 'POST', path: '/orders', headers: { 'Content-Type': 'application/json' } } },
  { id: 'key', label: 'GET + X-Api-Key', req: { method: 'GET', path: '/orders', headers: { 'X-Api-Key': 'demo-key' } } },
  { id: 'delete', label: 'DELETE /orders/7', req: { method: 'DELETE', path: '/orders/7', headers: {} } },
];

// Scene geometry (SVG units)
const W = 640;
const H = 150;
const Y = 72;
const NODE = { w: 170, h: 60 };
const BROWSER = { x: 110, y: Y };
const SERVER = { x: 530, y: Y };
const LEFT = BROWSER.x + NODE.w / 2;
const RIGHT = SERVER.x - NODE.w / 2;
const HOP = 1.1;
const GO = [{ x: LEFT, y: Y - 12 }, { x: RIGHT, y: Y - 12 }];
const BACK = [{ x: RIGHT, y: Y + 14 }, { x: LEFT, y: Y + 14 }];
/** Narrowest width where the diagram's smallest labels stay readable (≥ 8px). */
const SCENE_MIN_WIDTH = 560;

interface Run {
  n: number;
  outcome: Outcome;
  label: string;
}

export function RequestScene({ picker }: { picker: ReactNode }) {
  const [requestId, setRequestId] = useState<RequestId>('get');
  const [credentials, setCredentials] = useState(false);
  const [allowOrigin, setAllowOrigin] = useState<AllowOrigin>('none');
  const [allowCredentials, setAllowCredentials] = useState(false);
  const [handlesOptions, setHandlesOptions] = useState(false);
  const [client, setClient] = useState<Client>('browser');
  const [run, setRun] = useState<Run | null>(null);
  const setCaption = useSetCaption();

  useIntroCaption(
    <>A page on <code>app.example.com</code> calls <code>api.example.com</code>: cross-origin. Press <b>Send</b> with the server&apos;s CORS switched off.</>,
  );

  const server: ServerConfig = {
    allowOrigin,
    allowCredentials,
    preflight: handlesOptions ? { methods: ['GET', 'POST', 'PUT', 'DELETE'], headers: ['content-type', 'x-api-key'] } : null,
  };

  const fire = () => {
    const spec = REQUESTS.find((r) => r.id === requestId)!;
    const outcome = send({ ...spec.req, credentials }, server, ORIGIN, client);
    setRun((prev) => ({ n: (prev?.n ?? 0) + 1, outcome, label: `${spec.req.method} ${spec.req.path}` }));
    setCaption(captionFor(outcome, client), { quiet: true });
  };

  const o = run?.outcome;
  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Preflight" value={o ? (o.preflighted ? 'yes' : 'no') : NA} color={o?.preflighted ? 'var(--violet)' : undefined} />
          <Stat label="Reached the server" value={o ? (o.reachedServer ? 'yes' : 'no') : NA} color={o?.reachedServer ? 'var(--hi)' : undefined} sub={o ? (o.reachedServer ? 'and it ran' : 'so it never ran') : undefined} />
          <Stat label="JavaScript can read it" value={o ? (o.readable ? 'yes' : 'no') : NA} color={o ? (o.readable ? 'var(--ok)' : 'var(--bad)') : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request' },
            { color: 'var(--violet)', label: 'preflight (OPTIONS)' },
            { color: 'var(--ok)', label: 'response the page may read' },
            { color: 'var(--bad)', label: 'response the browser hid' },
            { color: 'var(--hi)', label: 'the server ran it' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="The page sends" value={requestId} onChange={setRequestId} options={REQUESTS.map((r) => ({ value: r.id, label: r.label }))} />
          <Toggle label="Cookies" value={credentials} onChange={setCredentials} off="omit" on="credentials: 'include'" />
          <Toggle label="Sent from" value={client === 'curl'} onChange={(c) => setClient(c ? 'curl' : 'browser')} off="a browser" on="curl" />
          <Button variant="primary" onClick={fire}>Send</Button>
        </>,
        <>
          <Segmented
            label="Server: Access-Control-Allow-Origin"
            value={allowOrigin}
            onChange={setAllowOrigin}
            options={[{ value: 'none', label: '(not sent)' }, { value: 'wildcard', label: '*' }, { value: 'exact', label: ORIGIN }]}
          />
          <Toggle label="Allow-Credentials" value={allowCredentials} onChange={setAllowCredentials} off="not sent" on="true" />
          <Toggle label="Answers preflights (OPTIONS)" value={handlesOptions} onChange={setHandlesOptions} off="no handler" on="allows POST, PUT, DELETE + Content-Type, X-Api-Key" />
        </>,
      ]}
    >
      <div className="stage-pad cors">
        <Box className="cors-scene-box">
          <WideRegion minWidth={SCENE_MIN_WIDTH} label="Request diagram: scroll sideways to see all of it">
            <svg viewBox={`0 0 ${W} ${H}`} className="cors-scene" role="img" aria-label="A request from the page's browser to the API server">
              <line className="scene-edge" x1={LEFT} y1={Y} x2={RIGHT} y2={Y} />
              <SceneNode at={BROWSER} w={NODE.w} h={NODE.h} rx={10} title={client === 'curl' ? 'curl (terminal)' : 'Browser'} sub={client === 'curl' ? 'no page, no origin' : 'page: app.example.com'} />
              <SceneNode at={SERVER} w={NODE.w} h={NODE.h} rx={10} title="API server" sub="api.example.com" />
              {run && <Hops key={run.n} run={run} />}
            </svg>
          </WideRegion>
        </Box>
        {o ? (
          <ol className="cors-steps">
            {o.steps.map((s, i) => (
              <li key={`${run!.n}-${i}`} className={`log-row tone-${stepTone(s)}`}>{s.text}</li>
            ))}
          </ol>
        ) : (
          <p className="empty-note">Press Send.</p>
        )}
        {o && client === 'browser' && !o.readable && <ConsoleError outcome={o} label={run!.label} />}
        {o && (
          <div className="cors-headers">
            {o.preflightRequest && <HeaderList title="Preflight request (OPTIONS)" headers={o.preflightRequest} />}
            {o.preflightHeaders && <HeaderList title="Preflight response" headers={o.preflightHeaders} empty="(no CORS headers)" />}
            <HeaderList title="Request headers" headers={o.requestHeaders} empty="(never sent)" />
            {o.reachedServer && <HeaderList title="Response headers" headers={o.responseHeaders} />}
          </div>
        )}
        <p className="cors-honest">
          Simulated browser and server; the rules follow the Fetch standard. CORS is enforced by the browser, not the server: it
          decides whether the page may <i>read</i> a response. It doesn&apos;t stop requests being sent, so it isn&apos;t protection for your
          API (that&apos;s authentication), and it doesn&apos;t stop cross-site form posts (CSRF, Tier 2).
        </p>
      </div>
    </StageFrame>
  );
}

/** The packets for one send, played in order. */
function Hops({ run }: { run: Run }) {
  const o = run.outcome;
  const hops: ReactNode[] = [];
  let t = 0;
  for (const s of o.steps) {
    if (s.kind === 'preflight') {
      hops.push(<Packet key="pf" path={GO} label={`OPTIONS ${run.label.split(' ')[1]}`} color="var(--violet)" duration={HOP} delay={t} />);
      hops.push(<Packet key="pf-back" path={BACK} label={s.ok ? '204 allowed' : 'no CORS headers'} color={s.ok ? 'var(--violet)' : 'var(--bad)'} duration={HOP} delay={t + HOP} />);
      t += HOP * 2;
    } else if (s.kind === 'request') {
      hops.push(<Packet key="req" path={GO} label={run.label} color="var(--info)" duration={HOP} delay={t} />);
      hops.push(
        <motion.rect
          key="ran"
          x={SERVER.x - NODE.w / 2 - 5}
          y={SERVER.y - NODE.h / 2 - 5}
          width={NODE.w + 10}
          height={NODE.h + 10}
          rx={14}
          className="cors-ran"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.45] }}
          transition={{ delay: t + HOP * 0.7, duration: 0.9 }}
        />,
      );
      t += HOP;
    } else {
      hops.push(<Packet key="res" path={BACK} label={s.ok ? '200 · readable' : '200 · hidden from JS'} color={s.ok ? 'var(--ok)' : 'var(--bad)'} duration={HOP} delay={t} />);
      t += HOP;
    }
  }
  return <>{hops}</>;
}

function ConsoleError({ outcome, label }: { outcome: Outcome; label: string }) {
  const reason = outcome.steps.find((s) => s.reason)?.reason;
  return (
    <p className="cors-console">
      Access to fetch at &apos;{API}{label.split(' ')[1]}&apos; from origin &apos;{ORIGIN}&apos; has been blocked by CORS policy: {reason}
    </p>
  );
}

function HeaderList({ title, headers, empty = '(none)' }: { title: string; headers: Headers; empty?: string }) {
  return (
    <div className="cors-header-list">
      <SectionTitle>{title}</SectionTitle>
      {headers.length ? (
        <code>
          {headers.map(([n, v]) => (
            <span key={n} className={n.startsWith('Access-Control') ? 'is-cors' : n === 'Origin' ? 'is-origin' : ''}>
              {n}: {v}
              {'\n'}
            </span>
          ))}
        </code>
      ) : (
        <span className="empty-note">{empty}</span>
      )}
    </div>
  );
}

const stepTone = (s: Step) => (s.kind === 'preflight' ? (s.ok ? 'violet' : 'bad') : s.kind === 'request' ? 'hi' : s.ok ? 'ok' : 'bad');

function captionFor(o: Outcome, client: Client): ReactNode {
  if (client === 'curl') return <>curl got the data: <span className="hl bad">CORS isn&apos;t security for your API</span>. Only browsers enforce it, to protect the <i>user</i>.</>;
  if (o.preflighted && !o.reachedServer) {
    return <>This request isn&apos;t "simple", so a <span className="hl violet">preflight</span> asked first, and wasn&apos;t allowed. The real request was never sent.</>;
  }
  if (o.readable) return <>The response carried the right CORS headers, so the browser let the page <span className="hl ok">read</span> it.</>;
  return (
    <>The request <span className="hl">reached the server and ran</span>. The browser then <span className="hl bad">hid the response</span> from the page. CORS decides who can read, not what gets sent.</>
  );
}
