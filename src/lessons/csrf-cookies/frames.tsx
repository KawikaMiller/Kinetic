import type { ReactNode } from 'react';
import type { SequenceActor, SequenceMessage } from '../../components/SequenceDiagram';
import type { Tone } from '../../core/tone';
import type { Frame } from '../../core/types';
import {
  CUSTOM_HEADER, OTHER, SHOP, evaluate, methodOf, type Config, type ForgeKind, type Outcome, type SameSiteMode, type StopPoint,
} from './model';

export interface CsrfFrame extends Frame {
  /** Index of the current message in the ladder. */
  step: number;
}

export const ACTORS: SequenceActor[] = [
  { id: 'you', label: 'You (browser)', tone: 'info' },
  { id: 'shop', label: SHOP },
  { id: 'other', label: OTHER, tone: 'orange' },
];

const MODE_NAME: Record<SameSiteMode, string> = { none: 'SameSite=None', lax: 'SameSite=Lax', strict: 'SameSite=Strict' };

export type Verdict = 'accepted' | 'rejected' | 'never sent';

export function verdictOf(o: Outcome): Verdict {
  if (!o.sent) return 'never sent';
  return o.harm ? 'accepted' : 'rejected';
}

const STATUS: Record<Exclude<StopPoint, 'preflight'>, string> = { 'no-credential': '401 not logged in', origin: '403 wrong origin', token: '403 bad token', header: '403 missing header' };

/** The ladder: setup, the other site's page, then the forged request and what happened to it. */
export function ladder(c: Config): SequenceMessage[] {
  const o = evaluate(c);
  const method = methodOf(c.kind);
  const setup: SequenceMessage[] = [
    { id: 'login', from: 'you', to: 'shop', label: 'log in', tone: 'info' },
    {
      id: 'session', from: 'shop', to: 'you', tone: 'info',
      label: c.auth === 'cookie' ? `Set-Cookie: session (${MODE_NAME[c.mode]}${c.mode === 'none' ? '; Secure' : ''})` : 'token in the reply',
      note: c.auth === 'cookie' ? undefined : 'the app keeps it in script memory',
    },
    { id: 'visit', from: 'you', to: 'other', label: `visit ${OTHER}`, tone: 'info' },
    { id: 'page', from: 'other', to: 'you', tone: 'orange', label: FORGE_PAGE[c.kind], note: 'a page on another site can make your browser send a request' },
  ];
  if (o.preflight) {
    return [
      ...setup,
      { id: 'preflight', from: 'you', to: 'shop', label: `OPTIONS: may ${OTHER} send ${CUSTOM_HEADER}?`, tone: 'orange' },
      { id: 'refused', from: 'shop', to: 'you', label: 'no: not an allowed origin', tone: 'ok' },
      { id: 'request', from: 'you', to: 'shop', label: `${method} /email/change`, lost: true, tone: 'orange', note: 'blocked by the browser, never sent' },
    ];
  }
  const cookieNote = c.auth === 'bearer'
    ? 'no Authorization header: the browser never adds it by itself'
    : o.cookieSent ? 'Cookie attached' : `no cookie: ${MODE_NAME[c.mode]}`;
  return [
    ...setup,
    { id: 'request', from: 'you', to: 'shop', label: `${method} /email/change`, tone: 'orange', note: cookieNote },
    o.harm
      ? { id: 'reply', from: 'shop', to: 'you', label: '200 email changed', tone: 'bad' as Tone, note: 'looks like your own click' }
      : { id: 'reply', from: 'shop', to: 'you', label: STATUS[o.stoppedAt as Exclude<StopPoint, 'preflight'>], tone: 'ok' as Tone, note: 'nothing changed' },
  ];
}

const FORGE_PAGE: Record<ForgeKind, string> = {
  form: 'page with a hidden form',
  fetch: 'page with a script',
  link: 'page with a link',
};

const HOW: Record<ForgeKind, ReactNode> = {
  form: <>an auto-submitted form</>,
  fetch: <>a script call that asks the browser to include credentials</>,
  link: <>a link you click</>,
};

