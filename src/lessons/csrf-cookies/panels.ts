import type { LineState } from '../../components/CodePanel';
import {
  LINE_OF, OTHER_ORIGIN, SERVER_LINES, SESSION_VALUE, SHOP, NEW_EMAIL, CUSTOM_HEADER, methodOf, type Config, type Outcome, type StopPoint,
} from './model';

/** The request headers the browser would send for the forged request (or the preflight that comes first). */
export function requestLines(c: Config, o: Outcome): string[] {
  if (o.preflight) {
    return [
      'OPTIONS /email/change HTTP/1.1',
      `Host: ${SHOP}`,
      `Origin: ${OTHER_ORIGIN}`,
      'Access-Control-Request-Method: POST',
      `Access-Control-Request-Headers: ${CUSTOM_HEADER.toLowerCase()}, content-type`,
    ];
  }
  const link = c.kind === 'link';
  const lines = [
    `${methodOf(c.kind)} /email/change${link ? `?to=${NEW_EMAIL}` : ''} HTTP/1.1`,
    `Host: ${SHOP}`,
    link ? `Referer: ${OTHER_ORIGIN}/` : `Origin: ${OTHER_ORIGIN}`,
  ];
  if (o.cookieSent) lines.push(`Cookie: session=${SESSION_VALUE}`);
  else lines.push(c.auth === 'bearer' ? '(no Authorization header: only the app\'s own code adds it)' : '(no Cookie header)');
  if (!link) {
    lines.push(c.kind === 'form' ? 'Content-Type: application/x-www-form-urlencoded' : 'Content-Type: text/plain');
    lines.push(`X-Csrf-Token: (none: only ${SHOP}'s own pages can read it)`);
  }
  return lines;
}

/** Index of the cookie line in `requestLines`, or -1 when no cookie is attached. */
export const cookieLineIndex = (lines: readonly string[]) => lines.findIndex((l) => l.startsWith('Cookie:'));

const STOP_LINE: Record<Exclude<StopPoint, 'preflight'>, number> = {
  'no-credential': LINE_OF.auth,
  origin: LINE_OF.origin,
  token: LINE_OF.token,
  header: LINE_OF.header,
};

/**
 * State of each server line: a defence that is off is cut, and once the request has arrived the
 * lines it passed are done, the one that rejected it is now, and the change line is bad when it ran.
 */
export function serverLineStates(c: Config, o: Outcome, arrived: boolean): LineState[] {
  const off = new Set<number>();
  if (!c.origin) off.add(LINE_OF.origin);
  if (!c.token) off.add(LINE_OF.token);
  if (!c.header) off.add(LINE_OF.header);
  const reached = arrived && o.sent;
  const stop = o.stoppedAt && o.stoppedAt !== 'preflight' ? STOP_LINE[o.stoppedAt] : null;
  return SERVER_LINES.map((_, i): LineState => {
    if (off.has(i)) return 'cut';
    if (!reached) return 'idle';
    if (o.harm) return i === LINE_OF.change ? 'bad' : 'done';
    if (stop === null) return 'idle';
    if (i < stop) return 'done';
    return i === stop ? 'now' : 'idle';
  });
}
