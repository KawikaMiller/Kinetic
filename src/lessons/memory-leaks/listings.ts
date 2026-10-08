import type { CacheFix, LeakId } from './model';

/**
 * Illustrative app code for each preset (not run): what the heap model in model.ts is a model
 * of. `bad` is the line that leaks; `good` the lines the fix adds or changes.
 */
export interface Listing {
  title: string;
  lines: string[];
  bad?: number;
  good?: number[];
}

const LISTENER: Listing = {
  title: 'chart.js · a listener on every mount',
  lines: [
    'function mountChart(root) {',
    '  const view = new ChartView(root);   // rows: ~4 MB, plus its DOM',
    "  window.addEventListener('resize', () => view.redraw());",
    '  return function unmount() {',
    '    root.remove();                    // the listener stays on window',
    '  };',
    '}',
  ],
  bad: 2,
};

const LISTENER_FIX: Listing = {
  title: 'chart.js · fixed with an AbortController',
  lines: [
    'function mountChart(root) {',
    '  const view = new ChartView(root);',
    '  const ac = new AbortController();',
    "  window.addEventListener('resize', () => view.redraw(), { signal: ac.signal });",
    '  return function unmount() {',
    '    ac.abort();                       // removes the listener',
    '    root.remove();',
    '  };',
    '}',
  ],
  good: [2, 3, 5],
};

const CACHE: Listing = {
  title: 'reports.js · a cache that only grows',
  lines: [
    'const responseCache = new Map();',
    'async function getReport(id) {',
    '  if (responseCache.has(id)) return responseCache.get(id);',
    '  const res = await fetchReport(id);',
    '  responseCache.set(id, res);         // never deleted',
    '  return res;',
    '}',
  ],
  bad: 4,
};

const CACHE_LRU: Listing = {
  title: 'reports.js · fixed with a size-bounded LRU',
  lines: [
    'const responseCache = new LruCache(100); // evicts the least recently used',
    'async function getReport(id) {',
    '  if (responseCache.has(id)) return responseCache.get(id);',
    '  const res = await fetchReport(id);',
    '  responseCache.set(id, res);',
    '  return res;',
    '}',
  ],
  good: [0],
};

const CACHE_WEAK: Listing = {
  title: 'reports.js · fixed with a WeakMap keyed by the request object',
  lines: [
    'const responseCache = new WeakMap();  // keys must be objects',
    'async function getReport(request) {',
    '  if (responseCache.has(request)) return responseCache.get(request);',
    '  const res = await fetchReport(request);',
    '  responseCache.set(request, res);    // goes when request is unreachable',
    '  return res;',
    '}',
  ],
  good: [0, 4],
};

const INTERVAL: Listing = {
  title: 'chart.js · a timer that outlives its view',
  lines: [
    'function mountChart(root) {',
    "  const el = root.querySelector('.chart');",
    '  setInterval(() => el.refresh(), 1000); // the closure holds el',
    '  return function unmount() {',
    '    root.remove();                    // el is detached but still held',
    '  };',
    '}',
  ],
  bad: 2,
};

const INTERVAL_FIX: Listing = {
  title: 'chart.js · fixed with clearInterval',
  lines: [
    'function mountChart(root) {',
    "  const el = root.querySelector('.chart');",
    '  const timer = setInterval(() => el.refresh(), 1000);',
    '  return function unmount() {',
    '    clearInterval(timer);',
    '    root.remove();',
    '  };',
    '}',
  ],
  good: [2, 4],
};

const ERRORS: Listing = {
  title: 'errors.js · a debugging aid that only grows',
  lines: [
    'window.recentErrors = [];',
    "window.addEventListener('error', (e) => {",
    '  recentErrors.push({ error: e.error, state: captureState() });',
    '});',
  ],
  bad: 2,
};

const ERRORS_FIX: Listing = {
  title: 'errors.js · fixed: keep only the last 50',
  lines: [
    'window.recentErrors = [];',
    "window.addEventListener('error', (e) => {",
    '  recentErrors.push({ error: e.error, state: captureState() });',
    '  if (recentErrors.length > 50) recentErrors.shift();',
    '});',
  ],
  good: [3],
};

const BIG: Listing = {
  title: 'gallery.js · a big cache, bounded on purpose',
  lines: [
    'const imageCache = new LruCache(60);  // 60 decoded thumbnails, ~5 MB each',
    'async function thumbnail(id) {',
    '  if (imageCache.has(id)) return imageCache.get(id);',
    '  const img = await createImageBitmap(await fetchBlob(id));',
    '  imageCache.set(id, img);',
    '  return img;',
    '}',
  ],
};

export function listingFor(leak: LeakId, fix: boolean, cacheFix: CacheFix): Listing {
  switch (leak) {
    case 'listener': return fix ? LISTENER_FIX : LISTENER;
    case 'cache': return !fix ? CACHE : cacheFix === 'weakmap' ? CACHE_WEAK : CACHE_LRU;
    case 'interval': return fix ? INTERVAL_FIX : INTERVAL;
    case 'errors': return fix ? ERRORS_FIX : ERRORS;
    case 'bigCache': return BIG;
  }
}
