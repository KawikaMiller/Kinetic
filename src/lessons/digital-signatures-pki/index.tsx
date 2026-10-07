import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'A digital signature proves a message came from the holder of a private key and wasn\'t changed; a certificate chain proves whose key it is, by having someone you already trust vouch for it.',
    what: 'Signing uses the private key and verifying uses the public key, so anyone can check a signature but only the key holder can make one (unlike an HMAC, where every verifier could also forge). A certificate binds a name to a public key and is signed by an issuer; the issuer\'s certificate is signed by its issuer, up to a root in your trust store. A browser checks each link; among other checks: dates, the hostname, the issuer\'s signature, that the issuer is allowed to issue, and that the chain ends at a trusted root.',
    analogy: 'A notarised letter: the signature shows who wrote it, and the notary\'s stamp (whose own credentials you already accept) shows the signature is really theirs.',
    useCases: [
      'HTTPS certificates, checked on every connection (`tls-handshake`)',
      'Signed software releases, packages and container images',
      'RS256 / ES256 JWTs and OIDC tokens checked with a published public key',
      'Debugging "certificate expired", "name mismatch" and "missing intermediate" errors in production',
    ],
    why: 'Certificate errors are among the most common production incidents, and the fix is rarely "turn off verification". Knowing exactly which check failed, and why a valid signature still isn\'t trust, lets you fix the real problem. It builds on `rsa` and `macs-hmac`.',
    watch: 'Sign & verify: the private key panel is violet with a 🔒 and the public key is a blue byte grid. The signature is a violet byte grid in a box that turns green when it verifies and red when it doesn\'t; bytes you flipped are yellow. Certificate chain: each certificate is a card, root at the top. Grey, faded cards are not checked yet; the card being checked is yellow; a verified link turns green with a ✓; a failing one turns red with a ✕, a red reason line and a dashed red edge to its issuer. A missing intermediate is a dashed empty card. The violet ring marks the root from the simulated trust store, whose name is violet in the side panel.',
  },
  tryThis: [
    'In Sign & verify, press Sign, then change one character of the note: verify fails.',
    'Click any signature byte to flip it, and click it again to undo: verify follows.',
    'Press Sign twice on the same note: here you get a different signature each time, and both verify.',
    'In Certificate chain, play "Valid chain", then each failure preset and read which link breaks.',
    'Compare "Self-signed" with "Unknown root": the signatures check out in both; trust is what\'s missing.',
  ],
  keyIdeas: [
    'Sign with the private key, verify with the public key: anyone can check, only the key holder can sign.',
    'A certificate binds a name to a public key; an issuer\'s signature vouches for that binding.',
    "Every link is checked; among other checks: dates, hostname, the issuer's signature and CA flag, up to a trusted root.",
    'A valid signature isn\'t trust: a self-signed certificate verifies fine and is still rejected.',
  ],
  quiz: [
    {
      q: 'A certificate\'s signature verifies with its own public key, but the browser still rejects it. Why?',
      options: [
        'No root in the trust store vouches for it',
        'The signature must have been tampered with',
        'Self-signed certificates can\'t carry names',
        'ECDSA signatures expire after one hour',
      ],
      answer: 0,
      why: 'A self-signed certificate signs itself, so the signature is genuinely valid; what\'s missing is anyone you trust vouching for it. "Tampered" is tempting, but a tampered certificate fails the signature check itself.',
    },
    {
      q: 'Why can a webhook receiver that checks HMAC tags also forge them, but a signature checker can\'t?',
      options: [
        'HMAC checking needs the same key that makes tags',
        'HMAC tags are shorter, so they are easy to guess',
        'Signatures are encrypted, so nobody can read them',
        'Signature checkers never see the original message',
      ],
      answer: 0,
      why: 'An HMAC is made and checked with one shared key, so every verifier can also make tags. A signature is checked with the public key, which can\'t create one; only the private key can.',
    },
    {
      q: 'A site works on your laptop but a server-side client fails with "unable to get local issuer certificate". What\'s the likely fix?',
      options: [
        'Make the server send the intermediate too',
        'Turn off certificate verification there',
        'Renew the leaf certificate a year early',
        'Add the site\'s own leaf to every trust store',
      ],
      answer: 0,
      why: 'Browsers often fetch or cache a missing intermediate, so they hide the misconfiguration; many other clients don\'t. Disabling verification "fixes" it by removing the protection entirely.',
    },
    {
      q: 'Which name does a certificate for *.shop.example cover?',
      options: ['www.shop.example', 'shop.example', 'a.b.shop.example', 'shop.example.org'],
      answer: 0,
      why: 'A wildcard stands for exactly one leftmost label. It doesn\'t cover the bare shop.example, and it doesn\'t cover two labels like a.b.shop.example.',
    },
  ],
};

export default lesson;
