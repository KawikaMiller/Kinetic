export interface TextPart {
  text: string;
  code: boolean;
}

/**
 * Split lesson text on `backtick` pairs, the way lesson authors naturally mark code in
 * a summary, tip or quiz line. An unpaired backtick stays literal text. Pure, for testing;
 * components/InlineText renders the parts.
 */
export function splitInlineCode(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let rest = text;
  while (rest.length) {
    const open = rest.indexOf('`');
    const close = open < 0 ? -1 : rest.indexOf('`', open + 1);
    if (open < 0 || close < 0) {
      parts.push({ text: rest, code: false });
      break;
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), code: false });
    if (close > open + 1) parts.push({ text: rest.slice(open + 1, close), code: true });
    rest = rest.slice(close + 1);
  }
  return parts;
}
