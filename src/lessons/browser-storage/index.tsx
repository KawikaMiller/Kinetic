import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Browsers keep data in four places: cookies, localStorage, sessionStorage and IndexedDB. Only cookies are sent to the server, and only cookies can be hidden from JavaScript.',
    what: 'Cookies are small strings the browser attaches to matching requests automatically; flags decide when (Secure: https only; SameSite: whether cross-site requests carry them; Domain and Path: which URLs) and whether page scripts can see them (HttpOnly). localStorage keeps strings per site until cleared; sessionStorage is the same but per tab; IndexedDB stores large structured data asynchronously. None of the last three is ever sent to a server on its own, and any script running on the page can read all of them.',
    analogy: 'Cookies are a badge clipped to your coat that security reads at every door; localStorage is a locker only you open; sessionStorage is a locker that\'s emptied when you leave the room.',
    useCases: [
      'Keeping someone logged in with an HttpOnly, Secure session cookie',
      'Remembering UI preferences like theme or language in localStorage',
      'Saving a half-written form per tab in sessionStorage',
      'Offline data and caches for web apps in IndexedDB',
    ],
    why: 'Picking the wrong drawer is a classic security bug: an auth token in localStorage is one XSS away from being stolen, and cookies without the right SameSite flag enable CSRF. It also affects performance, because every cookie rides along on every request.',
    watch: 'Four drawers show what\'s stored and each one\'s properties; the cookies drawer has a yellow edge because it\'s the one that travels. Press Send request and a blue packet goes from the browser to the server; the Cookie header it carries is yellow, and under it each cookie says whether it was sent or, in grey, why not. Running the XSS script marks everything the attacker could read in red and the HttpOnly cookie it couldn\'t read in green.',
  },
  tryThis: [
    'Send "Open example.com", then "Form POST from other.com": the Lax cookies stay home on the cross-site POST.',
    'Pick "Link from other.com": a cross-site link click still carries Lax cookies, but set the session cookie to Strict and it doesn\'t.',
    'Run an XSS script: localStorage.authToken is stolen, the HttpOnly session cookie isn\'t.',
    'Switch "Browser tab" to "Open a new tab": sessionStorage is empty there, everything else is shared.',
    'Set a cookie to SameSite=None and switch Secure off: the browser refuses to keep it at all.',
  ],
  keyIdeas: [
    'Only cookies are sent to the server, automatically, on every matching request: keep them small.',
    'HttpOnly hides a cookie from JavaScript; nothing can hide localStorage from a script on the page.',
    'SameSite=Lax (what Chrome assumes if you set none) sends cookies on top-level GET navigations from other sites, not on their POSTs or embedded requests.',
    'Store session tokens in HttpOnly, Secure cookies, not in localStorage.',
  ],
  quiz: [
    {
      q: 'Is localStorage a safe place to keep an auth token?',
      options: [
        'Yes: other sites can\'t read it',
        'No: any script that runs on your page (an XSS bug, a bad dependency) can read it',
        'Yes, if you use HTTPS',
        'Yes, it\'s encrypted',
      ],
      answer: 1,
      why: 'Other origins can\'t read it, but every script on your own page can. An HttpOnly cookie is invisible to page scripts, so an XSS bug can\'t simply read the token.',
    },
    {
      q: 'A page on other.com submits a POST form to example.com. Is a SameSite=Lax cookie for example.com sent?',
      options: ['Yes', 'No', 'Only over http', 'Only if HttpOnly'],
      answer: 1,
      why: 'Lax cookies go along on cross-site top-level GET navigations, not on cross-site POSTs or embedded requests. That\'s what blocks most CSRF.',
    },
    {
      q: 'Which of these does the browser send to the server automatically?',
      options: ['localStorage', 'sessionStorage', 'Cookies', 'IndexedDB'],
      answer: 2,
      why: 'Only cookies are attached to requests. The other three stay in the browser unless your code sends them.',
    },
  ],
};

export default lesson;
