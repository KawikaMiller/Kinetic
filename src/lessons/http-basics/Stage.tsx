import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useReducer, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import {
  FAMILY_COLOR, INITIAL_SERVER, REASON, currentEtag, family, handle, hasBody, rawRequest, rawResponse,
  type Auth, type Family, type Method, type Mode, type Req, type Res, type ServerState,
} from './server';
import './styles.css';

type Phase = 'out' | 'server' | 'back' | 'done';
const DURATION: Record<Phase, number> = { out: 850, server: 750, back: 850, done: 350 };

interface Exchange {
  id: number;
  req: Req;
  res: Res;
  after: ServerState;
  phase: Phase;
}

interface LogItem {
  id: number;
  label: string;
  status: number;
}

interface State {
  server: ServerState;
  ex: Exchange | null;
  queue: Req[];
  log: LogItem[];
  n: number;
}

type Action = { type: 'send'; reqs: Req[] } | { type: 'advance' } | { type: 'mode'; mode: Mode } | { type: 'reset' };

function start(s: State, req: Req): State {
  const { res, after } = handle(req, s.server);
  return { ...s, ex: { id: s.n + 1, req, res, after, phase: 'out' }, n: s.n + 1 };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case 'send': {
      const queue = [...s.queue, ...a.reqs];
      if (s.ex && s.ex.phase !== 'done') return { ...s, queue };
      const [next, ...rest] = queue;
      return start({ ...s, queue: rest }, next);
    }
    case 'advance': {
      const ex = s.ex;
      if (!ex) return s;
      if (ex.phase === 'out') return { ...s, server: ex.after, ex: { ...ex, phase: 'server' } };
      if (ex.phase === 'server') return { ...s, ex: { ...ex, phase: 'back' } };
      if (ex.phase === 'back') {
        const log = [...s.log, { id: ex.id, label: `${ex.req.method} ${ex.req.path}`, status: ex.res.status }].slice(-6);
        return { ...s, ex: { ...ex, phase: 'done' }, log };
      }
      if (!s.queue.length) return s;
      const [next, ...rest] = s.queue;
      return start({ ...s, queue: rest }, next);
    }
    case 'mode':
      return { ...s, server: { ...s.server, mode: a.mode } };
    case 'reset':
      return { ...INITIAL_STATE, server: { ...INITIAL_SERVER, mode: s.server.mode } };
  }
}

const INITIAL_STATE: State = { server: INITIAL_SERVER, ex: null, queue: [], log: [], n: 0 };

