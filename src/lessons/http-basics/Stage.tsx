import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useReducer, useState, type CSSProperties } from 'react';
import { Flyer } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { INITIAL_EXCHANGE, exchangeReducer, nextAdvanceMs, PHASE_MS } from './exchange';
import { explain } from './explain';
import {
  FAMILY_COLOR, METHODS, METHOD_PROPERTIES, REASON, REQUEST_COLOR, STALE_ETAG, currentEtag, family, hasBody,
  rawRequest, rawResponse, type Auth, type Family, type Method, type Req,
} from './server';
import './styles.css';

/** Ends of the wire the envelopes travel along, in % of its width. */
const CLIENT_END = { x: 0, y: 0 };
const SERVER_END = { x: 100, y: 0 };

const FAMILIES: { f: Family; label: string }[] = [
  { f: '2xx', label: 'success' },
  { f: '3xx', label: 'redirect / cached' },
  { f: '4xx', label: 'client error' },
  { f: '5xx', label: 'server error' },
];

/** What the client sends as If-None-Match for user 1. */
type CacheCopy = 'none' | 'current' | 'stale';

interface Draft {
  method: Method;
  path: string;
  auth: Auth;
  cache: CacheCopy;
  body: string;
}

export function Stage() {
  const setCaption = useSetCaption();
  const [state, dispatch] = useReducer(exchangeReducer, INITIAL_EXCHANGE);
  const [draft, setDraft] = useState<Draft>({ method: 'GET', path: '/users/1', auth: 'none', cache: 'none', body: '{"name":"Grace"}' });
  const { server, ex, queue, log } = state;

  const etagFor = (c: CacheCopy) => (c === 'current' ? currentEtag(server, 1) : c === 'stale' ? STALE_ETAG : null);
  const toReq = (d: Draft): Req => ({ method: d.method, path: d.path, auth: d.auth, etag: etagFor(d.cache), body: d.body });

  // Walk the exchange through its phases. Keyed on the delay, not the queue length, so
  // clicking Send repeatedly mid-flight queues requests without restarting the timer.
  const delay = nextAdvanceMs(state);
  useEffect(() => {
    if (delay === null) return;
    const t = setTimeout(() => dispatch({ type: 'advance' }), delay);
    return () => clearTimeout(t);
  }, [ex, delay]);

  // Narrate it.
  useEffect(() => {
    if (!ex) {
      setCaption(<>Build a request below (or pick a scenario) and hit <b>Send</b>. Watch what comes back.</>);
      return;
    }
    if (ex.phase === 'out') {
      setCaption(
        <>
          Sending <span className="hl info">{ex.req.method} {ex.req.path}</span>: a <b>method</b> (what to do) plus a{' '}
          <b>path</b> (to what).
        </>,
      );
    } else if (ex.phase === 'server') {
      setCaption(
        <>
          <span className="hl" style={{ color: FAMILY_COLOR[family(ex.res.status)] }}>
            {ex.res.status} {REASON[ex.res.status]}
          </span>{' '}
          {explain(ex.res.outcome)}
        </>,
      );
    }
  }, [ex, setCaption]);

  const send = (d: Draft, times = 1) => {
    setDraft(d);
    dispatch({ type: 'send', reqs: Array.from({ length: times }, () => toReq(d)) });
  };

  const preset = (p: Partial<Draft>) => send({ ...draft, auth: 'none', cache: 'none', ...p });

  const busy = !!ex && ex.phase !== 'done';
  const shownRes = ex && (ex.phase === 'back' || ex.phase === 'done') ? ex.res : null;
  const fam = shownRes ? family(shownRes.status) : null;
  const users = Object.entries(server.users);

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Requests" value={state.n} color={REQUEST_COLOR} />
          <Stat
            label="Last status"
            value={log.length ? log[log.length - 1].status : '·'}
            color={log.length ? FAMILY_COLOR[family(log[log.length - 1].status)] : undefined}
          />
          <Stat label="Users on server" value={users.length} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: REQUEST_COLOR, label: 'request' },
            ...FAMILIES.map((x) => ({ color: FAMILY_COLOR[x.f], label: `${x.f} ${x.label}` })),
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Method" value={draft.method} onChange={(m) => setDraft({ ...draft, method: m })} options={METHODS.map((m) => ({ value: m, label: m }))} />
          <TextField className="hb-input" label="Path" value={draft.path} onChange={(path) => setDraft({ ...draft, path })} spellCheck={false} />
          <TextField
            className="hb-input hb-body"
            label="JSON body"
            value={draft.body}
            onChange={(body) => setDraft({ ...draft, body })}
            disabled={!hasBody(draft.method)}
            spellCheck={false}
          />
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
          <Segmented
            label="If-None-Match (user 1)"
            value={draft.cache}
            onChange={(cache) => setDraft({ ...draft, cache })}
            options={[
              { value: 'none', label: 'off' },
              { value: 'current', label: `current ${currentEtag(server, 1)}` },
              { value: 'stale', label: `stale ${STALE_ETAG}` },
            ]}
          />
          <Button variant="primary" onClick={() => send(draft)} className="hb-send">
            Send
          </Button>
          <Button onClick={() => send(draft, 3)}>Send it 3×</Button>
        </>,
        <>
          <ControlGroup inline label="Scenarios" className="hb-presets">
            <Button onClick={() => preset({ method: 'GET', path: '/users/1' })}>Read a user</Button>
            <Button onClick={() => preset({ method: 'POST', path: '/users', body: '{"name":"Grace"}' })}>Create a user</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/users/99' })}>Missing user</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/users/1', cache: 'current' })}>Cached copy</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/admin' })}>Not logged in</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/admin', auth: 'user' })}>Wrong role</Button>
            <Button onClick={() => preset({ method: 'GET', path: '/crash' })}>Server bug</Button>
          </ControlGroup>
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
                <Flyer key={`q${ex.id}`} axis="x" from={CLIENT_END} to={SERVER_END} className="hb-env hb-env-req"
                  fade="in" startScale={0.7} duration={PHASE_MS.out / 1000}>
                  {ex.req.method} {ex.req.path}
                </Flyer>
              )}
              {ex && ex.phase === 'back' && (
                <Flyer key={`s${ex.id}`} axis="x" from={SERVER_END} to={CLIENT_END} className="hb-env"
                  style={{ background: FAMILY_COLOR[family(ex.res.status)] }}
                  fade="in" startScale={0.7} duration={PHASE_MS.back / 1000}>
                  {ex.res.status} {REASON[ex.res.status]}
                </Flyer>
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
                const row = METHOD_PROPERTIES[m];
                const on = (ex ? ex.req.method : draft.method) === m;
                return (
                  <tr key={m} className={on ? 'on' : ''}>
                    <td>{m}</td>
                    <td className={row.safe ? 'yes' : 'no'}>{row.safe ? '✓' : '✗'}</td>
                    <td className={row.idempotent === true ? 'yes' : row.idempotent === 'maybe' ? 'maybe' : 'no'}>
                      {row.idempotent === true ? '✓' : row.idempotent === 'maybe' ? 'not guaranteed' : '✗'}
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
        <Hint block>
          Simulated API running in your browser; nothing is sent over the network. To keep the demo short it lets anyone
          PUT, PATCH or DELETE users. A real API would check the token on every write, not just on /admin.
        </Hint>
      </div>
    </StageFrame>
  );
}
