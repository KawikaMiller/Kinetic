// The browser's side of CORS, following the Fetch standard for the parts the lesson shows:
// which requests are "simple", when a preflight goes first, and the check on each response.

export type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ClientRequest {
  method: Method;
  path: string;
  /** Headers the page's JavaScript sets (not ones the browser adds, like Origin or Cookie). */
  headers: Record<string, string>;
  /** `credentials: 'include'`: send cookies, and demand the stricter response headers. */
  credentials: boolean;
}

/** Methods a cross-origin request can use without a preflight. */
export const SAFELISTED_METHODS: readonly Method[] = ['GET', 'HEAD', 'POST'];
/** The only Content-Type values a simple request may have. */
export const SAFELISTED_CONTENT_TYPES = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain'];
const SAFELISTED_HEADERS = new Set(['accept', 'accept-language', 'content-language', 'content-type']);
/** Longest value a safelisted header may have (bytes, ASCII here). */
const SAFELISTED_MAX = 128;

/** Is this header one a page may set without triggering a preflight? */
export function isSafelistedHeader(name: string, value: string): boolean {
  const n = name.toLowerCase();
  if (!SAFELISTED_HEADERS.has(n) || value.length > SAFELISTED_MAX) return false;
  if (n === 'content-type') {
    const essence = value.split(';')[0].trim().toLowerCase();
    return SAFELISTED_CONTENT_TYPES.includes(essence);
  }
  return true;
}

/** A "simple" request goes straight out: a safelisted method and only safelisted headers. */
export const isSimple = (req: ClientRequest) =>
  SAFELISTED_METHODS.includes(req.method) && Object.entries(req.headers).every(([n, v]) => isSafelistedHeader(n, v));

/** Header names a preflight has to ask permission for. */
export const unsafeHeaderNames = (req: ClientRequest) =>
  Object.entries(req.headers).filter(([n, v]) => !isSafelistedHeader(n, v)).map(([n]) => n.toLowerCase()).sort();

export type AllowOrigin = 'none' | 'wildcard' | 'exact';

/** How the API server is configured to answer cross-origin requests. */
export interface ServerConfig {
  allowOrigin: AllowOrigin;
  allowCredentials: boolean;
  /** Whether it answers OPTIONS preflights, and with which methods and headers. */
  preflight: { methods: Method[]; headers: string[] } | null;
}

export type Headers = [name: string, value: string][];

/** The CORS response headers this server sends to a request from `origin`. */
export function corsHeaders(server: ServerConfig, origin: string): Headers {
  const h: Headers = [];
  if (server.allowOrigin === 'wildcard') h.push(['Access-Control-Allow-Origin', '*']);
  if (server.allowOrigin === 'exact') h.push(['Access-Control-Allow-Origin', origin], ['Vary', 'Origin']);
  if (server.allowOrigin !== 'none' && server.allowCredentials) h.push(['Access-Control-Allow-Credentials', 'true']);
  return h;
}

const get = (h: Headers, name: string) => h.find(([n]) => n.toLowerCase() === name.toLowerCase())?.[1];

export interface Check {
  ok: boolean;
  reason: string;
}

/** The CORS check the browser runs on a response before letting JavaScript read it. */
export function corsCheck(response: Headers, origin: string, credentials: boolean): Check {
  const acao = get(response, 'Access-Control-Allow-Origin');
  if (acao === undefined) return { ok: false, reason: "No 'Access-Control-Allow-Origin' header is present." };
  if (credentials) {
    if (acao === '*') return { ok: false, reason: "'Access-Control-Allow-Origin' can't be '*' when the request includes credentials." };
    if (acao !== origin) return { ok: false, reason: `'Access-Control-Allow-Origin' is ${acao}, not ${origin}.` };
    if (get(response, 'Access-Control-Allow-Credentials') !== 'true') {
      return { ok: false, reason: "Credentials were sent but 'Access-Control-Allow-Credentials' isn't 'true'." };
    }
    return { ok: true, reason: 'Exact origin and Allow-Credentials: true, so a request with cookies may be read.' };
  }
  if (acao === '*' || acao === origin) return { ok: true, reason: `'Access-Control-Allow-Origin: ${acao}' covers ${origin}.` };
  return { ok: false, reason: `'Access-Control-Allow-Origin' is ${acao}, not ${origin}.` };
}

