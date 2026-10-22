import type { LessonModule } from '../../core/types';
import { FACTS as F } from './facts';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Points on an elliptic curve can be added by a chord-and-tangent rule, and adding a point to itself k times is quick while finding k from the result takes about the square root of the group size by the best generic method.',
    what: `A curve y^2 = x^3 + ax + b has a rule for adding two points: draw the line through them, take its third intersection and reflect it. The same formulas work over a small finite field, where the curve is a scatter of points and a slope uses a modular inverse. Repeating the addition gives kG, computed by doubling and adding along the bits of k. This lesson runs a 5-bit toy curve (${F.toyCount} points, about ${F.toyBits} bits) that a walk of ${F.toyCount} steps breaks, checks the group law across the toy curve's ${F.toyCount ** 3} triples, and compares the page's own P-256 arithmetic with your browser. Despite the name, the curve is not an ellipse.`,
    analogy: 'A ball bouncing around a table in a fixed pattern: replaying k bounces is quick, but from where it ended you cannot read off k without retracing the bounces one at a time.',
    useCases: [
      'Key agreement in TLS and messaging apps, where both sides compute a shared point from their own scalar and the other side\'s public point',
      'Signatures in certificates, code signing and some blockchains, where a signer proves knowledge of a scalar without revealing it',
      'Small keys on constrained hardware: a 256-bit curve key is 32 bytes where an RSA modulus of comparable strength is far larger',
      'Passkeys and hardware tokens, which commonly store a curve key pair on the device',
    ],
    why: 'The group underneath ECDH, ECDSA and many certificates is a curve, so reading a cipher-suite name or a key size means knowing what kG is and why a 256-bit curve is compared with a much larger RSA modulus. It builds on `rsa`, `modular-arithmetic` and `diffie-hellman`.',
    watch: 'In the plane scene P is blue, Q is violet and the sum P + Q is green; the line and the third intersection are grey and dashed, and the point at infinity is yellow. In the finite-field grid every point of the curve is a grey square, with P blue, Q violet and the sum green; a red box is a refusal or a failed check. In the scalar scene green marks the cheap forward cost and red marks the hard-to-reverse cost and a refused result.',
  },
  tryThis: [
    `Open Finite field (p = 17, a = 2, b = 2). Click (5, 1), then the same cell again: the page doubles it to ${F.doubleG} and shows slope 13. Click (5, 1), then ${F.doubleG}: the sum is ${F.tripleG}.`,
    `Open Scalar multiplication. The default k = 13 gives ${F.doublings13} doublings, ${F.additions13} additions and ${F.point13}. Press 19: the point at infinity. Press 20: ${F.point20}.`,
    `Still in Scalar multiplication, read the cost lines: the naive walk back to k takes at most ${F.toyCount} steps here (the best generic method about ${F.toyGeneric}), while the P-256 line shows about ${F.p256Steps} steps by that same best method and about ${F.p256Time} at the made-up rate.`,
    `In Chord and tangent, the opening scene with a = -2, b = 1, P = (0, 1) and Q = (1, 0): P + Q is ${F.realSum}. Then set a = 0 and b = 0: the page refuses the curve because it has a sharp point.`,
  ],
  keyIdeas: [
    `One chord-and-tangent rule works over the reals and over a finite field: on the toy curve 2G is ${F.doubleG}, and G + 18G is the point at infinity because the two share an x and have opposite y.`,
    `Scalar multiplication costs about log2(k) doublings and additions (13G takes ${F.doublings13} and ${F.additions13}), while the best generic walk back takes about the square root of the group size.`,
    `The toy curve is broken at once: its ${F.toyCount} points need up to ${F.toyCount} steps by a naive walk and about ${F.toyGeneric} by the generic method, where P-256 needs about ${F.p256Steps}. It shows the law and is not for use.`,
    `The group law was checked over the ${F.toyCount ** 3} triples of the toy curve (nothing sampled); that covers this curve, and Hasse's bound is a theorem the page names and does not prove.`,
  ],
  quiz: [
    {
      q: 'Why can a 256-bit elliptic-curve key be compared with a much larger RSA modulus?',
      options: [
        'Known attacks on a well-chosen curve are generic, about the square root of the group size, while factoring has faster ones',
        'The curve key is stored in a much denser format that packs more strength into every byte, so fewer bytes carry the same protection',
        'Elliptic curves hide the key behind a longer algorithm, and each extra step the attacker must run multiplies the work involved',
        'RSA keys are padded with zeros before use, so their real size is far smaller than the number of bits they display',
      ],
      answer: 0,
      why: 'Strength depends on the cheapest known attack, not on how the key is stored or padded. Against a well-chosen curve that is a generic search of about the square root of the group order, while factoring has faster methods than trying divisors. The key-size equivalence is a from-memory comparison (NIST SP 800-57).',
    },
    {
      q: 'On the toy curve G = (5, 1) and 18G = (5, 16). What is G + 18G?',
      options: [
        '(5, 0), the point halfway between them on the vertical line through both of them',
        'The point at infinity, because the two points share an x and have opposite y',
        '(10, 6), which is the third multiple of the generator on this particular curve',
        'G again, because the sum wraps once past the end of the group and comes back',
      ],
      answer: 1,
      why: `The line through (5, 1) and (5, 16) is vertical, so it meets the curve nowhere else and the sum is the identity, the point at infinity. That is 19G, and the group has ${F.toyCount} points; (10, 6) is 3G, a different multiple.`,
    },
    {
      q: 'On the toy curve of order 19, what is 20G?',
      options: [
        'The point 2G, because the multiples count up past 19 and then double',
        'The point at infinity, because 20 is past the last row of the table',
        'A point off the curve, because 20 exceeds the order of the group',
        'G, because the multiples repeat every 19 steps around the group',
      ],
      answer: 3,
      why: `19G is the point at infinity, so 20G = 19G + G = G, and any k gives the same point as k mod 19: the page shows ${F.point20}. The multiples stay on the curve, since the sum of two points of the curve is a point of the curve.`,
    },
    {
      q: 'Why does the chord-and-tangent picture not literally carry over to a field with 17 elements?',
      options: [
        'The group law is a different rule over finite fields, with its own separate and unrelated formulas',
        'Curves over finite fields have no identity element, so the addition has nothing to return',
        'There is no continuous curve, only scattered points; slopes still work with a modular inverse',
        'Straight lines cannot be drawn through a grid that has only seventeen columns of cells',
      ],
      answer: 2,
      why: 'The algebra is the same: the slope is a ratio of differences and a modular inverse stands in for division. The picture is what changes, because a finite field gives scattered points and no continuous curve. The group check across the triples is what shows the law still holds there.',
    },
    {
      q: 'The page\'s own d x G equals your browser\'s public point for a fresh P-256 key. What does that show?',
      options: [
        'The page code is now suitable for protecting real keys, since it matched the browser output on one key',
        'The browser key is a weak one, because the page was able to reproduce its public point from it',
        'The two agree only because both programs read the same stored key from the browser memory',
        'The arithmetic agrees with a real implementation on that key, which does not make the code safe to use',
      ],
      answer: 3,
      why: 'Agreement on a fresh key is evidence that the arithmetic is right, which is the whole claim of the check. Anyone who knows the private scalar can compute the public point, so the match says nothing about the key being weak, and BigInt code that is not constant-time stays unfit for real keys.',
    },
  ],
};

export default lesson;
