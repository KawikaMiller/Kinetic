/**
 * The calc tool: a hand-written evaluator for numbers, + - * / and parentheses (unary minus too).
 * Anything else is refused. Nothing is evaluated with eval or new Function.
 */
export type CalcResult = { ok: true; value: number } | { ok: false; error: string };

type Token = { t: 'num'; v: number } | { t: 'op'; v: '+' | '-' | '*' | '/' | '(' | ')' };

const MAX_LENGTH = 80;

function tokenise(src: string): Token[] | string {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') {
      i++;
    } else if ('+-*/()'.includes(c)) {
      tokens.push({ t: 'op', v: c as '+' });
      i++;
    } else if ((c >= '0' && c <= '9') || c === '.') {
      let j = i;
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++;
      const text = src.slice(i, j);
      if (!/^(\d+\.?\d*|\.\d+)$/.test(text)) return `malformed number "${text}"`;
      tokens.push({ t: 'num', v: Number(text) });
      i = j;
    } else {
      return `"${c}" is outside the grammar (numbers, + - * / and parentheses)`;
    }
  }
  return tokens;
}

export function calc(src: string): CalcResult {
  if (src.length > MAX_LENGTH) return { ok: false, error: `expression longer than ${MAX_LENGTH} characters` };
  const tokens = tokenise(src);
  if (typeof tokens === 'string') return { ok: false, error: tokens };
  if (tokens.length === 0) return { ok: false, error: 'empty expression' };
  let pos = 0;
  const fail = (error: string): never => {
    throw new Error(error);
  };
  const peek = () => tokens[pos];
  const isOp = (v: string) => peek()?.t === 'op' && (peek() as { v: string }).v === v;

  // expr := term (('+' | '-') term)* ; term := factor (('*' | '/') factor)* ; factor := '-' factor | number | '(' expr ')'
  const expr = (): number => {
    let value = term();
    while (isOp('+') || isOp('-')) {
      const op = (tokens[pos++] as { v: string }).v;
      const rhs = term();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  };
  const term = (): number => {
    let value = factor();
    while (isOp('*') || isOp('/')) {
      const op = (tokens[pos++] as { v: string }).v;
      const rhs = factor();
      if (op === '/' && rhs === 0) fail('division by zero');
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  };
  const factor = (): number => {
    const tok = peek();
    if (!tok) return fail('the expression ends where a number was expected');
    if (tok.t === 'num') {
      pos++;
      return tok.v;
    }
    if (tok.v === '-') {
      pos++;
      return -factor();
    }
    if (tok.v === '(') {
      pos++;
      const inner = expr();
      if (!isOp(')')) return fail('a parenthesis is not closed');
      pos++;
      return inner;
    }
    return fail(`unexpected "${tok.v}"`);
  };

  try {
    const value = expr();
    if (pos < tokens.length) return { ok: false, error: `unexpected "${(tokens[pos] as { v: unknown }).v}"` };
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
