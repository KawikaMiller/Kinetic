import { isValidElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/**
 * The plain text a caption (or any ReactNode) renders to, for test assertions:
 * markup stripped and the common HTML entities decoded. Test-only: it pulls in
 * react-dom/server, so don't import it from app code.
 */
export function captionText(node: ReactNode): string {
  if (!isValidElement(node)) return String(node ?? '');
  return renderToStaticMarkup(node)
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|nbsp|#x27|#39);/g, (e) => ENTITIES[e]);
}
