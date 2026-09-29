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
    watch: "Four lanes along the bottom. In ① and ②, blue pills are requests, violet ones are session-store traffic, green are responses and red mark an attacker or bad outcome. The panels below show what the browser holds and what the server stores. The token is coloured by part: violet header, blue payload, yellow signature. ③ runs the same traffic through both designs. In ④ you edit the payload and watch the server's real HMAC check reject it.",
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
    "A JWT payload is base64, not encrypted: anyone can read it. The signature only stops changes.",
    "Cookie flags matter: HttpOnly (no JS access), Secure (HTTPS only), SameSite (CSRF protection).",
  ],
  quiz: [
    {
      q: 'An attacker changes "role":"user" to "role":"admin" inside a JWT. What happens?',
      options: ['They become admin', 'The signature no longer matches, so the server rejects it', 'The server decrypts it and notices', 'Nothing, roles aren’t checked'],
      answer: 1,
      why: 'The server recomputes the signature over the edited payload with its secret; without that secret the attacker can’t produce a matching one.',
    },
    {
      q: 'You need to ban a user immediately. Which is simpler?',
      options: ['Long-lived JWTs', 'Server-side sessions', 'Putting the ban inside the JWT', 'Asking the user to log out'],
      answer: 1,
      why: 'Delete their session rows and the next request fails. A JWT stays valid until it expires unless you add a denylist.',
    },
    {
      q: 'What does the HttpOnly cookie flag protect against?',
      options: ['JavaScript (e.g. an XSS attack) reading the cookie', 'Sending the cookie over HTTP', 'Cross-site request forgery', 'Cookie expiry'],
      answer: 0,
      why: 'HttpOnly hides the cookie from document.cookie. Secure handles HTTPS-only; SameSite helps against CSRF.',
    },
  ],
};

export default lesson;
