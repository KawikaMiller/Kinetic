import { Fragment } from 'react';
import { splitInlineCode } from '../core/inlineCode';

/**
 * Lesson text (summary, tips, key ideas, quiz) with `backtick` spans shown as inline code,
 * so authors can write "relies on `x | 0`" instead of the backticks showing literally.
 */
export function InlineText({ text }: { text: string }) {
  return (
    <>
      {splitInlineCode(text).map((part, i) =>
        part.code ? (
          <code key={i} className="inline-code">
            {part.text}
          </code>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
