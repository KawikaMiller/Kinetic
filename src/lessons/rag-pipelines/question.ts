/** A typed question: capped at 120 characters, no control characters, never empty. */
import type { FieldParse } from '../../core/parse';
import { MAX_QUESTION_CHARS } from './settings';

export function parseQuestion(text: string): FieldParse<string> {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Type a question first: an empty one retrieves nothing.' };
  if ([...text].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)) return { ok: false, error: 'Control characters are not allowed in a question.' };
  if (trimmed.length > MAX_QUESTION_CHARS) return { ok: false, error: `Keep the question to ${MAX_QUESTION_CHARS} characters or fewer (it has ${trimmed.length}).` };
  return { ok: true, value: trimmed };
}
