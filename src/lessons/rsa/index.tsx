import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'RSA gives you a lock anyone can close (the public key) and a key only you hold (the private key): it works because multiplying two primes is easy and getting them back from the product is not.',
    what: 'Pick two secret primes p and q, publish n = p × q and an exponent e, and keep d, the inverse of e modulo φ = (p − 1)(q − 1). Anyone encrypts with c = mᵉ mod n; only the holder of d decrypts with m = cᵈ mod n. Run it the other way round and you get signatures: s = mᵈ, checked by anyone with sᵉ. Finding d from (n, e) means factoring n, which is hopeless at 2048 bits. Textbook RSA as shown here is deterministic and malleable, so real RSA always adds padding (OAEP for encryption, PSS for signatures).',
    analogy: 'An open padlock you hand out by the hundred: anyone can snap one shut on a box, but only your key opens it.',
    useCases: [
      'Signatures on TLS certificates and the handshakes they prove (`tls-handshake`)',
      'SSH keys and code-signing keys (RSA or, increasingly, Ed25519)',
      'RS256-signed JWTs and OIDC ID tokens, checked with a published public key',
      'Wrapping a random symmetric key with RSA-OAEP, then encrypting the data with AES',
    ],
    why: 'You will generate keys, pick key sizes, configure TLS and verify signed tokens. Knowing why e is public and d isn\'t, why textbook RSA is broken, and why 1024-bit keys were retired keeps you from shipping something that looks like crypto but isn\'t. It also ties together `modular-arithmetic`, `gcd-euclid` and `primes-factoring`.',
    watch: 'Make a key: each check is a row; the current one has a yellow outline, passed rows get a green ✓, and an invalid choice turns its row red. Public values (n and e) are blue; private ones (p, q, φ and d) are violet with a 🔒, in the rows and the top stats. Encrypt: on the clock the message is a yellow dot, the ciphertext an orange dot and the decrypted message a green dot; the blue arrow is the public-exponent step and the violet arrow the private one. In the table, the current row is tinted yellow and a ciphertext that repeats gets a red outline at the end. Sign: the owner\'s card is violet, and the verifier\'s card turns green when the signature is valid and red when it\'s rejected. Key size: the dashed violet curve is the projected time, the yellow dot is the size picked, the grey lines mark the age of the universe and 2048 bits, and found factors are green. The dashed red-edged note in every lane is the toy-key warning.',
  },
  tryThis: [
    'In Make a key, play the default key and watch extended Euclid turn e = 17 into d = 2753.',
    'Try the "e shares a factor (15)" and "p = q" presets: each stops at its own reason.',
    'In Encrypt, encrypt "ABBA": both B\'s give the same ciphertext. That\'s why real RSA pads.',
    'In Sign, switch "Verifier receives" to "m edited by one": the signature no longer checks out.',
    'In Key size, press "Factor n", then drag the slider to 2048 bits and read the projected time.',
  ],
  keyIdeas: [
    'n and e are public; d (and p, q, φ) stay private. Encrypt and verify use e; decrypt and sign use d.',
    'd = e⁻¹ mod φ, found with extended Euclid; it exists only when gcd(e, φ) = 1.',
    'Security rests on factoring n being slow: toy keys fall instantly, 2048-bit keys are the minimum today.',
    'Never use textbook RSA: real RSA pads (OAEP, PSS) and comes from a vetted library.',
  ],
  quiz: [
    {
      q: 'Alice encrypts a note with Bob\'s RSA public key. Who can decrypt it?',
      options: [
        'Only Bob, with his private key',
        'Alice, with that same public key',
        'Anyone holding Bob\'s public key',
        'Anyone who saw the ciphertext',
      ],
      answer: 0,
      why: 'Decryption needs d, which only Bob holds. The public key is the tempting answer, but e only goes one way: undoing mᵉ mod n without d means factoring n. Even Alice can\'t decrypt her own note.',
    },
    {
      q: 'With p = 61, q = 53 and e = 17, what is the private exponent d?',
      options: ['2753', '3233', '3120', '17'],
      answer: 0,
      why: 'd = 17⁻¹ mod φ, and φ = 60 × 52 = 3120; extended Euclid gives 2753 (17 × 2753 = 15 × 3120 + 1). 3233 is n and 3120 is φ itself.',
    },
    {
      q: 'Why is a 32-bit RSA key no good, even with perfect padding?',
      options: [
        'Factoring its n takes a laptop a blink',
        'Its ciphertexts are too long to send',
        'A 32-bit n is too small to hold a letter',
        'Only 65537 is allowed as the exponent',
      ],
      answer: 0,
      why: 'Trial division tries at most about √n / 2 odd divisors, around 33,000 for a 32-bit n, so p, q and then d fall at once. A 32-bit n is plenty big for a letter code, and e = 65537 is a convention, not a rule. RSA\'s security depends on the size of n.',
    },
    {
      q: 'Why does real RSA encryption add OAEP padding instead of encrypting m directly?',
      options: [
        'Textbook RSA always gives the same c for the same m',
        'Padding makes the modulus n harder to factor',
        'Without padding, decrypting is far too slow',
        'Padding lets the public key decrypt as well',
      ],
      answer: 0,
      why: 'Without randomness, equal messages give equal ciphertexts and anyone can test a guess by encrypting it. Padding doesn\'t touch factoring at all; that depends only on the size of n.',
    },
  ],
};

export default lesson;
