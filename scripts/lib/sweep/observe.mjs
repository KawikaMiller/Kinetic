// Collects what a page says outside the DOM while the sweep drives it: console errors and warnings, uncaught
// exceptions and requests that leave the page. The engine drains it after every action and attributes the events
// to that action.
import { isOffPage } from './scan.mjs';

/** Console message types that count: `warn` is how Puppeteer names the console's "warning". */
const COUNTED_TYPES = new Set(['error', 'warn', 'warning']);
/** Characters of a message kept in a report. */
const MESSAGE_CHARS = 300;

/**
 * Start listening on `page`. `baseUrl` is the dev server's own origin: a request anywhere else is off-page.
 * Returns `{ drain, stop }`: `drain()` empties and returns the events since the last call, as
 * `{ source: 'console' | 'pageerror' | 'request', text }`.
 */
export function observePage(page, baseUrl) {
  let events = [];
  const push = (source, text) => events.push({ source, text: text.slice(0, MESSAGE_CHARS) });
  const onConsole = (m) => COUNTED_TYPES.has(m.type()) && push('console', m.text());
  const onPageError = (e) => push('pageerror', e.message);
  const onRequest = (r) => isOffPage(r.url(), baseUrl) && push('request', r.url());
  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('request', onRequest);
  return {
    drain() {
      const out = events;
      events = [];
      return out;
    },
    stop() {
      page.off('console', onConsole);
      page.off('pageerror', onPageError);
      page.off('request', onRequest);
    },
  };
}
