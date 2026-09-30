// An origin is scheme + host + port. Parsing goes through the real URL API; this only spells out
// the parts and the comparison so the lesson can show which part differs.

/** Schemes with a "tuple" origin, and the port each implies when none is written. */
export const DEFAULT_PORTS: Record<string, number> = { 'http:': 80, 'https:': 443, 'ws:': 80, 'wss:': 443, 'ftp:': 21 };

export interface Origin {
  scheme: string;
  host: string;
  /** The effective port: the written one, or the scheme's default. Null for an opaque origin. */
  port: number | null;
  /** True when the port was implied by the scheme rather than written. */
  defaultPort: boolean;
  /** `file:`, `data:`, `blob:` of an opaque source, etc.: an origin that equals nothing. */
  opaque: boolean;
  /** How browsers write it (`URL.origin`, the `Origin` header): `https://api.example.com` or `null`. */
  serialized: string;
}

/** The origin of a URL, or null if it isn't a valid absolute URL. */
export function originOf(url: string): Origin | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const implied = DEFAULT_PORTS[u.protocol];
  if (implied === undefined) {
    return { scheme: u.protocol, host: u.hostname, port: null, defaultPort: false, opaque: true, serialized: 'null' };
  }
  const written = u.port === '' ? null : Number(u.port);
  return {
    scheme: u.protocol,
    host: u.hostname,
    port: written ?? implied,
    defaultPort: written === null,
    opaque: false,
    serialized: `${u.protocol}//${u.hostname}${written === null ? '' : `:${written}`}`,
  };
}

export interface Comparison {
  same: boolean;
  scheme: boolean;
  host: boolean;
  port: boolean;
  /** Plain-words reason for the verdict. */
  reason: string;
}

/** Same origin means scheme, host and port all match, and neither origin is opaque. */
export function compareOrigins(a: Origin, b: Origin): Comparison {
  const scheme = a.scheme === b.scheme;
  const host = a.host === b.host;
  const port = a.port === b.port;
  if (a.opaque || b.opaque) {
    return { same: false, scheme, host, port, reason: 'An opaque origin ("null") is never the same as any origin, not even another "null".' };
  }
  const differs = [!scheme && 'scheme', !host && 'host', !port && 'port'].filter(Boolean);
  return {
    same: differs.length === 0,
    scheme,
    host,
    port,
    reason: differs.length === 0 ? 'Scheme, host and port all match: same origin.' : `Different ${differs.join(' and ')}: cross-origin.`,
  };
}
