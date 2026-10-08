import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Cross-site request forgery works because the browser attaches your cookie to a request no matter which site caused it. Defend by not attaching the cookie (SameSite), by proving a request came from your own page (a token, the Origin header), and by never changing state on a GET.',
    what: 'A page on another site can make your browser send a request to a site you are logged in to: an auto-submitted form, a script call, a link. If the session cookie goes along, the server sees a valid session and cannot tell the request from your own click. SameSite cookies keep the cookie home on cross-site POSTs, a CSRF token or an Origin check lets the server insist the request started on its own pages, and a custom header forces a CORS preflight that the other site fails. A bearer token in a header is not attached automatically, so it avoids the problem.',
    analogy: 'You are at the bank counter and a stranger slips a pre-filled form into your hand; the teller recognises you and processes it. The fix is a stamp that only the bank\'s own forms carry, which the stranger has never seen.',
    useCases: [
      'Any site with cookie sessions and endpoints that change things (email, password, payments, deletion)',
      'Choosing SameSite for session cookies, and knowing what breaks when an embed needs None',
      'Turning on the CSRF protection that most web frameworks ship, and knowing what it checks',
      'Deciding between cookie sessions and bearer tokens for a single-page app',
    ],
    why: 'It is the classic reason "it only works when the user is logged in" is not a safety argument. Modern browsers default cookies to Lax, which hides the bug in many apps until a GET handler changes state, an embed forces SameSite=None, or someone ships an old browser or a different default.',
    watch: 'A sequence diagram with You (blue), shop.example and other-site.example (orange, the abstract other site). Your own messages are blue, the forged request is orange, and the reply is red when the server accepted it (the harm) and green when it was rejected. In the headers panel the Cookie line is the yellow current line, absent when the browser held it back. In the server-check panel a line for a defence that is off is struck out and dim, passed checks are green ticks, the check that rejected the request is yellow, and the change line turns red if it ran. The Forged request stat is red when accepted and green when rejected or never sent.',
  },
  tryThis: [
    'From the default (SameSite None, auto-submitted form, no defences), press Play: the POST leaves with your cookie and the server accepts it. The last reply is red.',
    'Set SameSite to Lax: the form POST goes out with no cookie and arrives logged out. Then choose "Link you click (GET)": Lax sends the cookie again.',
    'Choose "Link you click (GET)", set Lax, then turn on CSRF token: the cookie goes along, and the token check is what stops it.',
    'Choose "Script on the other site (POST)" and turn on JSON + custom header: the browser must ask first, the server says no, and nothing is sent.',
    'Open "Why CORS doesn\'t stop this" with every defence off: the request was sent and accepted anyway. Then set Authentication to a bearer token: nothing is attached.',
  ],
  keyIdeas: [
    'The browser attaches the cookie whichever site caused the request, so the server must check where it came from.',
    'SameSite=Lax keeps the cookie off cross-site POSTs, but still sends it on a top-level GET link click, so GET must never change state.',
    'A CSRF token, an Origin check or a custom header each make the other site\'s request fail the server\'s check.',
    'CORS hides replies from other sites; it does not stop the request being sent.',
  ],
  quiz: [
    {
      q: 'A page on another site auto-submits a form POST to your site. What does CORS change about that request?',
      options: [
        'It blocks the request before it leaves the browser, so the server never sees it',
        'Nothing about sending: it goes out, and CORS only limits who can read the reply',
        'It removes the session cookie, so the user looks logged out to the server',
        'It makes the server check the request\'s CSRF token before it acts',
      ],
      answer: 1,
      why: 'A plain cross-site form POST is a "simple" request, so the browser sends it, with the cookie if the SameSite rules allow. CORS decides whether the other site may read the answer, which is too late. Only requests that need a preflight (a custom header) can be stopped before they leave.',
    },
    {
      q: 'Why is "this endpoint only accepts POST" not a CSRF defence?',
      options: [
        'Browsers silently turn cross-site POSTs into GETs before they are sent',
        'Another site can make the browser send a cross-site POST form',
        'Every POST request carries a CSRF token that the server can check',
        'Servers cannot tell a POST from a GET once the cookie is attached',
      ],
      answer: 1,
      why: 'Forms can POST to any address, so another site can cause one. The method is not a credential. What stops it is the cookie not being sent, or a token or an Origin check on the server.',
    },
    {
      q: 'A session cookie is SameSite=Lax. Which cross-site request still carries it?',
      options: [
        'An auto-submitted form that sends a POST to your server',
        "A script request that asks to include the user's credentials",
        'A top-level GET navigation, like a link the user clicks',
        'An image that the other site loads from your server',
      ],
      answer: 2,
      why: 'Lax exists so that following a link to a site keeps you logged in, so it is sent on top-level GET navigations. It is held back on cross-site POSTs, script requests and embedded resources. That is why a GET that changes state is still dangerous under Lax.',
    },
    {
      q: 'Why can the other site not pass the server\'s CSRF token check?',
      options: [
        "The token is in the shop's own pages, which other sites cannot read",
        'The browser strips the token from any request that another site starts',
        'Tokens are only valid on requests that are sent with the GET method',
        'The token is combined with the user\'s password before it is checked',
      ],
      answer: 0,
      why: 'The same-origin policy keeps the other site from reading your pages, so it cannot learn the token. The browser does not strip it, it works on POSTs, and it has nothing to do with the password. XSS on your own site would break this, which is a separate bug.',
    },
    {
      q: 'Why does an Authorization: Bearer header avoid classic CSRF?',
      options: [
        'It is encrypted, so another site could not send a valid one',
        'Servers ignore that header on requests from other sites',
        "The browser never adds it; only the app's own code does",
        'Tokens expire too quickly for a forged request to be useful',
      ],
      answer: 2,
      why: 'Cookies are attached automatically, which is the whole problem. A header the app sets by hand is not, so another site\'s form or link carries nothing. The price is that the token must be kept where script can read it, which is the trade-off with browser-storage and XSS.',
    },
  ],
};

export default lesson;
