import type { LessonModule } from '../../core/types';
import { Stage } from './Stage';

const lesson: LessonModule = {
  Stage,
  summary: {
    tldr: 'Cross-site scripting happens when a page writes someone else\'s text into itself without encoding it for the place it lands, so the browser reads that text as part of the page. The fix is encoding for the context, safe browser calls, and a Content Security Policy as a second layer.',
    what: 'A comment, a name or a URL value is data, but a page template puts it inside HTML text, a quoted attribute, a link or a script string, and each of those places has its own rules about which characters matter. Encoding the value for its own context keeps it data. Safe browser calls (textContent, not innerHTML) and a framework\'s automatic escaping do that work for you. A strict Content Security Policy then limits which scripts may run at all, so one missed spot is not the end.',
    analogy: 'Mailing a form letter: if the blank is read aloud with the same voice as the printed text, whatever someone writes in it sounds like the company speaking. Encoding is putting the blank in quotation marks, in the way the particular letter needs.',
    useCases: [
      'Showing user comments, names and search terms on a page',
      'Putting a value into a link, an attribute or an inline script block',
      'Choosing between textContent and innerHTML in front-end code',
      'Deciding session cookie flags and a Content Security Policy for a site',
    ],
    why: 'Output encoding is the everyday habit that prevents this class of bug, and it is easy to get wrong without noticing: escaping for HTML feels complete, but a URL and a script string need different encoding. Knowing which layer does what lets you review a template and say what is still exposed.',
    watch: 'Scene 1: your text is blue with a light blue background, characters the page reads as structure turn red, and encoded output that stays data is green; the grey part is the template around it. Each card has three rows (as typed, HTML-escaped everywhere, encoded for that place) and a verdict line. Scene 2: a list of browser calls with unsafe ones marked red and safe ones green; the chosen call shows the pieces that land in the page (blue text, red elements). Scene 3: the orange box is a placeholder for an unwanted script, never real code. A layer that is on is violet and turns green once it stopped something; a layer that is off is dashed grey. Targets turn red when reached and grey when not, and the table lists what was stopped by which layer.',
  },
  tryThis: [
    'In scene 1, with "use <b>bold</b>": only the HTML text card breaks when pasted as typed. Look at the script card\'s middle row: escaping for the wrong place garbles the text.',
    'Pick "5 > 3 & 2 < 4": fine as HTML text, but the URL card splits it into two parts, and HTML-escaping everywhere does not fix that.',
    'Pick the Windows path: nothing in it looks like markup, yet the script card quietly changes its text.',
    'In scene 2, innerHTML is selected: with "use <b>bold</b>" it turns into an element. Click the textContent line to see the same value stay text.',
    'In scene 3 everything is off and everything is reached. Turn on HttpOnly: the cookie is safe, but "act as the user" is still reached. Then turn on CSP.',
  ],
  keyIdeas: [
    'Encode for the context the value lands in: HTML text, attribute, URL and script string each need their own encoder.',
    'Set text, not markup: textContent, a framework\'s default binding, and an allow-list for link schemes.',
    'A strict CSP and HttpOnly cookies limit the damage; they do not replace encoding.',
    'HttpOnly hides the cookie, but a script on the page can still act as the user.',
  ],
  quiz: [
    {
      q: 'A teammate says every value is HTML-escaped before it goes into a template, so the page is covered. Where does that still fall short?',
      options: [
        'Escaped text can no longer be shown to the user as readable text',
        'A value placed in a URL or script string needs its own encoding',
        'HTML-escaping only works on values that are longer than a few words',
        'Browsers skip the escaping when a page is served over HTTPS',
      ],
      answer: 1,
      why: 'HTML escaping is the right encoder for HTML text and quoted attributes. A URL value needs percent-encoding and a script string needs string escaping, so one encoder everywhere is the tempting half-fix. Escaped text still displays as readable text, and HTTPS does not change how pages are parsed.',
    },
    {
      q: 'A session cookie is HttpOnly and an unwanted script still runs on the page. What does HttpOnly change?',
      options: [
        'The script is stopped from running anywhere on that page',
        'The script can read the cookie only until the user signs out',
        'The script cannot read the cookie, yet can still act as the user',
        "The browser stops attaching the cookie to the site's own requests",
      ],
      answer: 2,
      why: "HttpOnly keeps the cookie value out of script reach, but the browser still attaches the cookie to the script's same-site requests, so the script can act as the user. Stopping the script from running is the job of encoding and a strict CSP.",
    },
    {
      q: 'Which line puts a comment into a page as plain text, whatever the comment contains?',
      options: [
        'note.innerHTML = comment;',
        'document.write(comment);',
        'note.outerHTML = comment;',
        'note.textContent = comment;',
      ],
      answer: 3,
      why: 'textContent never parses its value, so it stays text. innerHTML, outerHTML and document.write all read the value as markup, so a comment with tag-like text changes the page.',
    },
    {
      q: 'The session cookie is SameSite=Lax. Does that stop a script injected into your own page from making requests as the user?',
      options: [
        'No: those requests come from your own site, so the cookie is attached',
        'Yes, because Lax cookies are never sent along with requests that scripts make',
        'Yes, but only for the requests that use the POST method, not for GET requests',
        'No, because SameSite only has an effect on cookies that are marked HttpOnly',
      ],
      answer: 0,
      why: 'SameSite limits cookies on requests started from other sites. A script on your page sends same-site requests, so Lax or Strict makes no difference to it. SameSite helps against forged cross-site requests, which is a different problem.',
    },
    {
      q: 'What job does a strict Content Security Policy do in this lesson?',
      options: [
        'It encodes every value automatically before it ever reaches the template',
        'It stops other sites from putting links on their pages that point at yours',
        'It limits which scripts may run, so one missed spot does less damage',
        'It hides cookie values from the scripts that the page itself already runs',
      ],
      answer: 2,
      why: 'A CSP is defence in depth: with nonce-based script rules an injected script is not run. It does not encode anything and does not hide cookies, so encoding stays the first fix and the CSP is the net under it.',
    },
  ],
};

export default lesson;
