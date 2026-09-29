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
    watch: "Coloured dots are paints: yellow is public, dashed dots with a 🔒 are secrets that never leave their owner, and mixes are safe to send. Pills on the wire are handshake messages; violet ones are already encrypted. The notebook lists everything the eavesdropper saw. The certificate panel checks each link of the chain: green means verified, red means failed. Switch to MITM to watch Mallory try to impersonate the server.",
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
      options: ['Yes, it was sent in plain text', 'Only with the certificate', 'No: they never see either secret, only the mixed values', 'Only for TLS 1.2'],
      answer: 2,
      why: 'Diffie-Hellman only ever transmits the public values. Deriving the shared key requires one of the private secrets, which never leave their owners.',
    },
    {
      q: "What actually stops a man-in-the-middle from impersonating the server?",
      options: ['The key exchange', 'Symmetric encryption', 'Certificate verification against trusted root CAs', 'TCP sequence numbers'],
      answer: 2,
      why: "An attacker can do a perfectly good key exchange with you. What they can't do is present a valid certificate for the real domain that chains to a CA your browser trusts.",
    },
    {
      q: 'Why does TLS switch to symmetric encryption (like AES) for the actual data?',
      options: ["It's much faster for bulk data", "It's the only kind browsers support", 'Certificates require it', 'It hides the server name'],
      answer: 0,
      why: 'Public-key operations are expensive, so they are used only to agree on a key. Symmetric ciphers then encrypt the data at high speed.',
    },
  ],
};

export default lesson;
