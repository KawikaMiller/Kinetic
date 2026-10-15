/**
 * Untyped lambda terms: the type, a hand-written parser with refusals (no eval, no dynamic code),
 * printing that records where each piece of text came from, free variables, Church numerals and
 * the named terms the chips insert.
 */

export type Term =
  | { k: 'v'; name: string }
  | { k: 'l'; param: string; body: Term }
  | { k: 'a'; fn: Term; arg: Term };

/** A node's address from the root: f = the function side of an application, a = its argument, b = an abstraction's body. */
export type Path = string;

export const v = (name: string): Term => ({ k: 'v', name });
export const lam = (param: string, body: Term): Term => ({ k: 'l', param, body });
export const app = (fn: Term, arg: Term): Term => ({ k: 'a', fn, arg });

export const LIMITS = { maxChars: 160, maxDepth: 40, maxNodes: 300, maxNumeral: 20 } as const;

// ---- inspection ----

export function termSize(t: Term): number {
  if (t.k === 'v') return 1;
  if (t.k === 'l') return 1 + termSize(t.body);
  return 1 + termSize(t.fn) + termSize(t.arg);
}

export function freeVars(t: Term): Set<string> {
  if (t.k === 'v') return new Set([t.name]);
  if (t.k === 'a') return new Set([...freeVars(t.fn), ...freeVars(t.arg)]);
  const inner = freeVars(t.body);
  inner.delete(t.param);
  return inner;
}

/** Every variable name that appears anywhere in the term, bound or free. */
export function allNames(t: Term): Set<string> {
  if (t.k === 'v') return new Set([t.name]);
  if (t.k === 'a') return new Set([...allNames(t.fn), ...allNames(t.arg)]);
  return new Set([t.param, ...allNames(t.body)]);
}

export function getAt(t: Term, path: Path): Term {
  let node = t;
  for (const step of path) {
    if (step === 'b' && node.k === 'l') node = node.body;
    else if (step === 'f' && node.k === 'a') node = node.fn;
    else if (step === 'a' && node.k === 'a') node = node.arg;
    else throw new Error(`bad path ${path}`);
  }
  return node;
}

export function replaceAt(t: Term, path: Path, to: Term): Term {
  if (path === '') return to;
  const [step, rest] = [path[0], path.slice(1)];
  if (step === 'b' && t.k === 'l') return lam(t.param, replaceAt(t.body, rest, to));
  if (step === 'f' && t.k === 'a') return app(replaceAt(t.fn, rest, to), t.arg);
  if (step === 'a' && t.k === 'a') return app(t.fn, replaceAt(t.arg, rest, to));
  throw new Error(`bad path ${path}`);
}

// ---- printing ----

export interface Seg {
  text: string;
  /** The node this text belongs to (parentheses belong to the node they wrap). */
  path: Path;
  role: 'binder' | 'var' | 'punct';
}

/** The printed text as pieces that remember their node, so marks and colours can follow the term. */
export function segments(t: Term, path: Path = ''): Seg[] {
  if (t.k === 'v') return [{ text: t.name, path, role: 'var' }];
  if (t.k === 'l') return [{ text: `λ${t.param}.`, path, role: 'binder' }, ...segments(t.body, `${path}b`)];
  const fnParens = t.fn.k === 'l';
  const argParens = t.arg.k !== 'v';
  const wrap = (child: Term, childPath: Path, parens: boolean): Seg[] =>
    parens
      ? [{ text: '(', path: childPath, role: 'punct' }, ...segments(child, childPath), { text: ')', path: childPath, role: 'punct' }]
      : segments(child, childPath);
  return [...wrap(t.fn, `${path}f`, fnParens), { text: ' ', path, role: 'punct' }, ...wrap(t.arg, `${path}a`, argParens)];
}

export const print = (t: Term) => segments(t).map((s) => s.text).join('');

// ---- Church numerals and named terms ----

export function numeral(n: number): Term {
  let body: Term = v('x');
  for (let i = 0; i < n; i++) body = app(v('f'), body);
  return lam('f', lam('x', body));
}

/** The n of `λf.λx.f (f (… x))`, whatever the two names are, or null when the term is not a numeral. */
export function decodeNumeral(t: Term): number | null {
  if (t.k !== 'l' || t.body.k !== 'l') return null;
  const [f, x] = [t.param, t.body.param];
  if (f === x) return null;
  let node = t.body.body;
  let n = 0;
  while (node.k === 'a' && node.fn.k === 'v' && node.fn.name === f) {
    n++;
    node = node.arg;
  }
  return node.k === 'v' && node.name === x ? n : null;
}

/** true and false as Church booleans, recognised up to the names. */
export function decodeBoolean(t: Term): boolean | null {
  if (t.k !== 'l' || t.body.k !== 'l' || t.param === t.body.param) return null;
  const pick = t.body.body;
  if (pick.k !== 'v') return null;
  if (pick.name === t.param) return true;
  return pick.name === t.body.param ? false : null;
}

/** What a normal form reads as, for messages. */
export function describeValue(t: Term): string {
  const n = decodeNumeral(t);
  if (n !== null) return `the numeral ${n}`;
  const b = decodeBoolean(t);
  if (b !== null) return b ? 'true' : 'false';
  return 'neither a numeral nor a Church boolean';
}