const METHODS: Method[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
// Per RFC 9110: safe = read-only; idempotent = repeating it leaves the server in the same state.
const MATRIX: Record<Method, { safe: boolean; idem: boolean | 'maybe' }> = {
  GET: { safe: true, idem: true },
  POST: { safe: false, idem: false },
  PUT: { safe: false, idem: true },
  PATCH: { safe: false, idem: 'maybe' },
  DELETE: { safe: false, idem: true },
};

const FAMILIES: { f: Family; label: string }[] = [
  { f: '2xx', label: 'success' },
  { f: '3xx', label: 'redirect / cached' },
  { f: '4xx', label: 'client error' },
  { f: '5xx', label: 'server error' },
];

interface Draft {
  method: Method;
  path: string;
  auth: Auth;
  etag: boolean;
  body: string;
}

export function Stage() {
  const setCaption = useSetCaption();
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE);
  const [draft, setDraft] = useState<Draft>({ method: 'GET', path: '/users/1', auth: 'none', etag: false, body: '{"name":"Grace"}' });
  const { server, ex, queue, log } = state;

  const toReq = (d: Draft): Req => ({
    method: d.method,
    path: d.path,
    auth: d.auth,
    etag: d.etag ? currentEtag(server, 1) : null,
    body: d.body,
  });

  // Walk the exchange through its phases.
  useEffect(() => {
    if (!ex || (ex.phase === 'done' && !queue.length)) return;
    const t = setTimeout(() => dispatch({ type: 'advance' }), DURATION[ex.phase]);
    return () => clearTimeout(t);
  }, [ex, queue.length]);

  // Narrate it.
  useEffect(() => {
    if (!ex) {
      setCaption(<>Build a request below (or pick a scenario) and hit <b>Send</b>. Watch what comes back.</>);
      return;
    }
    if (ex.phase === 'out') {
      setCaption(
        <>
          Sending <span className="hl violet">{ex.req.method} {ex.req.path}</span>: a <b>method</b> (what to do) plus a{' '}
          <b>path</b> (to what).
        </>,
      );
    } else if (ex.phase === 'server') {
      setCaption(
        <>
          <span className="hl" style={{ color: FAMILY_COLOR[family(ex.res.status)] }}>
            {ex.res.status} {REASON[ex.res.status]}
          </span>{' '}
          {ex.res.explain}
        </>,
      );
    }
  }, [ex, setCaption]);

  const send = (d: Draft, times = 1) => {
    setDraft(d);
    dispatch({ type: 'send', reqs: Array.from({ length: times }, () => toReq(d)) });
  };

  const preset = (p: Partial<Draft>) => send({ ...draft, auth: 'none', etag: false, ...p });

  const busy = !!ex && ex.phase !== 'done';
  const shownRes = ex && (ex.phase === 'back' || ex.phase === 'done') ? ex.res : null;
  const fam = shownRes ? family(shownRes.status) : null;
  const users = Object.entries(server.users);

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Requests" value={state.n} color="var(--violet)" />
          <Stat
            label="Last status"
            value={log.length ? log[log.length - 1].status : '·'}
            color={log.length ? FAMILY_COLOR[family(log[log.length - 1].status)] : undefined}
          />
          <Stat label="Users on server" value={users.length} color="var(--info)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'request' },
            ...FAMILIES.map((x) => ({ color: FAMILY_COLOR[x.f], label: `${x.f} ${x.label}` })),
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Method" value={draft.method} onChange={(m) => setDraft({ ...draft, method: m })} options={METHODS.map((m) => ({ value: m, label: m }))} />
          <label className="hb-input">
            <span>Path</span>
            <input value={draft.path} onChange={(e) => setDraft({ ...draft, path: e.target.value })} spellCheck={false} />
          </label>
          <label className={`hb-input hb-body ${hasBody(draft.method) ? '' : 'off'}`}>
            <span>JSON body</span>
            <input
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              disabled={!hasBody(draft.method)}
              spellCheck={false}
            />
          </label>
        </>,
        <>
          <Segmented
            label="Authorization"
            value={draft.auth}
            onChange={(a) => setDraft({ ...draft, auth: a })}
            options={[
              { value: 'none', label: 'none' },
              { value: 'user', label: 'user token' },
              { value: 'admin', label: 'admin token' },
            ]}
          />
          <Toggle
            label="If-None-Match"
            value={draft.etag}
            onChange={(etag) => setDraft({ ...draft, etag })}
            off="off"
            on={`${currentEtag(server, 1)} (user 1)`}
          />
          <Button variant="primary" onClick={() => send(draft)} className="hb-send">
            Send
          </Button>
          <Button onClick={() => send(draft, 3)}>Send it 3×</Button>
        </>,
        <>
          <div className="hb-presets">
            <span className="hb-presets-label">Scenarios</span>
            <Button onClick={() => preset({ method: 'GET', path: '/users/1' })}>Read a user</Button>
            <Button onClick={() => preset({ method: 'POST', path: '/users', body: '{"name":"Grace"}' })}>Create a user</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/users/99' })}>Missing user</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/users/1', etag: true })}>Cached copy</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/admin' })}>Not logged in</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/admin', auth: 'user' })}>Wrong role</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/crash' })}>Server bug</Button>
          </div>
          <Segmented
            label="Server"
            value={server.mode}
            onChange={(m) => dispatch({ type: 'mode', mode: m })}
            options={[
              { value: 'healthy', label: 'Healthy' },
              { value: 'ratelimited', label: 'Rate limited' },
              { value: 'overloaded', label: 'Overloaded' },
            ]}
          />
          <Button onClick={() => dispatch({ type: 'reset' })}>Reset data</Button>
        </>,
      ]}
    >
      <div className="hb">
        <div className="hb-scene">
          <div className={`hb-node ${ex && (ex.phase === 'out' || ex.phase === 'done') ? 'on' : ''}`}>
            <div className="hb-node-title">Client</div>
            <div className="hb-node-sub">your app / browser / curl</div>
            <div className="hb-client-last">
              {shownRes && ex?.phase === 'done' ? (
                <motion.span
                  key={ex.id}
                  className="hb-badge"
                  style={{ background: FAMILY_COLOR[fam!] }}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                >
                  {shownRes.status} {REASON[shownRes.status]}
                </motion.span>
              ) : (
                <span className="muted">{busy ? 'waiting…' : 'idle'}</span>
              )}
            </div>
          </div>

          <div className="hb-wire">
            <div className="hb-wire-line" />
            <AnimatePresence>
              {ex && ex.phase === 'out' && (
                <motion.div
                  key={`q${ex.id}`}
                  className="hb-env hb-env-req"
                  initial={{ left: '0%', opacity: 0, scale: 0.7 }}
                  animate={{ left: '100%', opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: DURATION.out / 1000, ease: 'easeInOut' }}
                >
                  {ex.req.method} {ex.req.path}
                </motion.div>
              )}
              {ex && ex.phase === 'back' && (
                <motion.div
                  key={`s${ex.id}`}
                  className="hb-env"
                  style={{ background: FAMILY_COLOR[family(ex.res.status)] }}
                  initial={{ left: '100%', opacity: 0, scale: 0.7 }}
                  animate={{ left: '0%', opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: DURATION.back / 1000, ease: 'easeInOut' }}
                >
                  {ex.res.status} {REASON[ex.res.status]}
                </motion.div>
              )}
            </AnimatePresence>
            {queue.length > 0 && <span className="hb-queue">+{queue.length} queued</span>}
          </div>

          <div className={`hb-node hb-server ${ex?.phase === 'server' ? 'on' : ''} mode-${server.mode}`}>
            <div className="hb-node-title">
              api.example.com
              {server.mode !== 'healthy' && <span className="hb-mode">{server.mode === 'ratelimited' ? 'rate limited' : 'overloaded'}</span>}
            </div>
            <div className="hb-node-sub">/users · /admin · /crash</div>
            <ul className="hb-users">
              <AnimatePresence initial={false}>
                {users.map(([id, u]) => (
                  <motion.li
                    key={id}
                    layout
                    className={ex && ex.phase !== 'out' && ex.res.touched === Number(id) ? 'touched' : ''}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20, transition: { duration: 0.3 } }}
                  >
                    <span className="hb-uid">/users/{id}</span>
                    <span className="hb-uname">{u.name}</span>
                    <span className="hb-uv">v{u.v}</span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {!users.length && <li className="muted">no users</li>}
            </ul>
          </div>
        </div>

        <div className="hb-raw">
          <div className="hb-raw-box">
            <span className="hb-raw-label">Request</span>
            <pre>{ex ? rawRequest(ex.req) : rawRequest(toReq(draft))}</pre>
          </div>
          <div className="hb-raw-box" style={fam ? ({ '--c': FAMILY_COLOR[fam] } as CSSProperties) : undefined}>
            <span className="hb-raw-label">Response</span>
            <pre className={shownRes ? 'has' : ''}>{shownRes ? rawResponse(shownRes) : ex ? '…waiting for the server' : '(nothing yet)'}</pre>
          </div>
        </div>

        <div className="hb-bottom">
          <table className="hb-matrix">
            <thead>
              <tr>
                <th>Method</th>
                <th title="Only reads; never changes server state">Safe</th>
                <th title="Doing it twice leaves the server in the same state as once">Idempotent</th>
              </tr>
            </thead>
            <tbody>
              {METHODS.map((m) => {
                const row = MATRIX[m];
                const on = (ex ? ex.req.method : draft.method) === m;
                return (
                  <tr key={m} className={on ? 'on' : ''}>
                    <td>{m}</td>
                    <td className={row.safe ? 'yes' : 'no'}>{row.safe ? '✓' : '✗'}</td>
                    <td className={row.idem === true ? 'yes' : row.idem === 'maybe' ? 'maybe' : 'no'}>
                      {row.idem === true ? '✓' : row.idem === 'maybe' ? 'not guaranteed' : '✗'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="hb-log">
            <span className="hb-raw-label">Recent responses</span>
            {log.length === 0 && <p className="muted">None yet.</p>}
            <AnimatePresence initial={false}>
              {log
                .slice()
                .reverse()
                .map((l) => (
                  <motion.div key={l.id} className="hb-log-row" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                    <span className="hb-log-status" style={{ color: FAMILY_COLOR[family(l.status)] }}>
                      {l.status}
                    </span>
                    <span>{l.label}</span>
                  </motion.div>
                ))}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </StageFrame>
  );
}
