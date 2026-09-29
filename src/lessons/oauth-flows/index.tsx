import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: "OAuth 2 lets you give an app limited access to your data somewhere else without handing over your password. OpenID Connect (OIDC) adds a standard way to learn who you are.",
    what: "In the Authorization Code flow, the app sends your browser to the authorization server, you log in and approve specific scopes there, and the browser comes back with a short-lived code. The app swaps that code for tokens over a direct server-to-server call. An access token (plus a refresh token) lets it call the API within those scopes. PKCE binds the code to the app that started the flow, so a stolen code is useless. With the openid scope, OIDC also returns an ID token: a signed JWT saying who you are.",
    analogy: "A hotel key card instead of your house keys: the front desk (authorization server) checks your ID, then issues a card that opens only the rooms you approved, expires by itself, and can be cancelled without changing any locks.",
    useCases: [
      "\"Sign in with Google / GitHub / Apple\" (that's OIDC)",
      "Letting a third-party app read your calendar, repos or photos",
      "Mobile and single-page apps talking to their own APIs (Authorization Code + PKCE)",
      "Corporate single sign-on through Okta, Entra ID or Auth0",
    ],
    why: "Seniors design and review these integrations, and OAuth misconfigurations (no PKCE, unchecked state, over-broad scopes, tokens in URLs or logs) are a common source of account takeovers. You need to know which channel is trusted, what each token is for, and that OAuth is about authorization, not authentication.",
    watch: "Blue pills travel the front channel (browser redirects anyone on the device can see), violet pills the back channel (direct server-to-server calls), green means success and red means an attacker or a denial. The URL bar colour-codes the parameters: blue scope, violet state, yellow PKCE challenge, green code. Below, the chips show what PhotoPrint (and the attacker) currently holds.",
  },
  tryThis: [
    "Play it through once with PKCE on: follow the code from the URL bar into the back channel.",
    "Set Attacker to \"Intercepts the code\" and turn PKCE off: watch your photos leak.",
    "Now turn PKCE back on with the attacker still there: the stolen code gets rejected.",
    "Switch Scope to plain photos.read and notice there's no id_token and no \"signed in as\".",
  ],
  keyIdeas: [
    "The app never sees your password: you authenticate on the authorization server itself.",
    "The browser only carries a short-lived code; tokens come over the back channel.",
    "PKCE: the app proves it started the flow by revealing the verifier behind the challenge.",
    "Access token = authorization (what the app may do). ID token = authentication (who you are, via OIDC).",
  ],
  quiz: [
    {
      q: 'What does PKCE stop?',
      options: ['Phishing for your password', 'An intercepted authorization code being swapped for tokens', 'Expired access tokens', 'Cross-site scripting'],
      answer: 1,
      why: 'Only the app that created the code_verifier can prove it matches the code_challenge sent at the start.',
    },
    {
      q: 'Why does the flow return a code first instead of the access token directly?',
      options: ['Codes are shorter to type', 'The front channel (browser URLs) is exposed; tokens should come over the back channel', 'Access tokens are too big for URLs', 'It makes the flow faster'],
      answer: 1,
      why: 'URLs leak into history, logs and other apps. A single-use code that still needs the back-channel exchange limits the damage.',
    },
    {
      q: 'An app needs to know who the user is. Which token answers that?',
      options: ['The access token', 'The refresh token', 'The OIDC ID token', 'The authorization code'],
      answer: 2,
      why: 'The ID token is a signed JWT of identity claims. Access tokens are meant for the API and say what the app may do.',
    },
  ],
};

export default lesson;
