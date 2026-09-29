import { useEffect, useState } from 'react';

// Real HS256 JWTs via Web Crypto, so tampering genuinely breaks the signature.
const enc = new TextEncoder();

export const SERVER_SECRET = 'kinetic-demo-server-secret-9f2c1a';
export const HEADER = { alg: 'HS256', typ: 'JWT' };
export const PAYLOAD = { sub: '42', name: 'Ada', role: 'user', iat: 1767225600, exp: 1767226500 };

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const b64urlJson = (obj: unknown) => b64url(enc.encode(JSON.stringify(obj)));

export async function hmac(secret: string, data: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))));
}

export interface Jwt {
  header: string;
  payload: string;
  signature: string;
}

export const joinJwt = (t: Jwt) => `${t.header}.${t.payload}.${t.signature}`;

export async function signJwt(payload: object, secret: string): Promise<Jwt | null> {
  const header = b64urlJson(HEADER);
  const body = b64urlJson(payload);
  const signature = await hmac(secret, `${header}.${body}`);
  return signature ? { header, payload: body, signature } : null;
}

/** What the server does on every request: recompute the signature with ITS secret and compare. */
export async function verifyJwt(t: Jwt, secret = SERVER_SECRET) {
  const expected = await hmac(secret, `${t.header}.${t.payload}`);
  return { valid: expected === t.signature, expected };
}

/** Signs once per distinct payload (null while computing). */
export function useSignedJwt(payload: object, secret = SERVER_SECRET) {
  const key = JSON.stringify(payload) + '|' + secret;
  const [out, setOut] = useState<{ key: string; jwt: Jwt | null } | null>(null);
  useEffect(() => {
    let alive = true;
    signJwt(JSON.parse(key.slice(0, key.lastIndexOf('|'))), key.slice(key.lastIndexOf('|') + 1)).then((jwt) => {
      if (alive) setOut({ key, jwt });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return out && out.key === key ? out.jwt : null;
}
