/**
 * The eight snippets of the classification board, with the ISO C category each belongs to and the reason shown on
 * reveal. Clause numbers are quoted from memory (C11/C17) and chipped as such on screen; C++ differs in places.
 */
export type Category = 'defined' | 'implementation-defined' | 'unspecified' | 'undefined';

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'defined', label: 'Defined' },
  { id: 'implementation-defined', label: 'Implementation-defined' },
  { id: 'unspecified', label: 'Unspecified' },
  { id: 'undefined', label: 'Undefined' },
];

export interface Snippet {
  id: string;
  code: string;
  category: Category;
  reason: string;
}

export const SNIPPETS: readonly Snippet[] = [
  { id: 'int-max-plus-one', code: 'INT_MAX + 1', category: 'undefined', reason: 'Signed overflow: the result is not representable in int, and the standard gives that no meaning (C11 6.5 paragraph 5).' },
  { id: 'uint-max-plus-one', code: 'UINT_MAX + 1u', category: 'defined', reason: 'Unsigned arithmetic wraps modulo two to the power of the width, so the result is defined: 0 (C11 6.2.5 paragraph 9).' },
  { id: 'char-200', code: 'char c = 200;  /* plain char is signed */', category: 'implementation-defined', reason: '200 does not fit a signed char; the conversion result is implementation-defined (or raises an implementation-defined signal), and each compiler must document it (C11 6.3.1.3 paragraph 3).' },
  { id: 'eval-order', code: 'f(a(), b())', category: 'unspecified', reason: 'The order in which the arguments are evaluated is unspecified: either call may run first, and the program is still valid (C11 6.5.2.2 paragraph 10).' },
  { id: 'null-deref', code: 'int v = *p;  /* p is null */', category: 'undefined', reason: 'Dereferencing a null pointer is undefined: the standard promises nothing about the execution (C11 6.5.3.2 paragraph 4).' },
  { id: 'shift-negative', code: 'x >> 1  /* x is a negative int */', category: 'implementation-defined', reason: 'Right-shifting a negative signed value is implementation-defined (arithmetic or logical shift): the compiler documents which (C11 6.5.7 paragraph 5).' },
  { id: 'shift-width', code: '1 << 32  /* 32-bit int */', category: 'undefined', reason: 'Shifting by the width of the type or more is undefined (C11 6.5.7 paragraph 3).' },
  { id: 'min-div-minus-one', code: 'INT_MIN / -1', category: 'undefined', reason: 'The quotient is not representable in int, so the division is undefined. It is shown here and never run (C11 6.5.5 paragraph 6).' },
];

export const KEY: Record<string, Category> = Object.fromEntries(SNIPPETS.map((s) => [s.id, s.category]));

/** The score of a set of answers: how many items sit in their key bin. Unsorted items count as wrong. */
export function score(items: readonly { id: string }[], answerKey: Record<string, string>, assigned: Record<string, string | null>): number {
  return items.filter((i) => assigned[i.id] === answerKey[i.id]).length;
}
