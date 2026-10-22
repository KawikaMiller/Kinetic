// The page side of the sweep: finds a lesson's controls, drives them and reads back what the page shows.
// `installSweepHelpers` runs INSIDE the browser (it is serialised into the page), so it is self-contained: no
// imports, no outer variables. Everything else here is the Node-side wrapper, `createPageApi`.
import { retryOnce } from '../retry.mjs';

/** How long one call into the page may take before the page counts as hung (an infinite loop in a lesson). */
export const CALL_TIMEOUT_MS = 20_000;

export function installSweepHelpers() {
  const SKIP = '.quiz, .lesson-side, .topbar, a, nav';
  const rootEl = () => document.querySelector('.lesson-main') ?? document.body;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const usable = (el) => !el.closest(SKIP) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && visible(el);
  const words = (s) => s.replace(/\s+/g, ' ').trim();
  const nameOf = (el) => words(el.textContent || el.getAttribute('aria-label') || el.title || el.tagName).slice(0, 40);
  const sliderName = (r) => words(r.closest('label')?.querySelector('.slider-label')?.textContent ?? r.getAttribute('aria-label') ?? 'range').slice(0, 30);

  /** The scene picker's radiogroup: the one labelled "Scene", else the group at `fallback` (see lib/scenes.mjs). */
  const pickerGroup = (fallback) => {
    if (fallback < 0) return null;
    const groups = [...document.querySelectorAll('.stage-frame .segmented')];
    return groups.find((g) => (g.getAttribute('aria-label') ?? '').trim().toLowerCase() === 'scene') ?? groups[fallback] ?? null;
  };

  /** Every control of each kind, in DOM order. Index into these lists is a control's identity. */
  const lists = (fallback) => {
    const root = rootEl();
    const picker = pickerGroup(fallback);
    const q = (sel) => [...root.querySelectorAll(sel)].filter(usable);
    return {
      seg: [...root.querySelectorAll('.segmented [role=radio]')].filter((b) => usable(b) && !picker?.contains(b)),
      slider: q('input[type=range]').filter((r) => !r.classList.contains('scrub')),
      text: q('input:not([type]), input[type=text], input[type=number], input[type=search], textarea'),
      select: q('select'),
      checkbox: q('input[type=checkbox]'),
      summary: q('summary'),
      btn: q('button:not([role=radio]):not(.tbtn), [role=tab], [role=button]').filter((b, i, all) => all.indexOf(b) === i),
    };
  };
  const target = (kind, index, fallback) => lists(fallback)[kind]?.[index] ?? null;

  const describe = (kind, el, index) => {
    const base = { kind, index };
    if (kind === 'seg') return { ...base, label: `${words(el.closest('.segmented')?.getAttribute('aria-label') ?? '')}: ${nameOf(el)}`, on: el.getAttribute('aria-checked') === 'true' };
    if (kind === 'slider') return { ...base, label: `slider ${sliderName(el)}`, min: Number(el.min || 0), max: Number(el.max || 100), step: Number(el.step) > 0 ? Number(el.step) : 1 };
    if (kind === 'select') return { ...base, label: `select ${nameOf(el.labels?.[0] ?? el)}`, options: [...el.options].map((o) => o.value) };
    if (kind === 'text') return { ...base, label: `field ${words(el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? el.placeholder ?? el.type).slice(0, 30)}` };
    if (kind === 'checkbox') return { ...base, label: `checkbox ${nameOf(el.labels?.[0] ?? el)}` };
    return { ...base, label: `${kind === 'btn' ? 'button' : kind} ${nameOf(el)}` };
  };

  const nativeSet = (el, value) => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  };
  const fire = (el, ...types) => types.forEach((t) => el.dispatchEvent(new Event(t, { bubbles: true })));

  const focusInfo = () => {
    const a = document.activeElement;
    const gone = !a || a === document.body || a === document.documentElement || !a.isConnected;
    const hidden = !gone && (a.disabled || (a.checkVisibility && !a.checkVisibility()));
    return { dropped: gone || hidden, where: gone ? 'body' : `${a.tagName.toLowerCase()} "${nameOf(a)}"${hidden ? ' (disabled or hidden)' : ''}` };
  };

  /** Visible text, SVG text, titles and aria-labels: what a learner could read. `data-sci` subtrees are exempt. */
  const readableText = () => {
    const parts = [];
    const walker = document.createTreeWalker(rootEl(), NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement;
      if (!el || el.closest('script, style, [data-sci]') || (el.checkVisibility && !el.checkVisibility())) continue;
      parts.push(n.textContent);
    }
    rootEl().querySelectorAll('[title], [aria-label]').forEach((el) => {
      if (!el.closest('[data-sci]')) parts.push(el.getAttribute('title') ?? '', el.getAttribute('aria-label') ?? '');
    });
    return parts.join(' ');
  };

  const crashText = () => {
    const panel = document.querySelector('.crash-panel');
    return panel ? words(panel.textContent).slice(0, 200) : null;
  };

  const captionInfo = (placeholder) => {
    const all = document.querySelectorAll('.caption-text');
    const el = all[all.length - 1];
    const copy = el?.cloneNode(true);
    copy?.querySelectorAll('code, kbd, samp').forEach((c) => {
      c.textContent = placeholder;
    });
    return { text: words(el?.textContent ?? ''), prose: copy?.textContent ?? '' };
  };

  const playerInfo = () => {
    const play = document.querySelector('.tbtn-play');
    if (!play) return null;
    const forward = document.querySelector('.tbtn[title^="Step forward"]');
    return {
      playing: (play.title ?? '').startsWith('Pause'),
      counter: document.querySelector('.tcount')?.textContent ?? '',
      atEnd: forward?.getAttribute('aria-disabled') === 'true',
    };
  };

  /** Text and graphics under `minPx` rendered size, in the stage (SVG text is scaled by its drawing's own transform). */
  const smallText = (minPx) => {
    const found = [];
    document.querySelectorAll('.stage-frame .stage svg text').forEach((t) => {
      const ctm = t.ownerSVGElement?.getScreenCTM();
      if (!ctm || !t.textContent.trim() || !t.getBoundingClientRect().width) return;
      const px = parseFloat(getComputedStyle(t).fontSize) * Math.hypot(ctm.a, ctm.b);
      if (px < minPx) found.push({ px: Math.round(px * 10) / 10, text: words(t.textContent).slice(0, 24) });
    });
    document.querySelectorAll('.stage-frame *:not(svg *)').forEach((el) => {
      const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
      if (!own || el.closest('.sr-only') || !visible(el)) return;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < minPx) found.push({ px, text: words(el.textContent).slice(0, 24) });
    });
    return found.sort((a, b) => a.px - b.px).slice(0, 3);
  };

  window.__sweep = {
    enumerate: (fallback) => {
      const all = lists(fallback);
      return Object.entries(all).flatMap(([kind, els]) => els.map((el, index) => describe(kind, el, index)));
    },
    /** Focus the control and say whether it took focus (a non-focusable target cannot drop it). */
    prepare: ({ kind, index }, fallback) => {
      const el = target(kind, index, fallback);
      if (!el) return { ok: false, focused: false };
      el.focus();
      return { ok: true, focused: document.activeElement === el };
    },
    click: ({ kind, index }, fallback) => {
      const el = target(kind, index, fallback);
      el?.click();
      return Boolean(el);
    },
    set: ({ kind, index }, fallback, value) => {
      const el = target(kind, index, fallback);
      if (!el) return false;
      nativeSet(el, String(value));
      fire(el, 'input', 'change');
      return true;
    },
    select: ({ kind, index }, fallback, value) => {
      const el = target(kind, index, fallback);
      if (!el) return false;
      el.value = value;
      fire(el, 'change');
      return true;
    },
    focusInfo,
    /** One round trip after an action: focus, crash panel, readable text, caption, player. */
    observe: (placeholder) => ({
      focus: focusInfo(),
      crash: crashText(),
      text: readableText(),
      caption: captionInfo(placeholder),
      player: playerInfo(),
    }),
    smallText,
    overflowX: () => document.documentElement.scrollWidth > window.innerWidth,
    clickPlayer: (titlePrefix) => {
      const el = [...document.querySelectorAll('.tbtn')].find((b) => (b.title ?? '').startsWith(titlePrefix));
      el?.click();
      return Boolean(el);
    },
  };
}

/** Node-side handle on the page helpers: installs them on demand (a reload drops them) and bounds every call. */
export function createPageApi(page, timeoutMs = CALL_TIMEOUT_MS) {
  const source = `(${installSweepHelpers.toString()})()`;
  const run = (name, args) => page.evaluate((n, a) => (window.__sweep ? window.__sweep[n](...a) : '__sweep-missing__'), name, args);
  const withTimeout = (promise) => {
    let timer;
    const hung = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`page unresponsive (no answer in ${timeoutMs / 1000} s)`)), timeoutMs);
    });
    return Promise.race([promise, hung]).finally(() => clearTimeout(timer));
  };

  async function call(name, ...args) {
    const attempt = async () => {
      let result = await run(name, args);
      if (result === '__sweep-missing__') {
        await page.evaluate(source);
        result = await run(name, args);
      }
      return result;
    };
    return withTimeout(retryOnce(attempt, `page call ${name}`));
  }
  return { call };
}
