import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'The TLS handshake lets a browser and a server agree on a secret key while someone watches the wire, and proves the server is who it claims to be, all in one round trip with TLS 1.3.',
    what: "Two problems are solved at once. Key exchange (Diffie-Hellman) lets both sides combine a public value with private secrets so they end up with the same key, without the key ever being sent. Authentication stops impostors: the server presents a certificate that chains up to a certificate authority the browser already trusts, and signs the handshake to prove it owns the certificate's private key. After that, all data is encrypted with fast symmetric encryption such as AES.",
    analogy: 'Mixing paint. Everyone knows the base colour; each side secretly adds its own colour and sends the mix. Adding your secret to the mix you received gives both sides the same final colour, and nobody can un-mix paint to recover the secrets.',
    useCases: [
      'Every https:// connection: websites, APIs and mobile apps',
      'Debugging certificate errors: expired, wrong hostname, or a missing intermediate',
      'Mutual TLS (mTLS) between internal services',
      'Knowing why corporate proxies install their own root CA on employee machines',
    ],
    why: "Mid-level engineers configure certificates, terminate TLS at load balancers and debug handshake failures. Understanding what each step protects against tells you which errors are dangerous and which are misconfigurations, and why you must never just disable certificate verification to make an error go away.",
    watch: "Coloured dots are paints. Yellow is public. Dashed, grey-outlined dots with a 🔒 are secrets that never leave their owner: blue for the client, green for the server, violet for Mallory. A mix is a real blend of the paints in it and is safe to send. Pills on the wire are messages, and a 🔒 pill is encrypted: the certificate and the data wear the shared key's colour, Finished is green, and Mallory's forged certificate and the client's alert are red. The legend's 🔒 chip is that shared colour. The notebook lists everything the eavesdropper saw, with a grey ▒ for ciphertext. Violet only ever means Mallory's secret. In the certificate panel, a green ✓ link is verified, a red ✕ failed and … is still to check. A green wire and green party outlines mean the session is encrypted; a red outline means the connection was aborted, and Mallory sits in a red-outlined box. Switch to MITM to watch Mallory try to impersonate the server.",
  },
  tryThis: [
    "Play the normal handshake and compare Eve's notebook with the shared colour at the end. Could she build it?",
    'Switch to MITM attack. At what point does the client realise something is wrong?',
    "In MITM mode, notice that the key exchange succeeds. Why isn't that enough?",
    'Count the round trips before encrypted data can flow.',
  ],
  keyIdeas: [
    'Diffie-Hellman creates a shared secret without ever sending it.',
    'Certificates prove identity: the chain must end at a root CA in your trust store.',
    'Encryption without authentication is useless against a man in the middle.',
    'TLS 1.3 needs 1 round trip; bulk data then uses fast symmetric encryption.',
  ],
  quiz: [
    {
      q: 'An eavesdropper records the entire key exchange. Can they compute the session key?',
      options: [
        'Yes, the key is sent in plain text',
        'Only if they also copy the certificate',
        'No: neither private secret crosses the wire',
        'Only when the connection falls back to TLS 1.2',
      ],
      answer: 2,
      why: "Diffie-Hellman only ever transmits the public values. Deriving the shared key needs one of the private secrets, which never leave their owners. The certificate is public and sent to everyone, so copying it gives the eavesdropper nothing.",
    },
    {
      q: 'What actually stops a man-in-the-middle from impersonating the server?',
      options: [
        'The key exchange, since it is encrypted',
        'Symmetric encryption of the session data',
        'A certificate chain up to a trusted root',
        'TCP sequence numbers on every packet',
      ],
      answer: 2,
      why: "An attacker can do a perfectly good key exchange with you; encryption just protects your conversation with whoever you agreed a key with. What they can't do is present a valid certificate for the real domain that chains to a CA your browser trusts, and sign the handshake with its private key.",
    },
    {
      q: 'Why does TLS switch to symmetric encryption (like AES) for the actual data?',
      options: [
        'It is far faster for bulk data',
        'Browsers support no other kind',
        'The certificate requires it',
        'It hides which server you visit',
      ],
      answer: 0,
      why: 'Public-key operations are expensive, so they are used only to agree on keys. Symmetric ciphers then encrypt the data at high speed. It does not hide the server: the name usually travels in the ClientHello in the clear (SNI).',
    },
    {
      q: 'On a first visit (no resumption), how many round trips does TLS 1.3 take before the client can send its request?',
      options: ['None', 'One', 'Two', 'Three'],
      answer: 1,
      why: "The client's first flight carries its key share, so after the server's one reply it has everything and sends Finished with its request. That holds when the server accepts the client's key share; a HelloRetryRequest costs one more. A full TLS 1.2 handshake took two. Zero round trips is only possible when resuming with a pre-shared key (0-RTT).",
    },
  ],
};

export default lesson;
