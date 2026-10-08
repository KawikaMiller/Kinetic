import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Multi-factor means two different kinds of proof, but not all MFA stops phishing: a code you can type is a code a fake site can pass on. Passkeys sign a challenge for the real site only, so a look-alike has nothing to use, and an account is only as strong as its weakest recovery path.',
    what: 'The factors are something you know, have or are. A time-based one-time code (TOTP) is the phone and the server each computing an HMAC (see `macs-hmac`) over the current 30-second counter and cutting it to six digits, with no network between them. A passkey is a key pair your authenticator keeps for one site (see `digital-signatures-pki`): it signs a fresh challenge together with the site\'s origin, which the browser supplies, so a look-alike address gets no signature. Recovery routes (a text message, backup codes, a second key) are extra ways in, and the weakest one sets the real security.',
    analogy: 'A code is like reading out a combination to whoever asks: they can repeat it to the real door while it still works. A passkey is a signed letter addressed to one building, which the doorman of any other building cannot use.',
    useCases: [
      'Adding an authenticator app or a security key to a service\'s sign-in',
      'Choosing what to offer when someone loses their phone, and what that choice costs',
      'Rolling out passkeys next to passwords without weakening recovery',
      'Debugging "invalid code" reports, which are often the phone\'s clock',
    ],
    why: 'MFA is on most security checklists, and "we have MFA" is often taken to mean "phishing is handled". Knowing why a TOTP code can be relayed, what a passkey changes, and that a text-message reset can undo it all lets you make the right calls on login and recovery design.',
    watch: 'Scene 1: chips grouped by kind (know blue, have yellow, are pink); the verdict is green for two different kinds and red for one kind. Scene 2: the shared secret is purple with a lock, the counter and the countdown bar are blue, the offset nibble and the four selected bytes in the 20-byte hex dump are yellow, a matching code is green and a refused one red. Scene 3: you and your own steps are blue, the look-alike site is orange, the passkey signature is purple, a matching origin or "nothing to give" is green, and a stranger signing in is red. Scene 4: each way in is a chip coloured by strength (green phishing-resistant, orange phishable, red weak), and the headline is the weakest one enabled.',
  },
  tryThis: [
    'In scene 1 (password + security question), see that two of the same kind is not multi-factor. Choose "Password + authenticator app" and compare.',
    'In scene 2, move the phone clock to +30 s, then +45 s, then +60 s: always accepted, sometimes accepted, always refused.',
    'In scene 3 (password + code, on the look-alike) press Play: the fake site passes everything on. Switch to Passkey and play again.',
    'In scene 3, choose Passkey and read the table: the same signature verifies for one origin only. Then switch "You are on" to the real site.',
    'In scene 4 (passkey with a text-message fallback), enable "A second passkey or key" and disable the text message: the real strength rises.',
  ],
  keyIdeas: [
    'Multi-factor needs different kinds of factor: two secrets you know are one kind.',
    'TOTP is HMAC over a time counter: phone and server compute the same code on their own, and the server allows one step of drift either way.',
    'Anything you can type, a look-alike site can pass on; a passkey signs for the real origin only.',
    'The weakest enabled way in, recovery included, is the real strength.',
  ],
  quiz: [
    {
      q: 'Someone says "we require a password and an authenticator code, so phishing is solved". What is the gap?',
      options: [
        'Authenticator codes are made from the password, so they add nothing new',
        'A look-alike site can collect both and pass them on within 30 seconds',
        'Six-digit codes are easy to guess in the 30 seconds they stay valid',
        'The phone and the server cannot agree on a code without a network',
      ],
      answer: 1,
      why: 'Both factors are things you can type, so a fake page can use them straight away. The code is computed from a shared secret and the time, not from the password, and a six-digit guess in 30 seconds is a throttled one-in-a-million shot. A passkey avoids this by signing for the real origin only.',
    },
    {
      q: 'A code is refused although the password was right. The phone clock is 90 seconds fast. Why?',
      options: [
        'The secret changes every time the clock is more than a minute out',
        'The server only accepts codes from exactly its own 30 seconds',
        'Its counter is three steps ahead, beyond the one step forgiven',
        'Fast clocks make the HMAC output longer, so the digits are wrong',
      ],
      answer: 2,
      why: 'The code depends only on the secret and floor(time / 30). Ninety seconds is three steps, so the phone computes a different counter. Servers usually accept one step either side to forgive small drift, which is more than "exactly its own 30 seconds".',
    },
    {
      q: 'On a look-alike address, why does a passkey leave a phishing site with nothing usable?',
      options: [
        'The passkey is a long password that the browser types without showing it',
        'The look-alike site cannot reach the internet, so the sign-in times out',
        'Passkeys are checked against a list of look-alike sites that were reported',
        'The signature covers the origin, and no credential exists for the look-alike',
      ],
      answer: 3,
      why: 'The authenticator holds a key pair per site and the browser tells it which origin is asking. On the look-alike it has no credential to offer, and a signature made for the real site would not verify for another origin. It is not a typed secret and does not rely on a blocklist.',
    },
    {
      q: 'An account has a passkey, plus a text-message reset so that people can recover it. What is its real strength?',
      options: [
        'That of the text-message reset: an attacker uses the weakest way in',
        'That of the passkey, because it is the strongest method that is enabled',
        'The average of the two, since both of them have to be passed',
        'That of the passkey, as long as the user normally signs in with it',
      ],
      answer: 0,
      why: 'Every enabled way in is available to an attacker too, and a text message can be redirected by a SIM swap or typed into a fake site. Security follows the weakest path, which is why recovery has to be designed as carefully as sign-in.',
    },
  ],
};

export default lesson;