/** The preflight's response headers, and whether it grants this request. */
export function preflight(req: ClientRequest, server: ServerConfig, origin: string): { response: Headers; check: Check } {
  if (!server.preflight) {
    return { response: [], check: { ok: false, reason: 'The server has no handler for OPTIONS, so the preflight got no CORS headers.' } };
  }
  const allow = server.preflight;
  const response: Headers = [
    ...corsHeaders(server, origin),
    ['Access-Control-Allow-Methods', allow.methods.join(', ')],
    ['Access-Control-Allow-Headers', allow.headers.join(', ')],
  ];
  const base = corsCheck(response, origin, req.credentials);
  if (!base.ok) return { response, check: base };
  if (!SAFELISTED_METHODS.includes(req.method) && !allow.methods.includes(req.method)) {
    return { response, check: { ok: false, reason: `Method ${req.method} isn't in Access-Control-Allow-Methods.` } };
  }
  const missing = unsafeHeaderNames(req).filter((n) => !allow.headers.map((x) => x.toLowerCase()).includes(n));
  if (missing.length) return { response, check: { ok: false, reason: `Header ${missing.join(', ')} isn't in Access-Control-Allow-Headers.` } };
  return { response, check: { ok: true, reason: 'The preflight allows this method and these headers.' } };
}

export type Client = 'browser' | 'curl';

export type StepKind = 'preflight' | 'request' | 'response' | 'blocked';

export interface Step {
  kind: StepKind;
  ok: boolean;
  text: string;
  /** Why the browser refused, in its own words (for the console line). */
  reason?: string;
}

export interface Outcome {
  steps: Step[];
  /** Did the real request reach the server (so the server ran it)? */
  reachedServer: boolean;
  /** Could the page's JavaScript read the response? */
  readable: boolean;
  preflighted: boolean;
  requestHeaders: Headers;
  preflightHeaders: Headers | null;
  responseHeaders: Headers;
}

/** What happens when a page on `origin` sends `req` to the API, from a browser or from curl. */
export function send(req: ClientRequest, server: ServerConfig, origin: string, client: Client): Outcome {
  const requestHeaders: Headers = [
    ...(client === 'browser' ? [['Origin', origin] as [string, string]] : []),
    ...Object.entries(req.headers),
    ...(req.credentials ? [['Cookie', 'session=…'] as [string, string]] : []),
  ];
  const responseHeaders: Headers = [['Content-Type', 'application/json'], ...corsHeaders(server, origin)];
  const ran: Step = { kind: 'request', ok: true, text: `${req.method} ${req.path} reached the server, and the server ran it.` };

  if (client === 'curl') {
    return {
      steps: [ran, { kind: 'response', ok: true, text: 'curl printed the response: there is no same-origin policy outside a browser.' }],
      reachedServer: true, readable: true, preflighted: false, requestHeaders, preflightHeaders: null, responseHeaders,
    };
  }

  const steps: Step[] = [];
  let preflightHeaders: Headers | null = null;
  const preflighted = !isSimple(req);
  if (preflighted) {
    const pf = preflight(req, server, origin);
    preflightHeaders = pf.response;
    steps.push({ kind: 'preflight', ok: pf.check.ok, text: `OPTIONS ${req.path} (preflight): ${pf.check.reason}`, reason: pf.check.ok ? undefined : `Response to preflight request doesn't pass access control check: ${pf.check.reason}` });
    if (!pf.check.ok) {
      steps.push({ kind: 'blocked', ok: false, text: `The browser never sent the ${req.method}. The server didn't run it.` });
      return { steps, reachedServer: false, readable: false, preflighted, requestHeaders, preflightHeaders, responseHeaders: [] };
    }
  }
  steps.push(ran);
  const check = corsCheck(responseHeaders, origin, req.credentials);
  steps.push(
    check.ok
      ? { kind: 'response', ok: true, text: `The response passed the CORS check: ${check.reason} JavaScript can read it.` }
      : { kind: 'blocked', ok: false, text: `Blocked by CORS policy: ${check.reason} The server already ran the request; the browser only hides the response.`, reason: check.reason },
  );
  return { steps, reachedServer: true, readable: check.ok, preflighted, requestHeaders, preflightHeaders, responseHeaders };
}
