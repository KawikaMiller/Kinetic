import { useEffect, useState } from 'react';

// Real Web Crypto, so the digests and ciphertexts on screen are the genuine article.
const enc = new TextEncoder();

export const hasSubtle = () => typeof crypto !== 'undefined' && !!crypto.subtle;

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  [...(buf instanceof Uint8Array ? buf : new Uint8Array(buf))].map((b) => b.toString(16).padStart(2, '0')).join('');

export async function sha256Hex(text: string): Promise<string | null> {
  if (!hasSubtle()) return null;
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

export function hexToBits(hex: string): number[] {
  const bits: number[] = [];
  for (const ch of hex) {
    const n = parseInt(ch, 16);
    for (let b = 3; b >= 0; b--) bits.push((n >> b) & 1);
  }
  return bits;
}

/** SHA-256 of `text`, recomputed whenever it changes (null while computing / unsupported). */
export function useSha256(text: string) {
  const [out, setOut] = useState<{ text: string; hex: string | null } | null>(null);
  useEffect(() => {
    let alive = true;
    sha256Hex(text).then((hex) => {
      if (alive) setOut({ text, hex });
    });
    return () => {
      alive = false;
    };
  }, [text]);
  return out && out.text === text ? out.hex : null;
}

/** Many digests at once, keyed by input. */
export function useSha256Many(inputs: string[]) {
  const key = inputs.join('\u0000');
  const [out, setOut] = useState<{ key: string; hex: string[] } | null>(null);
  useEffect(() => {
    let alive = true;
    Promise.all(key.split('\u0000').map(sha256Hex)).then((hex) => {
      if (alive) setOut({ key, hex: hex.map((h) => h ?? '') });
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return out && out.key === key ? out.hex : null;
}

export interface AesDemo {
  keyHex: string;
  ivHex: string;
  cipherHex: string;
  decrypted: string;
}

/** Genuine AES-256-GCM round trip of `message` with a fresh random key. */
export function useAesDemo(message: string) {
  const [demo, setDemo] = useState<AesDemo | null>(null);
  useEffect(() => {
    if (!hasSubtle()) return;
    let alive = true;
    (async () => {
      const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(message));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
      const raw = await crypto.subtle.exportKey('raw', key);
      if (alive) {
        setDemo({ keyHex: toHex(raw), ivHex: toHex(iv), cipherHex: toHex(cipher), decrypted: new TextDecoder().decode(plain) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [message]);
  return demo;
}
