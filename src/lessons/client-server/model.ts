// Shapes, positions and payloads for the client–server scenes. The scripts that build
// frames from these (with captions) are in frames.tsx.
import type { Frame } from '../../core/types';

export type Scenario = 'request' | 'scale' | 'down' | 'breaking';
export type Client = 'browser' | 'mobile' | 'cli';
export type NodeId = Client | 'lb' | 'api1' | 'api2' | 'api3' | 'db';
export type Kind = 'req' | 'db' | 'ok' | 'bad';
/** Which API shape the server is serving. */
export type ApiVersion = 'v1' | 'v2' | 'both';

export const CLIENTS: Client[] = ['browser', 'mobile', 'cli'];
export const isClient = (n: NodeId): n is Client => (CLIENTS as NodeId[]).includes(n);

export const COLOR: Record<Kind, string> = { req: 'var(--info)', db: 'var(--violet)', ok: 'var(--ok)', bad: 'var(--bad)' };

export const POS: Record<NodeId, { x: number; y: number }> = {
  browser: { x: 95, y: 70 },
  mobile: { x: 95, y: 180 },
  cli: { x: 95, y: 290 },
  lb: { x: 450, y: 180 },
  api1: { x: 640, y: 180 },
  api2: { x: 640, y: 80 },
  api3: { x: 640, y: 280 },
  db: { x: 840, y: 180 },
};

export const CLIENT_LABEL: Record<Client, string> = { browser: 'Web app', mobile: 'Mobile app', cli: 'CLI / script' };

export interface Msg {
  from: NodeId;
  to: NodeId;
  label: string;
  kind: Kind;
  /** The request never gets an answer (server down): it stops halfway. */
  fail?: boolean;
  /** The HTTP call behind a pill whose label doesn't spell it out (a retry). */
  call?: string;
}

export interface Screen {
  text: string;
  tone?: 'ok' | 'bad';
}

export interface CsFrame extends Frame {
  msg: Msg | null;
  down: boolean;
  version: ApiVersion;
  json: string | null;
  screens: Record<Client, Screen>;
  /** Requests clients have sent (a load balancer forwarding one isn't a new request). */
  sent: number;
  /** Failed calls and broken responses so far. */
  errors: number;
}

export const USER_V1 = '{ "id": 42, "name": "Ada", "email": "ada@ex.com" }';
export const USER_V2 = '{ "id": 42, "fullName": "Ada", "email": "ada@ex.com" }';
export const CART = '{ "items": [ "book", "lamp", "mug" ] }';

/** The contract panel's endpoints for each API version. */
export const ENDPOINTS: Record<ApiVersion, string[]> = {
  v1: ['GET /users/{id} → { id, name, email }', 'GET /cart → { items: [...] }'],
  v2: ['GET /users/{id} → { id, fullName, email }', 'GET /cart → { items: [...] }'],
  both: ['GET /users/{id} → { id, name, email }  (v1)', 'GET /v2/users/{id} → { id, fullName, email }'],
};

export const blankScreens = (): Record<Client, Screen> => ({ browser: { text: '…' }, mobile: { text: '…' }, cli: { text: '$ _' } });

/** Appends frames, carrying state forward and keeping the request/error counters. */
export function frameRecorder() {
  const frames: CsFrame[] = [];
  let cur: CsFrame = { msg: null, down: false, version: 'v1', json: null, screens: blankScreens(), sent: 0, errors: 0 };
  return {
    frames,
    push(p: Partial<CsFrame>, screens?: Partial<Record<Client, Screen>>) {
      cur = { ...cur, msg: null, ...p, screens: { ...cur.screens, ...screens } };
      if (cur.msg?.kind === 'req' && isClient(cur.msg.from)) cur.sent += 1;
      if (cur.msg?.fail || cur.msg?.kind === 'bad') cur.errors += 1;
      frames.push(cur);
    },
  };
}

export const msg = (from: NodeId, to: NodeId, label: string, kind: Kind, fail = false): Msg => ({ from, to, label, kind, fail });

/** Retry delays a client waits before attempt 2, 3, …: exponential backoff from `base` seconds. */
export const backoff = (attempts: number, base = 2) => Array.from({ length: attempts }, (_, i) => base * 2 ** i);

/** The contract line a request calls (`GET /v2/users/42` → the /v2/users entry), or -1. */
export function endpointFor(msg: Pick<Msg, 'label' | 'call'>, endpoints: string[]): number {
  const path = (msg.call ?? msg.label).replace(/^(GET|curl) /, '').split(' ')[0].replace(/\/\d+$/, '/{id}');
  return endpoints.findIndex((e) => e.split(' ')[1] === path);
}
