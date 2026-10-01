// A small model of how a browser reads markup, to show what a comment looks like when it's pasted
// into HTML versus set as text. The lesson renders these runs as React elements; user input never
// reaches the real page as HTML.

/** A piece of visible text and the formatting it was given. */
export interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  mono: boolean;
}

export interface Rendered {
  runs: Run[];
  /** Tags the browser read as markup (so they don't appear as text), with where each starts. */
  swallowed: { text: string; start: number }[];
}

const FORMATTING: Record<string, keyof Omit<Run, 'text'>> = {
  b: 'bold', strong: 'bold', i: 'italic', em: 'italic', code: 'mono',
};
const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const isAlpha = (c: string | undefined) => c !== undefined && /[A-Za-z]/.test(c);
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\f';

/**
 * Read a tag starting at `<` (index i), following the HTML tokenizer's rules for tag names and
 * attributes: quotes only matter after `=`, and a tag cut off by the end of the input produces
 * nothing at all. Returns the tag name (lowercase), whether it's an end tag, and where it ends.
 */
function readTag(s: string, i: number): { name: string; end: boolean; next: number } | null {
  let j = i + 1;
  const end = s[j] === '/';
  if (end) j++;
  const nameStart = j;
  while (j < s.length && !isSpace(s[j]) && s[j] !== '/' && s[j] !== '>') j++;
  const name = s.slice(nameStart, j).toLowerCase();
  while (j < s.length && s[j] !== '>') {
    if (s[j] === '=') {
      j++;
      while (j < s.length && isSpace(s[j])) j++;
      const q = s[j];
      if (q === '"' || q === "'") {
        const close = s.indexOf(q, j + 1);
        if (close < 0) return null;
        j = close + 1;
        continue;
      }
    }
    j++;
  }
  if (j >= s.length) return null;
  return { name, end, next: j + 1 };
}

/**
 * If a comment starts at `<` (index i), where it ends (exclusive); -1 if this `<` isn't one.
 * `<!--` runs to `-->`; `<!`, `<?` and `</` + non-letter are "bogus comments" up to the next `>`
 * (`</>` included). A comment cut off by the end of the input runs to the end.
 */
function commentEnd(s: string, i: number): number {
  const next = s[i + 1];
  const to = (close: string, from: number) => {
    const at = s.indexOf(close, from);
    return at < 0 ? s.length : at + close.length;
  };
  if (s.startsWith('<!--', i)) {
    // an empty comment's opening dashes can double as its closing ones: <!--> and <!--->
    if (s[i + 4] === '>') return i + 5;
    if (s.startsWith('->', i + 4)) return i + 6;
    return to('-->', i + 4);
  }
  if (next === '!' || next === '?') return to('>', i + 2);
  if (next === '/' && i + 2 < s.length && !isAlpha(s[i + 2])) return to('>', i + 2);
  return -1;
}

/** Code points a numeric reference may stand for here: printable, not C1 controls or surrogates. */
const decodable = (cp: number) => cp >= 0x20 && !(cp >= 0x7f && cp <= 0x9f) && !(cp >= 0xd800 && cp <= 0xdfff) && cp <= 0x10ffff;

/**
 * Read `&name;` for the handful of named entities the lesson uses, or a numeric `&#39;` /
 * `&#x27;`; anything else is a literal `&`.
 */
function readEntity(s: string, i: number): { text: string; next: number } | null {
  const rest = s.slice(i, i + 12);
  const named = /^&([a-z]+);/.exec(rest);
  if (named && named[1] in ENTITIES) return { text: ENTITIES[named[1]], next: i + named[0].length };
  const num = /^&#(?:([0-9]{1,7})|[xX]([0-9a-fA-F]{1,6}));/.exec(rest);
  if (!num) return null;
  const cp = num[1] !== undefined ? Number(num[1]) : parseInt(num[2], 16);
  return decodable(cp) ? { text: String.fromCodePoint(cp), next: i + num[0].length } : null;
}

/**
 * What a browser shows for this markup. `<` starts a tag only when a letter follows (or `/` then a
 * letter), which is why "I <3 it" survives by luck while "a<b and b>c" loses its middle.
 */
export function renderHtml(markup: string): Rendered {
  const runs: Run[] = [];
  const swallowed: Rendered['swallowed'] = [];
  const open = { bold: 0, italic: 0, mono: 0 };
  let text = '';
  const flush = () => {
    if (!text) return;
    runs.push({ text, bold: open.bold > 0, italic: open.italic > 0, mono: open.mono > 0 });
    text = '';
  };
  let i = 0;
  while (i < markup.length) {
    const c = markup[i];
    const comment = c === '<' ? commentEnd(markup, i) : -1;
    if (comment >= 0) {
      // <!--…-->, <!…>, <?…> and </ followed by a non-letter are comments: never shown
      flush();
      swallowed.push({ text: markup.slice(i, comment), start: i });
      i = comment;
    } else if (c === '<' && (isAlpha(markup[i + 1]) || (markup[i + 1] === '/' && isAlpha(markup[i + 2])))) {
      const tag = readTag(markup, i);
      if (!tag) break; // cut off by the end of the input: the browser drops it
      flush();
      swallowed.push({ text: markup.slice(i, tag.next), start: i });
      const style = FORMATTING[tag.name];
      if (style) open[style] = Math.max(0, open[style] + (tag.end ? -1 : 1));
      i = tag.next;
    } else if (c === '&') {
      const ent = readEntity(markup, i);
      text += ent ? ent.text : '&';
      i = ent ? ent.next : i + 1;
    } else {
      text += c;
      i++;
    }
  }
  flush();
  return { runs, swallowed };
}

/** The text a browser would show (what `textContent` reads back). */
export const visibleText = (markup: string) => renderHtml(markup).runs.map((r) => r.text).join('');

/** Encode text so it's shown exactly as typed inside HTML (element content and quoted attributes). */
export const escapeHtml = (s: string) =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

/** Undo `escapeHtml` (the inverse, for tests and for the "what people see" pane). */
export const unescapeHtml = (s: string) =>
  s.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&gt;', '>').replaceAll('&lt;', '<').replaceAll('&amp;', '&');

export const pasteIntoMarkup = (comment: string) => `<p>${comment}</p>`;
