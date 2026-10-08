// A small model of how a browser's HTML parser reads text it is handed: where tags start and which
// character references it decodes. It only covers what this lesson's four templates need (tags, end
// tags, "bogus comments" and the common character references), nothing is ever put into the real
// page, and it is a model, not the real parser.

/** A piece of text the browser read as markup: [from, to) in the string it was given. */
export interface TagToken {
  from: number;
  to: number;
  name: string;
  end: boolean;
}

const isAlpha = (c: string | undefined) => c !== undefined && /[A-Za-z]/.test(c);
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/** Decode the character references this model knows: `&amp; &lt; &gt; &quot; &apos;`, `&#39;`, `&#x27;`. */
export function decodeReferences(s: string): string {
  return s.replace(/&(?:([a-z]+)|#([0-9]{1,7})|#[xX]([0-9a-fA-F]{1,6}));/g, (whole, name?: string, dec?: string, hex?: string) => {
    if (name !== undefined) return name in NAMED ? NAMED[name] : whole;
    const cp = dec !== undefined ? Number(dec) : parseInt(hex ?? '', 16);
    return cp >= 0x20 && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff) && !(cp >= 0x7f && cp <= 0x9f) ? String.fromCodePoint(cp) : whole;
  });
}

/**
 * Split markup into the text a person sees and the tags the browser took as markup. `<` starts a
 * tag only when a letter follows (or `/` and a letter); `<!` and `<?` start a "bogus comment" that
 * runs to the next `>`. A tag cut off by the end of the input is dropped (it swallows the rest).
 */
export function readMarkup(markup: string): { text: string; tags: TagToken[] } {
  const tags: TagToken[] = [];
  let text = '';
  let i = 0;
  while (i < markup.length) {
    const c = markup[i];
    const next = markup[i + 1];
    // `</` followed by anything but a letter is a bogus comment too (`</>` vanishes); `</` at the very end is text.
    const isTag = c === '<' && (isAlpha(next) || (next === '/' && i + 2 < markup.length) || next === '!' || next === '?');
    if (!isTag) {
      text += c;
      i++;
      continue;
    }
    const close = markup.indexOf('>', i + 1);
    const to = close < 0 ? markup.length : close + 1;
    const end = next === '/';
    const name = /^<\/?([A-Za-z][^\s/>]*)/.exec(markup.slice(i, to))?.[1]?.toLowerCase() ?? '';
    tags.push({ from: i, to, name, end });
    i = to;
  }
  return { text: decodeReferences(text), tags };
}
