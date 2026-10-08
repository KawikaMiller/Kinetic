import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { CLIENT_IP, prefixMatches, type GatewayConfig, type Outcome, type Request, type StageId } from './model';

export interface GwFrame extends Frame {
  /** Index of the request in the run; -1 before the first. */
  k: number;
  /** The stage the request is at; null once the response is on its way back. */
  stage: StageId | null;
}

export const REASON: Record<number, string> = {
  200: 'OK', 401: 'Unauthorized', 404: 'Not Found', 429: 'Too Many Requests', 502: 'Bad Gateway', 504: 'Gateway Timeout',
};
/** As in http-basics: 2xx green, 4xx (the request's fault) orange, 5xx (the server side's) red. */
export const statusTone = (s: number) => (s < 300 ? 'ok' : s < 500 ? 'orange' : 'bad');
const status = (s: number) => <span className={`hl ${statusTone(s)}`}>{s} {REASON[s]}</span>;

function stageCaption(stage: StageId, req: Request, out: Outcome, cfg: GatewayConfig, mtls: boolean): ReactNode {
  const stopped = out.stoppedAt === stage;
  const r = out.route;
  switch (stage) {
    case 'tls':
      return <>TLS ends here: the client's HTTPS connection terminates at the gateway, which holds the certificate for {req.host}. Inside, the
        request travels as {mtls ? 'mTLS (encrypted, and both the gateway and the service prove who they are)' : 'plain HTTP'}.</>;
    case 'route': {
      if (stopped) return <>Routing: no route matches {req.host}{req.path}, so the gateway answers {status(404)} itself. No service sees it.</>;
      const shorter = cfg.routes.filter((x) => x !== r && x.host === req.host && prefixMatches(x.prefix, req.path)).map((x) => x.prefix);
      return <>Routing: {req.host}{req.path} goes to <b>{r!.service}</b>, by the longest matching prefix <code>{r!.prefix}</code>
        {shorter.length ? <> (it beats {shorter.join(', ')})</> : null}.</>;
    }
    case 'auth':
      if (stopped) return <>Auth: no valid token, so the gateway answers {status(401)} with <code>WWW-Authenticate: Bearer</code>, before any
        service is bothered.</>;
      if (!r!.auth) return <>Auth: this route is public (static files), so no token is needed.</>;
      if (!cfg.authAtEdge) return <>Auth is off at the gateway in this setup: the token goes through untouched, and every service has to check it
        itself.</>;
      return <>Auth: the JWT checks out, so the gateway passes the user on as <code>X-User-Id: 42</code>.{' '}
        {mtls
          ? <>Services can trust that header because, with mTLS inside, only the gateway can reach them.</>
          : <>Services can trust that header only if nothing but the gateway can reach them: with plain HTTP inside, that rests on the network
            being isolated (mTLS would prove it).</>}</>;
    case 'rate':
      if (stopped) {
        const retry = out.responseHeaders.find(([h]) => h === 'Retry-After')![1];
        return <>Rate limit: this client's bucket is empty, so the answer is {status(429)} with <code>Retry-After: {retry}</code> (seconds).</>;
      }
      return <>Rate limit: one token from this client's bucket; {Math.floor(out.bucket.tokens)} whole {Math.floor(out.bucket.tokens) === 1 ? 'token' : 'tokens'} left of {cfg.bucket.capacity},
        refilling {cfg.bucket.rate} per second.</>;
    case 'headers': {
      const xff = out.forwarded!.find(([h]) => h === 'X-Forwarded-For')![1];
      return <>Header rewrite: <code>X-Forwarded-For: {xff}</code>, <code>X-Forwarded-Proto: https</code> and an <code>X-Request-Id</code> for
        tracing. {req.clientXff
          ? <>The client sent its own X-Forwarded-For ({req.clientXff}); the gateway appends the address it really saw, so only that last entry
            can be trusted.</>
          : <>The service would otherwise see only the gateway's address.</>}</>;
    }
    case 'forward': {
      const svc = r!.service;
      if (out.status === 502)
        return <>Forward: {svc} refuses the connection. Nothing reached it, so a retry is safe for any method: the gateway tries again
          ({out.attempts} attempts in all), then answers {status(502)}. Had the connection dropped after the request was sent, only an idempotent
          method like GET would be retried.</>;
      if (out.status === 504)
        return <>Forward: {svc} doesn't answer within the gateway's {cfg.timeout} s timeout, so the gateway answers {status(504)}. Neither 502 nor
          504 is the client's fault.</>;
      if (out.status === 401)
        return <>Forward: with auth moved into the services, the request travelled all the way to {svc}, which rejects it: {status(401)}. Every
          service needs that same check, written and kept up to date.</>;
      return <>Forward: {svc} answers {status(out.status)} in {Math.round(out.waited * 1000)} ms (illustrative).</>;
    }
  }
}

/** Every request's walk: one frame per stage it reaches; the stage that answered carries the status. */
export function runFrames(results: readonly { req: Request; out: Outcome }[], cfg: GatewayConfig, mtls: boolean, intro: ReactNode): GwFrame[] {
  const frames: GwFrame[] = [{ k: -1, stage: null, say: intro }];
  results.forEach(({ req, out }, k) => {
    for (const stage of out.ran) {
      const answered = stage === out.stoppedAt;
      frames.push({ k, stage, say: stageCaption(stage, req, out, cfg, mtls), hold: answered ? 1.6 : 1 });
    }
    frames.push({
      k, stage: null,
      say: <>Back at the client: {status(out.status)}{results.length > 1 ? <> (request {k + 1} of {results.length})</> : null}.
        {out.stoppedAt === 'forward' && out.fromService ? ' It came from the service, through the gateway.' : ' The gateway answered it itself.'}</>,
    });
  });
  return frames;
}

export const introFor = (label: string, n: number): ReactNode =>
  <>{label}: {n === 1 ? 'one request' : `${n} requests`} from the client at {CLIENT_IP}. Each passes the gateway's stages in a fixed order and
    stops at the first one that says no. Press play.</>;

