import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CODE_PLACEHOLDER, gluedSentences } from './glue';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Inline code elements, whose contents are blanked before the glued-sentence check. */
const INLINE_CODE = /<(code|kbd|samp)\b[^>]*>[\s\S]*?<\/\1>/g;

const plain = (markup: string) =>
  markup.replace(/<[^>]+>/g, '').replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (e) => ENTITIES[e]);

export interface CaptionTextOptions {
  /**
   * Throw if the text has a glued sentence ("port.60 s": a JSX line break after `{…}` swallowed
   * the space; see ./glue). Inline `<code>`, `<kbd>` and `<samp>` contents are ignored for the check.
   */
  strict?: boolean;
}

/**
 * The plain text a caption (or any ReactNode) renders to, for test assertions:
 * markup stripped and the common HTML entities decoded. Test-only: it pulls in
 * react-dom/server, so don't import it from app code.
 */
export function captionText(node: ReactNode, opts: CaptionTextOptions = {}): string {
  const markup = isValidElement(node) ? renderToStaticMarkup(node) : null;
  const text = markup === null ? String(node ?? '') : plain(markup);
  if (opts.strict) {
    const glued = gluedSentences(markup === null ? text : plain(markup.replace(INLINE_CODE, CODE_PLACEHOLDER)));
    if (glued.length) throw new Error(`Glued sentence in caption (missing space): ${glued.map((g) => `"${g}"`).join(', ')}\n  in: ${text}`);
  }
  return text;
}

/** `captionText(node, { strict: true })`: the caption's text, failing the test on a glued sentence. */
export const expectCaption = (node: ReactNode): string => captionText(node, { strict: true });
