// A small SQL tokenizer and a simulated "users" table, to show what the database receives when
// a name is pasted into the query text versus sent separately as a parameter. Nothing runs SQL.

export type SqlKind = 'keyword' | 'ident' | 'string' | 'number' | 'param' | 'punct' | 'comment' | 'unterminated';

export interface SqlToken {
  kind: SqlKind;
  text: string;
  start: number;
  end: number;
}

const KEYWORDS = new Set(['SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'ORDER', 'BY', 'LIMIT', 'INSERT', 'INTO', 'VALUES']);
const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_]/.test(c);
const isDigit = (c: string) => c >= '0' && c <= '9';

/**
 * Split SQL text into tokens the way a database's lexer would, for the handful of constructs the
 * lesson needs: single-quoted strings (with '' as an escaped quote), words, numbers, `?`
 * placeholders, `--` comments and single-character punctuation. Whitespace is dropped.
 */
export function tokenizeSql(sql: string): SqlToken[] {
  const out: SqlToken[] = [];
  let i = 0;
  const push = (kind: SqlKind, start: number) => out.push({ kind, text: sql.slice(start, i), start, end: i });
  while (i < sql.length) {
    const c = sql[i];
    const start = i;
    if (isSpace(c)) {
      i++;
    } else if (c === "'") {
      i++;
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            i += 2;
            continue;
          }
          i++;
          closed = true;
          break;
        }
        i++;
      }
      push(closed ? 'string' : 'unterminated', start);
    } else if (c === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      push('comment', start);
    } else if (isIdentStart(c)) {
      while (i < sql.length && isIdentPart(sql[i])) i++;
      push(KEYWORDS.has(sql.slice(start, i).toUpperCase()) ? 'keyword' : 'ident', start);
    } else if (isDigit(c)) {
      while (i < sql.length && isDigit(sql[i])) i++;
      push('number', start);
    } else {
      i++;
      push(c === '?' ? 'param' : 'punct', start);
    }
  }
  return out;
}

/** A query's structure: the token kinds in order, with a string's contents left out. */
export const shapeOf = (tokens: SqlToken[]) => tokens.map((t) => (t.kind === 'punct' || t.kind === 'keyword' ? t.text.toUpperCase() : t.kind));

/** The value inside a complete string literal: 'O''Brien' → O'Brien. */
export const unquote = (literal: string) => literal.slice(1, -1).replaceAll("''", "'");

const BEFORE = "SELECT * FROM users WHERE surname = '";
const AFTER = "'";
export const CONCAT_CODE = `const sql = "${BEFORE}" + name + "${AFTER}";`;
export const PARAM_SQL = 'SELECT * FROM users WHERE surname = ?';
export const PARAM_CODE = `db.query("${PARAM_SQL}", [name]);`;

/** The structure every search is meant to have, taken from an ordinary surname. */
export const INTENDED_SHAPE = shapeOf(tokenizeSql(`${BEFORE}Smith${AFTER}`));

export interface User {
  id: number;
  first: string;
  surname: string;
}

export const USERS: User[] = [
  { id: 1, first: 'Ada', surname: 'Smith' },
  { id: 2, first: 'Siobhán', surname: "O'Brien" },
  { id: 3, first: 'Kenji', surname: 'Nakamura' },
  { id: 4, first: 'Lucía', surname: 'García' },
  { id: 5, first: 'Grace', surname: 'Smith' },
];

/** The simulated table lookup: an exact, case-sensitive match on surname, like `=` on a text column. */
export const findBySurname = (surname: string) => USERS.filter((u) => u.surname === surname);

/** What each character of the pasted name ended up as in the concatenated query. */
export type CharRole = 'data' | 'code';

export type Outcome =
  | { kind: 'rows'; rows: User[] }
  | { kind: 'syntax-error'; message: string }
  | { kind: 'changed'; message: string };

export interface ConcatResult {
  sql: string;
  tokens: SqlToken[];
  /** Role of each character of the name, in order. */
  roles: CharRole[];
  dataStart: number;
  structureChanged: boolean;
  outcome: Outcome;
}

const sameShape = (a: string[], b: string[]) => a.length === b.length && a.every((k, i) => k === b[i]);

/** Build the search by pasting the name into the SQL text, then see what the database gets. */
export function concatenated(name: string): ConcatResult {
  const sql = BEFORE + name + AFTER;
  const tokens = tokenizeSql(sql);
  const dataStart = BEFORE.length;
  const inString = (pos: number) => tokens.some((t) => t.kind === 'string' && pos > t.start && pos < t.end - 1);
  const roles: CharRole[] = [...name].map((_, k) => (inString(dataStart + k) ? 'data' : 'code'));
  const structureChanged = !sameShape(shapeOf(tokens), INTENDED_SHAPE);
  let outcome: Outcome;
  if (tokens.some((t) => t.kind === 'unterminated')) {
    outcome = { kind: 'syntax-error', message: 'syntax error: unterminated quoted string' };
  } else if (structureChanged) {
    outcome = { kind: 'changed', message: "the query no longer has the structure you wrote" };
  } else {
    outcome = { kind: 'rows', rows: findBySurname(unquote(tokens[tokens.length - 1].text)) };
  }
  return { sql, tokens, roles, dataStart, structureChanged, outcome };
}

export interface ParamResult {
  sql: string;
  tokens: SqlToken[];
  params: string[];
  outcome: Outcome;
}

/** Send the query text and the name separately: the text never changes, whatever the name is. */
export function parameterised(name: string): ParamResult {
  const tokens = tokenizeSql(PARAM_SQL);
  return { sql: PARAM_SQL, tokens, params: [name], outcome: { kind: 'rows', rows: findBySurname(name) } };
}

export const PARAM_SHAPE = shapeOf(tokenizeSql(PARAM_SQL));
