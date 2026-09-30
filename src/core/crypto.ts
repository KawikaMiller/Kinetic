// Real Web Crypto helpers, so digests, ciphertexts and signatures on screen are genuine.
// crypto.subtle only exists in secure contexts (https or localhost); every async
// helper resolves to null when it's unavailable.

export const enc = new TextEncoder();

export const hasSubtle = () => typeof crypto !== 'undefined' && !!crypto.subtle;

const asBytes = (buf: ArrayBuffer | Uint8Array) => (buf instanceof Uint8Array ? buf : new Uint8Array(buf));

/** Bytes as lower-case hex. */
export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...asBytes(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Bytes as unpadded base64url (the JWT encoding). */
export const b64url = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...asBytes(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Hex string → array of bits, most significant first. */
export function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const ch of hex) {
    const n = parseInt(ch, 16);
    for (let b = 3; b >= 0; b--) bits.push((n >> b) & 1);
  }
  return bits;
}

/** SHA-256 of the UTF-8 text, as hex. */
export async function sha256Hex(text: string): Promise<string | null> {
  if (!hasSubtle()) return null;
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

/** HMAC-SHA256 of `data` with `secret`, as hex or base64url. */
export async function hmacSha256(secret: string, data: string, out: 'hex' | 'b64url'): Promise<string | null> {
  if (!hasSubtle()) return null;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return out === 'hex' ? toHex(sig) : b64url(sig);
}