export const NAMED_SOURCE = {
  true: 'λt.λf.t',
  false: 'λt.λf.f',
  if: 'λb.λt.λe.b t e',
  and: 'λp.λq.p q p',
  not: 'λb.λt.λf.b f t',
  succ: 'λn.λf.λx.f (n f x)',
  add: 'λm.λn.λf.λx.m f (n f x)',
  mul: 'λm.λn.λf.m (n f)',
  Ω: '(λx.x x) (λx.x x)',
  Y: 'λf.(λx.f (x x)) (λx.f (x x))',
} as const;
export type NamedId = keyof typeof NAMED_SOURCE;

// ---- parsing ----

export type ParseResult = { ok: true; term: Term } | { ok: false; error: string };

type Token =
  | { t: 'lam' | 'dot' | 'open' | 'close'; at: number }
  | { t: 'id'; name: string; at: number }
  | { t: 'num'; n: number; at: number };

class Refusal extends Error {}

function tokenise(text: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) i++;
    else if (ch === '\\' || ch === 'λ') out.push({ t: 'lam', at: i++ });
    else if (ch === '.') out.push({ t: 'dot', at: i++ });
    else if (ch === '(') out.push({ t: 'open', at: i++ });
    else if (ch === ')') out.push({ t: 'close', at: i++ });
    else if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      if (/[A-Za-z]/.test(text[j] ?? '')) throw new Refusal(`A number can't run into a letter at position ${j + 1}; put a space between them.`);
      const n = Number(text.slice(i, j));
      if (n > LIMITS.maxNumeral) throw new Refusal(`The number ${text.slice(i, j)} is too big: numbers stand for Church numerals up to ${LIMITS.maxNumeral}.`);
      out.push({ t: 'num', n, at: i });
      i = j;
    } else if (/[A-Za-z]/.test(ch)) {
      let j = i + 1;
      while (j < text.length && /[0-9]/.test(text[j])) j++;
      if (/[A-Za-z]/.test(text[j] ?? '')) {
        throw new Refusal(`A variable is one letter and optional digits, so "${text.slice(i, j + 1)}…" is not one (position ${i + 1}). Put a space between letters: juxtaposition is application.`);
      }
      out.push({ t: 'id', name: text.slice(i, j), at: i });
      i = j;
    } else {
      throw new Refusal(`Unexpected character "${ch}" at position ${i + 1}.`);
    }
  }
  return out;
}

/** Reads a term; refuses, saying where, instead of guessing. Hand-written, so learner text never reaches eval. */
export function parse(text: string): ParseResult {
  try {
    if (text.length > LIMITS.maxChars) throw new Refusal(`The term is ${text.length} characters; keep it to ${LIMITS.maxChars} or fewer.`);
    const tokens = tokenise(text);
    if (tokens.length === 0) throw new Refusal('Type a term, for example (λx.x) y.');
    let pos = 0;
    const peek = () => tokens[pos];
    const symbol = (tok: Token) => (tok.t === 'close' ? ')' : tok.t === 'dot' ? '.' : tok.t === 'open' ? '(' : 'λ');
    const at = (tok: Token | undefined) => (tok ? `position ${tok.at + 1}` : 'the end');

    const parseTerm = (depth: number): Term => {
      if (depth > LIMITS.maxDepth) throw new Refusal(`The term is nested more than ${LIMITS.maxDepth} levels deep.`);
      return peek()?.t === 'lam' ? parseLambda(depth) : parseApplication(depth);
    };
    const parseLambda = (depth: number): Term => {
      pos++;
      const name = peek();
      if (name?.t !== 'id') throw new Refusal(`Expected a variable name after λ at ${at(name)}.`);
      pos++;
      if (peek()?.t !== 'dot') throw new Refusal(`Expected "." after λ${name.name} at ${at(peek())}.`);
      pos++;
      if (!peek() || peek()?.t === 'close') throw new Refusal(`The body of λ${name.name} is missing at ${at(peek())}.`);
      return lam(name.name, parseTerm(depth + 1));
    };
    const parseAtom = (depth: number): Term => {
      const tok = peek();
      pos++;
      if (tok?.t === 'id') return v(tok.name);
      if (tok?.t === 'num') return numeral(tok.n);
      if (tok?.t === 'open') {
        const inner = parseTerm(depth + 1);
        if (peek()?.t !== 'close') throw new Refusal(`Missing ")" to match the "(" at position ${tok.at + 1}.`);
        pos++;
        return inner;
      }
      throw new Refusal(tok ? `Unexpected "${symbol(tok)}" at ${at(tok)}.` : 'The term ends too soon: something is missing at the end.');
    };
    const parseApplication = (depth: number): Term => {
      const parts: Term[] = [parseAtom(depth)];
      for (;;) {
        const next = peek();
        if (next?.t === 'id' || next?.t === 'num' || next?.t === 'open') parts.push(parseAtom(depth));
        else if (next?.t === 'lam') {
          parts.push(parseLambda(depth));
          break;
        } else break;
      }
      return parts.reduce(app);
    };

    const term = parseTerm(0);
    if (pos < tokens.length) throw new Refusal(`Unexpected "${symbol(tokens[pos])}" at position ${tokens[pos].at + 1}.` + (tokens[pos].t === 'close' ? ' There is no "(" for it.' : ''));
    const size = termSize(term);
    if (size > LIMITS.maxNodes) throw new Refusal(`The term has ${size} nodes; keep it to ${LIMITS.maxNodes} or fewer.`);
    return { ok: true, term };
  } catch (e) {
    if (e instanceof Refusal) return { ok: false, error: e.message };
    throw e;
  }
}

/** The named term as a Term; the sources above are fixed lesson text. */
export function named(id: NamedId): Term {
  const r = parse(NAMED_SOURCE[id]);
  if (!r.ok) throw new Error(`${id}: ${r.error}`);
  return r.term;
}