/** Why the cookie did or didn't go along, from the mode and the kind of request. */
function cookieReason(c: Config, sent: boolean): ReactNode {
  if (c.auth === 'bearer') return <>The app adds its token to its own requests by hand, so the browser attaches no credential to this one.</>;
  if (c.mode === 'none') return <><span className="hl hi">SameSite=None</span> sends the cookie on every request, including ones another site caused.</>;
  if (c.mode === 'lax') {
    return sent
      ? <><span className="hl hi">SameSite=Lax</span> still sends the cookie on a top-level GET navigation, which a link click is. That is why a GET must never change state.</>
      : <><span className="hl ok">SameSite=Lax</span> only sends the cookie on top-level GET navigations, not on a cross-site POST.</>;
  }
  return <><span className="hl ok">SameSite=Strict</span> never sends the cookie on a request another site caused.</>;
}

function replyCaption(o: Outcome, link: boolean): ReactNode {
  if (o.harm) {
    return (
      <>
        <span className="hl bad">Accepted.</span> The cookie is valid and nothing checks where the request came from, so the server cannot tell this from
        your own click: the email changed. The browser may hide the reply from {OTHER} (that is CORS), but the change already happened.
      </>
    );
  }
  switch (o.stoppedAt) {
    case 'no-credential':
      return <><span className="hl ok">Rejected: logged out.</span> The request arrived without a credential, so the server treats it as a stranger&apos;s and changes nothing.</>;
    case 'origin':
      return <><span className="hl ok">Rejected by the Origin check.</span> {link
        ? <>A link click carries a <code>Referer</code> rather than an Origin, and it was {OTHER}, not {SHOP}. A Referer can be missing or trimmed by the browser&apos;s referrer policy, so treat this check as a layer, not a guarantee.</>
        : <>The browser tells the server who started the request, and it was {OTHER}, not {SHOP}.</>}</>;
    case 'token':
      return <><span className="hl ok">Rejected by the CSRF token check.</span> The token lives in {SHOP}&apos;s own pages and {OTHER} cannot read them, so the request carries none that matches.</>;
    default:
      return <><span className="hl ok">Rejected: no custom header.</span> A form or a link cannot set <code>{CUSTOM_HEADER}</code> or a JSON content type, so the server turns it away.</>;
  }
}

export function stepCaption(c: Config, id: string): ReactNode {
  const o = evaluate(c);
  switch (id) {
    case 'login':
      return <>You log in to {SHOP}. (Setup: a session is created for you.)</>;
    case 'session':
      return c.auth === 'cookie'
        ? <>The server sets a session cookie with <span className="hl hi">{MODE_NAME[c.mode]}</span>. That attribute decides when your browser attaches it to a request.</>
        : <>The app keeps a token in script memory and adds it to its own requests by hand. The browser never attaches it by itself: that is the trade-off with cookies.</>;
    case 'visit':
      return <>You, still logged in, open a page on {OTHER}.</>;
    case 'page':
      return <>That page makes your browser send a request to {SHOP}: <span className="hl orange">{HOW[c.kind]}</span>. A page on another site can make your browser send a request.</>;
    case 'preflight':
      return <>The server requires <code>{CUSTOM_HEADER}</code>, so a script on another site must ask permission first: the browser sends a CORS preflight.</>;
    case 'refused':
      return <>{SHOP} does not list {OTHER} as an allowed origin, so the answer is no (see the cors-same-origin lesson).</>;
    case 'request':
      return o.preflight
        ? <><span className="hl ok">Blocked by the browser.</span> The preflight was refused, so the request is never sent{c.auth === 'cookie' ? ' and your cookie never leaves' : ''}.</>
        : <>The request leaves for {SHOP}. {o.cookieSent ? <><span className="hl hi">Your cookie is attached.</span> </> : null}{cookieReason(c, o.cookieSent)}</>;
    default:
      return replyCaption(o, c.kind === 'link');
  }
}

export function frames(c: Config): CsrfFrame[] {
  return ladder(c).map((m, step) => ({ step, say: stepCaption(c, m.id) }));
}

/** The first message the forged request is part of. */
export const requestStep = (c: Config) => ladder(c).findIndex((m) => m.id === 'request');
