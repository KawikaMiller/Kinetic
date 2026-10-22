import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Diffie-Hellman lets two parties agree on a secret key while an eavesdropper hears every message, because the key itself is never sent: each side computes it.',
    what: 'Both sides agree in public on a prime p and a base g. Alice picks a private a and sends A = gᵃ mod p; Bob picks b and sends B = gᵇ mod p. Alice computes Bᵃ and Bob computes Aᵇ, and both are gᵃᵇ mod p. An eavesdropper has p, g, A and B, but getting a back from A (the discrete logarithm) is infeasible at real sizes. DH on its own doesn\'t say who you agreed with, so a man in the middle can run one exchange with each side; real protocols sign the exchange.',
    analogy: 'Mixing paint: a shared base, a secret colour each, swap the mixtures, add your own colour again. Both pots end up the same, and nobody can un-mix the paint they saw.',
    useCases: [
      'Every TLS 1.3 handshake: an ephemeral ECDH key share, walked through step by step in `tls-handshake`',
      'SSH key exchange when you connect to a server',
      'Messaging apps (the Signal protocol) and VPNs such as WireGuard',
      'Forward secrecy, stated here and not demonstrated: fresh DH keys per session, so a stolen long-term key can\'t decrypt old traffic',
    ],
    why: 'Every secure connection you build or debug starts with a key exchange. Knowing that the key is computed and never sent explains forward secrecy, why certificates exist (DH doesn\'t authenticate), and why parameters and curves matter. It builds on `modular-arithmetic` and `primes-factoring`.',
    watch: 'Paint: the amber dot is the public base paint; private paints sit in a dashed violet ring with a 🔒 and never leave their owner. Alice\'s private paint is sky blue or teal and Bob\'s pink or lime, as their chips show. The wire column has an orange border: it\'s what Eve sees, and her swatches have orange rings. Matching final colours get a green ring. Numbers: in the ladder diagram public values are blue, private picks violet with a 🔒, shared secrets green, Eve\'s lifeline and her fake values orange, the split secrets in man-in-the-middle mode red, and the current message yellow. Eve\'s notebook has an orange border and orange text, and the secrets in the top stats are green, or red after a man in the middle. A red-edged box warns about a weak g (too few values, or an order with only small factors); a grey note explains a generator or a prime-order subgroup; the dashed red-edged note is the toy-numbers warning. Real ECDH: public keys in blue hex, the private key as violet 🔒 text, and the derived secrets in green hex.',
  },
  tryThis: [
    'In Paint, play it through and compare Eve\'s best try with the final colour on both sides.',
    'In Numbers, play the default exchange, then press "Try every a": six tries and Eve has the secret.',
    'Switch Eve to "Man in the middle" and play again: Alice and Bob end up with different secrets.',
    'Try the "weak g" preset: g = 5 mod 31 only makes 3 values, so the secret is one of 3 numbers.',
    'In Real ECDH, press "New key pairs" a few times: different keys every time, and both sides always agree.',
  ],
  keyIdeas: [
    'The shared secret is computed on both sides and never sent: s = Bᵃ = Aᵇ = gᵃᵇ mod p.',
    'An eavesdropper sees p, g, A and B; recovering a is the discrete logarithm, infeasible at 2048 bits or on a 256-bit curve.',
    'DH alone doesn\'t prove who you agreed with: a man in the middle can run two exchanges. TLS signs it.',
    'Real systems use ECDH on standard curves, from a library, with the result fed through a key-derivation function.',
  ],
  quiz: [
    {
      q: 'In a Diffie-Hellman exchange, how does the shared key get from Alice to Bob?',
      options: [
        'It never travels: each side computes it',
        'Alice sends it, encrypted with Bob\'s key',
        'It\'s split into A and B, then joined up',
        'A server picks it and sends it to both',
      ],
      answer: 0,
      why: 'Only A = gᵃ and B = gᵇ cross the wire. Each side combines what it received with its own private number. The tempting "sent encrypted" is how RSA key transport works, which TLS 1.3 dropped in favour of DH.',
    },
    {
      q: 'With p = 23 and g = 5, Alice picks a = 6. Which number does she send?',
      options: ['8', '6', '30', '2'],
      answer: 0,
      why: 'A = 5⁶ mod 23 = 15625 mod 23 = 8. The 6 is her private a and never leaves her; 2 is the shared secret they both end up with when Bob picks b = 15.',
    },
    {
      q: 'Eve sits in the middle and swaps both public values for her own. What goes wrong?',
      options: [
        'Each side ends up sharing a key with Eve',
        'The sides get different keys and spot it',
        'Eve reads a and b straight off the wire',
        'Nothing: DH secrets can\'t be intercepted',
      ],
      answer: 0,
      why: 'Alice agrees a key with Eve and so does Bob, and nothing in the bare numbers warns them: the keys differ, but neither side sees the other\'s. a and b never cross the wire. That\'s why TLS signs the exchange with the server\'s certificate key.',
    },
    {
      q: 'Why does the toy exchange with p = 23 protect nothing at all?',
      options: [
        'Eve can try every possible a in a moment',
        'The secret travels along with A and B',
        'Small primes make a good g impossible',
        'Alice and Bob would get different keys',
      ],
      answer: 0,
      why: 'There are only 21 choices for a, so trying gˣ for each finds one that makes A instantly. A small p still has generators (5 is one for 23), and both sides still agree; it\'s just far too small. Real DH uses 2048-bit primes or elliptic curves.',
    },
  ],
};

export default lesson;
