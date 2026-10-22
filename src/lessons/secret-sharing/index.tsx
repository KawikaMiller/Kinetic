import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Shamir secret sharing hides a secret as a point of a random polynomial, so that any k of n shares rebuild it and k - 1 shares leave each possible secret equally likely.',
    what: `The secret is the constant term of a random polynomial of degree k - 1 over a small prime field, and each share is a point (x, y) on it. k points fix the polynomial, and Lagrange interpolation at 0 reads off the secret; fewer points fit one polynomial for each candidate secret. The page counts those polynomials in a 3-bit field, shares a byte over a 9-bit field, and shows what goes wrong: a mistyped share rebuilds a wrong secret without any warning, and coefficients drawn from a tiny set leak. The fields are toys and nothing here splits a real key.`,
    analogy: 'A vault with five keyholes where any three keys open it: two keys on their own leave the lock exactly as undecided as none, because each pair of keys fits each possible combination.',
    useCases: [
      'Splitting a vault unseal key or a backup key among several custodians so that no single person can open it',
      'Threshold schemes in hardware modules and wallet backups, where a quorum of holders is needed',
      'Recovering a lost secret from a subset of surviving shares without trusting any one holder',
      'Understanding why a corrupted share needs a separate integrity check, such as verifiable secret sharing',
    ],
    why: 'Splitting a key beats copying it just when the split is done correctly, and the failure modes are quiet: a wrong share rebuilds a wrong secret and a weak random source leaks. It builds on `modular-arithmetic`, `randomness-csprng` and `secrets-management`, and it stays out of key wrapping, which `envelope-encryption-kms` covers.',
    watch: 'On the grid the yellow dot at x = 0 is the secret and turns green once it is certain; a blue dot is a share with a custodian and a red dot a share the adversary holds. The bars count how many polynomials fit each candidate secret, grey when they are all equal. A red box is a refusal or a wrong rebuilt secret, and green marks the right secret.',
  },
  tryThis: [
    `Open A polynomial hides the secret (default GF(7), k = 3, secret 2, coefficients 3 and 1): press shares 1 and 2 only and the bars are seven equal ones, so every secret is equally possible. Press share 3 as well: one bar, and the secret is 2.`,
    `Open Share a byte (default 3 of 5, secret ${F.secret}): choose shares 1, 2 and 3 and press Reconstruct: ${F.secret}, with Lagrange coefficients ${F.basis}. Swap to shares 2, 4 and 5: also ${F.secret}. Leave only shares 1 and 2 chosen and press Interpolate anyway: ${F.anyway}, not ${F.secret}.`,
    `Open Where it goes wrong: change the y of share 3 from 84 to 85 and the rebuilt secret is ${F.corrupted} with no error. Then type x = 0 into a share: it is refused.`,
    `Still there, switch the coefficient source to Only 0 or 1: ${F.badZeroOne} of ${F.badField} secrets stay possible, against ${F.badUniform} of ${F.badField} for the uniform source.`,
  ],
  keyIdeas: [
    `With uniformly random coefficients, k - 1 shares fit one polynomial for each candidate secret: in the 3-bit field with k = 3, the ${F.pairs} pairs of shares were tried and each secret had exactly one polynomial each time (${F.checks} checks).`,
    `Any k shares rebuild the secret by Lagrange interpolation at 0: with shares 1, 2 and 3 of the byte example the coefficients are ${F.basis} and the sum is ${F.secret}, while shares 1 and 2 alone give ${F.anyway}.`,
    `Shamir sharing has no integrity check: changing one share by 1 rebuilt ${F.corrupted} instead of ${F.secret} with no error, which is why verifiable sharing exists.`,
    `Secrecy needs uniformly random coefficients: with a source limited to 0 and 1, ${F.badZeroOne} of ${F.badField} secrets stay possible in the hand case, where uniform coefficients leave ${F.badUniform}.`,
  ],
  quiz: [
    {
      q: 'In a 3-of-5 scheme an adversary holds two shares. What do they learn about the secret?',
      options: [
        'Nothing: every possible secret is equally consistent with the two shares they hold',
        'Its size, because the shares reveal how many bits the secret has once two are known',
        'Whether it is even or odd, since one bit of each share leaks the parity of the secret',
        'About a third of it, since two of the three shares needed to rebuild it are in hand',
      ],
      answer: 0,
      why: `Two points fit one polynomial for each of the possible secrets, so the adversary cannot prefer any of them: the page counts exactly one polynomial per candidate, in the ${F.pairs} share pairs of the small field.`,
    },
    {
      q: 'Which three shares of a 3-of-5 scheme rebuild the secret?',
      options: [
        'Only the first three that were issued, because the other two are backups for loss',
        'Any three that include share 1, which carries the constant term of the polynomial',
        'Any three of the five, whichever x-values they carry, as long as the x-values differ',
        'Any three whose x-values are consecutive, so that the interpolation lines up cleanly',
      ],
      answer: 2,
      why: `Three points with different x-values fix a degree-2 polynomial, so the choice does not matter: shares 1, 2, 3 and shares 2, 4, 5 both give ${F.secret} in the byte example.`,
    },
    {
      q: 'One of three shares used in a reconstruction was mistyped. What happens?',
      options: [
        'Reconstruction fails with an error, because the three points no longer fit a polynomial',
        'The mistyped share is detected and dropped, and the other two rebuild the secret',
        'A wrong secret comes out with no error, because the scheme has no integrity check',
        'The secret is rebuilt correctly, since the two good shares outvote the bad one',
      ],
      answer: 2,
      why: `Any three points with different x-values fit some polynomial, so nothing looks wrong. The page rebuilt ${F.corrupted} instead of ${F.secret} after one share changed by 1.`,
    },
    {
      q: 'Why does the "0 or 1 only" coefficient source break the secrecy of two shares of a 3-of-5 scheme?',
      options: [
        'The field becomes too small, so fewer than seven secrets can be represented at all',
        'Secrecy needs uniformly random coefficients, and a tiny support leaves few candidate secrets',
        'The shares become identical, so the two held shares carry the same information as one',
        'The Lagrange coefficients stop existing, so nobody could rebuild the secret from shares',
      ],
      answer: 1,
      why: `The polynomials that fit the two shares are limited to the coefficients the source can produce: ${F.badZeroOne} of ${F.badField} secrets remain in the hand case. The field and the Lagrange coefficients are unchanged.`,
    },
  ],
};

export default lesson;
