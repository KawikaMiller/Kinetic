import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Cache-Control tells every cache on the way how long a response stays fresh and who may keep it, and ETags let a stale copy be checked with a tiny 304 instead of downloaded again.',
    what: 'A browser cache keeps responses for one user; a shared cache (a CDN or proxy) keeps them for everyone. A stored copy is fresh while its age is under its freshness lifetime: `s-maxage` in a shared cache, otherwise `max-age`. A fresh copy is used without asking anyone. A stale one is revalidated: the cache sends `If-None-Match` with the copy\'s ETag, and the origin answers `304 Not Modified` (headers only) or a full `200` with the new version. `no-cache` means store but always revalidate, `no-store` means never store, and `private` keeps a response out of shared caches.',
    analogy: 'Milk in your fridge has a best-before date (max-age). Before it, you just drink it. After it, you ring the shop and ask "still the same batch?" (If-None-Match), and "yes" (304) is a much shorter call than a new delivery (200).',
    useCases: [
      'Caching fingerprinted JS and CSS for a year while HTML always revalidates',
      'Setting CDN lifetimes with s-maxage separately from what browsers keep',
      'Keeping logged-in pages out of shared caches with private (Vary: Cookie keeps them apart instead)',
      'Serving a slightly stale API response instantly with stale-while-revalidate',
    ],
    why: 'Caching is the cheapest speed-up there is, and the most common way to serve stale or wrong data: an HTML page cached for a year, or one user\'s page handed to another by a CDN. Reading Cache-Control precisely is a daily job for front-end, back-end and platform engineers alike. It builds on `http-basics`, the CDN edges from `cdn-edge` and the cache ideas in `lru-cache`.',
    watch: 'The ladder has three lifelines: the requesting user\'s browser (blue header), the shared cache (violet header) and the origin (grey). Requests are blue arrows; a green self-loop or green arrow is a fresh hit, a violet arrow a 304 Not Modified, a yellow arrow a full 200 with the body, an orange one a stale copy served, and a red arrow with "Ada\'s page!" a per-user page handed to the wrong user. The arrow being explained now sits on a pale yellow band. In the log, the result chips use the same colours (green fresh hit, violet 304, yellow miss or new 200, orange stale) and a red chip flags a leak or a per-user page kept in the shared cache. In the decision trail, a green ✓ is a rule that let the cache use or keep its copy and a grey ✗ one that said no: no copy, not fresh, no stale serving, or not stored. Directive chips fill blue when set and Vary chips violet; a refused number shows a red message. At the top, the origin\'s 200s are yellow and its 304s violet.',
  },
  tryThis: [
    'With Hashed static asset loaded, press Ada requests, set Wait to 1 day and let it pass, then press Ada requests and Ben requests: nobody asks the origin.',
    'Load HTML page and press Ada requests twice: the second is a 304 with no body. Deploy a new version and request again.',
    'Load Per-user dashboard, set The developer to forgot private, then press Ada requests and Ben requests: Ben gets Ada\'s page.',
    'Load API with Vary: Ada requests, then Ben requests (a miss: he accepts gzip, so Vary gives him a separate shared entry). Set Wait to 5 min, let it pass, then Ada requests: her browser serves its stale copy at once and refreshes it in the background.',
    'Turn on no-store and send a few requests: every one is a full trip to the origin.',
  ],
  keyIdeas: [
    'A fresh copy is used without asking anyone: its age against max-age, or s-maxage in a shared cache.',
    '`no-cache` means store but revalidate every time; `no-store` means never store; `private` keeps it out of shared caches.',
    'Revalidation sends If-None-Match with the ETag; an unchanged resource comes back as a body-less 304.',
    'Vary splits the shared cache by request headers; a per-user page needs `private` (or Vary: Cookie, which keeps pages apart rather than out), or one user can see another\'s.',
  ],
  quiz: [
    {
      q: 'A response carries `Cache-Control: no-cache`. What may a browser do with it?',
      options: [
        'Store it, but check with the server before every reuse',
        'Never store it anywhere, not even in its own cache',
        'Reuse it freely until the server sends a new version',
        'Store it for one minute, then drop it without asking',
      ],
      answer: 0,
      why: '`no-cache` is about reuse, not storage: the copy may be kept, but it must be revalidated every time, which is usually a cheap 304. "Never store it" is `no-store`, the directive people often mean when they write `no-cache`.',
    },
    {
      q: 'Which header keeps a per-user page out of a CDN while still letting the user\'s own browser cache it?',
      options: [
        '`Cache-Control: private, max-age=60`',
        '`Cache-Control: public, max-age=60`',
        '`Cache-Control: no-store, max-age=60`',
        '`Cache-Control: s-maxage=60, max-age=60`',
      ],
      answer: 0,
      why: '`private` forbids shared caches from storing it while the browser may keep it for 60 s. `no-store` also keeps it out of the CDN, but the browser can\'t keep it either. `public` and `s-maxage` both invite the CDN to store it, which is how one user\'s page reaches another.',
    },
    {
      q: 'A browser revalidates with `If-None-Match: "v7"` and the file has not changed. What does the server send?',
      options: [
        '304 Not Modified: headers only, no body',
        '200 OK with the full body, marked as cached',
        '204 No Content, telling it to keep its copy',
        '412 Precondition Failed, as the tag matches',
      ],
      answer: 0,
      why: 'A matching ETag on If-None-Match means "you already have it", answered with 304 and no body, so only headers travel. 412 is the answer to a failed If-Match (a conditional write), and 204 means a request succeeded with nothing to return, which says nothing about the cached copy.',
    },
    {
      q: 'A CDN receives `Cache-Control: max-age=60, s-maxage=600`. How long is a stored copy fresh in the CDN, and in a browser?',
      options: [
        '600 s in the CDN and 60 s in the browser',
        '60 s in both, because max-age always wins',
        '600 s in both, because the longer one wins',
        '660 s in the CDN, since the two values add',
      ],
      answer: 0,
      why: 'Shared caches use s-maxage first and browsers ignore it, so each layer gets its own lifetime. That split is the point of s-maxage: a long CDN lifetime you can purge, and a short one in browsers you can\'t reach.',
    },
    {
      q: 'Why can a fingerprinted file like `app.3f9a.js` safely use `max-age=31536000, immutable`?',
      options: [
        'A new release gets a new name, so old copies are never asked for',
        'Browsers compare the hash in the name with the body on each visit',
        'CDNs purge any file a year old, so nothing stale is ever served',
        'immutable makes the server push updates to every cached copy',
      ],
      answer: 0,
      why: 'The HTML (which always revalidates) points at the new name after a deploy, so the year-long copy of the old file simply stops being requested. Browsers don\'t verify the hash in a file name, and immutable only says "don\'t revalidate this while it\'s fresh"; nothing gets pushed.',
    },
  ],
};

export default lesson;
