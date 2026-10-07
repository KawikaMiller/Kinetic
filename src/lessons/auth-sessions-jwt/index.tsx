import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "After you log in, the server has to recognise your next request. Sessions keep a record on the server and give you an ID; JWTs give you a signed token that proves who you are by itself.",
    what: "With sessions, the server stores 'session 7f3a… = user 42' and sends only the random ID, usually in a cookie; each request is looked up. With a JWT (JSON Web Token), the server signs a small JSON document of claims (user id, role, expiry) with a secret key and hands over the whole thing; each request is checked by re-verifying the signature, no lookup needed. The trade-off: sessions are easy to revoke but need a shared store; JWTs scale without one but stay valid until they expire.",
    analogy: "A session is a coat-check ticket: meaningless on its own, the attendant looks it up. A JWT is a stamped festival wristband: security trusts the stamp at a glance, but can't take it back until the festival ends.",
    useCases: [
      "Logging into any website (session cookies are still the default for many web apps)",
      "Mobile apps and APIs sending Authorization: Bearer tokens",
      "Service-to-service calls and single sign-on (OIDC ID tokens are JWTs)",
      "Short-lived access tokens paired with revocable refresh tokens",
    ],
    why: "Auth bugs are some of the most expensive bugs there are. Mid-level engineers are expected to pick between these deliberately, set cookie flags correctly, know that JWT payloads are readable by anyone, and explain why a stolen token keeps working after logout.",
    watch: "Four lanes, picked at the top. In ① and ②, blue pills are requests, violet ones are session-store traffic, green are responses and red mark an attacker or a bad outcome; the session store is the violet box. The panels below show what the browser holds and what the server stores. The token is coloured by part: violet header, blue payload, amber signature, and the server's signing-key pill is amber too. ③ runs the same traffic through both designs: a blue dot is the request, turning violet on its store hop, and the verdicts go green when the right thing happened and red when it failed or let a banned user in. In ④ you edit the payload and watch the server's real HMAC check: signature characters that don't match are underlined in red.",
  },
  tryThis: [
    "Play ① Sessions to the end: logout deletes a row, and the copied cookie instantly dies.",
    "Play ② JWT to the end and compare: the same copied token keeps working after logout.",
    "In ④ Forge a token, change role to \"admin\", then try each way of re-signing it.",
    "In ③ At scale, watch what happens to each lane when the session store goes down.",
  ],
  keyIdeas: [
    "Sessions: a random ID in a cookie, state on the server. Instant revocation, but every request needs a store lookup.",
    "JWT: signed claims the client carries. No lookup, but can't be revoked before exp without extra machinery.",
    "A JWT payload is base64url, not encrypted: anyone can read it. The signature only stops changes.",
    "Cookie flags matter: HttpOnly (no JS access), Secure (HTTPS only), SameSite (limits cross-site sending; one CSRF defence).",
  ],
  quiz: [
    {
      q: 'An attacker changes "role":"user" to "role":"admin" inside a JWT. What happens?',
      options: [
        'They become admin on the next request',
        'The signature stops matching: rejected',
        'The server decrypts it and spots the edit',
        'Nothing: roles are only checked at login',
      ],
      answer: 1,
      why: "The server recomputes the signature over the edited payload with its secret; without that secret the attacker can't produce a matching one. Nothing is decrypted: the payload was never encrypted, only signed.",
    },
    {
      q: 'You need to ban a user immediately. Which is simpler?',
      options: ['Long-lived JWTs', 'Server-side sessions', 'Putting the ban inside the JWT', 'Asking the user to log out'],
      answer: 1,
      why: "Delete their session rows and the next request fails. A JWT stays valid until it expires unless you add a denylist, and a ban written into a new JWT doesn't touch the copies already handed out.",
    },
    {
      q: 'What does the HttpOnly cookie flag protect against?',
      options: [
        'Page scripts reading the cookie',
        'The cookie travelling over plain HTTP',
        'Other sites sending it with forged requests',
        'The cookie expiring before logout',
      ],
      answer: 0,
      why: 'HttpOnly hides the cookie from document.cookie, so injected script (XSS) cannot read it. Plain HTTP is what Secure stops, and cross-site forged requests are what SameSite limits.',
    },
    {
      q: "Who can read the claims inside a JWT's payload?",
      options: [
        'Only the server that holds the key',
        'Anyone who has a copy of the token',
        'Only the user the token was issued to',
        'Nobody: the payload is encrypted',
      ],
      answer: 1,
      why: "The payload is base64url-encoded JSON, not encrypted: anyone holding the token can decode it, as the Decoded panel shows. The key only signs it, so it can't be changed without being caught. Never put secrets in a JWT.",
    },
  ],
};

export default lesson;
