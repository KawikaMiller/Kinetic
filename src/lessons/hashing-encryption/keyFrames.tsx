// Lane ③ and ④ scripts. The ciphertexts and signature checks they show are computed for
// real in the browser (crypto.ts); the order of events is scripted.
import type { ReactNode } from 'react';
import { MESSAGE, RELEASE, type AsymFrame, type SymFrame } from './keyModel';

export function buildSym(): SymFrame[] {
  const f = (p: Partial<SymFrame> & { say: ReactNode }): SymFrame => ({
    keys: false, at: null, locked: false, eve: false, opened: false, question: false, ...p,
  });
  return [
    f({ at: 'alice', say: <>Alice wants to send Bob <span className="hl">{MESSAGE}</span>. The network is public: <b>Eve</b> can copy anything on it.</> }),
    f({ at: 'alice', keys: true, say: <>They both hold <b>the same secret key</b>. That's what <span className="hl">symmetric</span> means: one key locks and unlocks.</> }),
    f({ at: 'alice', keys: true, locked: true, say: <>Alice encrypts with AES-256 and the key. Out comes <b>ciphertext</b>: this is a real encryption, done in your browser just now.</> }),
    f({ at: 'wire', keys: true, locked: true, eve: true, hold: 1.2, say: <>It crosses the wire. Eve copies it, but without the key it's <span className="hl bad">gibberish</span>.</> }),
    f({ at: 'bob', keys: true, locked: true, eve: true, say: <>Bob receives the ciphertext…</> }),
    f({ at: 'bob', keys: true, locked: false, eve: true, opened: true, say: <>…and decrypts it with <b>the same key</b>: <span className="hl ok">{MESSAGE}</span>.</> }),
    f({ at: 'bob', keys: true, opened: true, eve: true, question: true, hold: 2,
      say: <>Symmetric crypto is <span className="hl ok">fast</span> (GB/s, hardware-accelerated): disks, databases, all TLS traffic. The catch: how did they share the key <b>without Eve seeing it</b>?</> }),
  ];
}

export function buildAsym(): AsymFrame[] {
  const f = (p: Partial<AsymFrame> & { say: ReactNode }): AsymFrame => ({
    pair: false, published: false, at: null, locked: false, eveTry: false, opened: false, sign: 'none', ...p,
  });
  const base = { pair: true, published: true };
  return [
    f({ pair: true, say: <>Bob generates a <b>key pair</b>: a <span className="hl info">public key</span> (think: an open padlock) and a <span className="hl violet">private key</span> that never leaves him.</> }),
    f({ ...base, say: <>He hands copies of the padlock to <b>everyone</b>, Eve included. That's fine: a padlock can only <b>lock</b>.</> }),
    f({ ...base, at: 'alice', locked: true, say: <>Alice locks her message with <b>Bob's public key</b>: real RSA-OAEP, done in your browser just now. No shared secret needed, ever.</> }),
    f({ ...base, at: 'wire', locked: true, eveTry: true, hold: 1.3, say: <>Eve grabs it and tries her copy of the public key. <span className="hl bad">It can't unlock.</span> Only the private key can.</> }),
    f({ ...base, at: 'bob', locked: false, opened: true, say: <>Bob opens it with his <span className="hl violet">private key</span>: <span className="hl ok">{MESSAGE}</span>.</> }),
    f({ ...base, at: 'bob', sign: 'signed', say: <>Now flip it around: <b>signatures</b>. Bob signs <span className="hl">{RELEASE}</span> with his <span className="hl violet">private key</span> (a real ECDSA signature).</> }),
    f({ ...base, at: 'alice', sign: 'verified', hold: 1.2, say: <>Anyone checks the signature with Bob's <span className="hl info">public key</span>. <span className="hl ok">✓ Valid</span>: it really came from Bob, unchanged.</> }),
    f({ ...base, at: 'alice', sign: 'tampered', hold: 1.3, say: <>Eve swaps in a malware link on the way. The signature no longer matches the message: <span className="hl bad">✗ rejected</span>.</> }),
    f({ ...base, at: 'alice', sign: 'tampered', hold: 2,
      say: <>Asymmetric crypto is <b>orders of magnitude slower</b>, so real systems (like TLS) use it only to agree on a <span className="hl">symmetric key</span>, then switch to fast AES.</> }),
  ];
}
