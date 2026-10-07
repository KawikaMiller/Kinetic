// Pure model behind the TLS handshake lesson: the paint-mixing stand-in for Diffie-Hellman,
// and the full-handshake message flights for TLS 1.2 and 1.3, from which the round-trip
// counts on screen are computed.

import { equalMix } from '../../core/paint';

export type BaseName = 'public' | 'client' | 'server' | 'mallory';

export interface Paint {
  /** A CSS colour: a token, or a real color-mix() of tokens for a mixed paint. */
  color: string;
  label: string;
  secret?: boolean;
  mixed?: boolean;
  /** The base paints this one is made of, sorted (just itself, for a base paint). */
  parts: readonly BaseName[];
}

const BASE_COLOR: Record<BaseName, string> = {
  public: 'var(--amber)',
  client: 'var(--sky)',
  server: 'var(--trk-math)',
  mallory: 'var(--violet)',
};

/** The colour of equal parts of some base paints (core/paint), in sorted order so it never depends on the order added. */
export const blend = (parts: readonly BaseName[]): string => equalMix([...parts].sort().map((name) => BASE_COLOR[name]));

/** Mix paints: the parts pool, and the colour is their blend. */
export function mix(label: string, ...paints: Paint[]): Paint {
  const parts = paints.flatMap((p) => p.parts).sort();
  return { color: blend(parts), label, mixed: true, parts };
}

const base = (name: BaseName, label: string, secret = false): Paint => ({ color: BASE_COLOR[name], label, secret, parts: [name] });

const pub = base('public', 'public yellow');
const cSec = base('client', 'secret blue', true);
const sSec = base('server', 'secret green', true);
const mSec = base('mallory', 'secret violet', true);
const cMix = mix('yellow + blue', pub, cSec);
const sMix = mix('yellow + green', pub, sSec);
const mMix = mix('yellow + violet', pub, mSec);

export const P = {
  pub,
  cSec,
  sSec,
  mSec,
  cMix,
  sMix,
  mMix,
  /** What the client gets by adding its secret to the server's mix (the server's sum is the same paint). */
  shared: mix('shared secret', sMix, cSec),
  /** What the client gets from Mallory's mix. */
  sharedM: mix('shared… with Mallory', mMix, cSec),
} satisfies Record<string, Paint>;

// ── Handshake flights ─────────────────────────────────────────────────

export type TlsVersion = '1.2' | '1.3';
export type Side = 'client' | 'server';

export interface Flight {
  from: Side;
  messages: readonly string[];
}

export const APP_DATA = 'application data';

/**
 * The full handshake (first visit, no resumption, no 0-RTT), one flight per entry.
 * TLS 1.3: RFC 8446 §2, figure 1. TLS 1.2: RFC 5246 §7.3, figure 1, with an ephemeral
 * (EC)DHE key exchange, which is what puts ServerKeyExchange in the server's flight.
 */
export const FULL_HANDSHAKE: Record<TlsVersion, readonly Flight[]> = {
  '1.3': [
    { from: 'client', messages: ['ClientHello', 'key_share'] },
    { from: 'server', messages: ['ServerHello', 'key_share', 'EncryptedExtensions', 'Certificate', 'CertificateVerify', 'Finished'] },
    { from: 'client', messages: ['Finished', APP_DATA] },
  ],
  '1.2': [
    { from: 'client', messages: ['ClientHello'] },
    { from: 'server', messages: ['ServerHello', 'Certificate', 'ServerKeyExchange', 'ServerHelloDone'] },
    { from: 'client', messages: ['ClientKeyExchange', 'ChangeCipherSpec', 'Finished'] },
    { from: 'server', messages: ['ChangeCipherSpec', 'Finished'] },
    { from: 'client', messages: [APP_DATA] },
  ],
};

/**
 * Round trips the client waits before it can send application data: one per server
 * flight it has to hear before the flight that carries the data.
 */
export function roundTripsBeforeData(version: TlsVersion): number {
  const flights = FULL_HANDSHAKE[version];
  const dataAt = flights.findIndex((f) => f.from === 'client' && f.messages.includes(APP_DATA));
  if (dataAt < 0) throw new Error(`TLS ${version}: no flight carries application data`);
  return flights.slice(0, dataAt).filter((f) => f.from === 'server').length;
}

/** Every message of a version in the order it goes on the wire. */
export const messageOrder = (version: TlsVersion) => FULL_HANDSHAKE[version].flatMap((f) => f.messages.map((m) => ({ from: f.from, m })));
