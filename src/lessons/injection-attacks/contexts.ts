// The same mistake in five places: text pasted into something that gets interpreted.
// Each context shows what happens to one piece of text pasted in raw, and kept separate.

import { escapeHtml, visibleText } from './html';
import { describeShellPaste } from './shell';
import { concatenated } from './sql';

export type ContextId = 'sql' | 'html' | 'shell' | 'url' | 'log';

export interface ContextView {
  id: ContextId;
  name: string;
  /** How the text is pasted in, and what that produces. */
  raw: { code: string; result: string[]; broken: boolean };
  /** How it's kept separate (or encoded for this context), and what that produces. */
  safe: { code: string; result: string[] };
  fix: string;
}

/** The query parameters a server reads back from a URL (keys quoted too, so stray spaces show). */
export const readParams = (url: string) =>
  [...new URL(url).searchParams].map(([k, v]) => `${JSON.stringify(k)} = ${JSON.stringify(v)}`);

/** A log line as a list of the lines it actually produces. */
export const logLines = (line: string) => line.split('\n');

/** Escape line breaks so one entry can never become two. */
export const escapeLogValue = (s: string) => s.replaceAll('\\', '\\\\').replaceAll('\r', '\\r').replaceAll('\n', '\\n');

const SHOP = 'https://shop.example/search?q=';

export function contextViews(text: string): ContextView[] {
  const sql = concatenated(text);
  const shellRaw = describeShellPaste(text);
  const urlRaw = readParams(SHOP + text);
  const urlSafe = readParams(SHOP + encodeURIComponent(text));
  const logRaw = logLines(`login ok user=${text}`);
  return [
    {
      id: 'sql',
      name: 'SQL query',
      raw: {
        code: `"… surname = '" + text + "'"`,
        result: [sql.outcome.kind === 'rows' ? `runs as written (${sql.outcome.rows.length} rows)` : sql.outcome.message],
        broken: sql.outcome.kind !== 'rows',
      },
      safe: { code: 'db.query("… surname = ?", [text])', result: ['same query every time; text travels as a value'] },
      fix: 'Parameters (placeholders)',
    },
    {
      id: 'html',
      name: 'HTML page',
      raw: { code: 'el.innerHTML = text', result: [`people see: ${JSON.stringify(visibleText(text))}`], broken: visibleText(text) !== text },
      safe: { code: 'el.textContent = text', result: [`people see: ${JSON.stringify(visibleText(escapeHtml(text)))}`] },
      fix: 'Set text, or encode for HTML',
    },
    {
      id: 'shell',
      name: 'Shell command',
      raw: { code: 'exec("open " + text)', result: shellRaw.lines, broken: shellRaw.broken },
      safe: { code: 'execFile("open", [text])', result: [`arguments: ${JSON.stringify([text])}`] },
      fix: 'An argument list, no shell',
    },
    {
      id: 'url',
      name: 'URL',
      raw: { code: '"…/search?q=" + text', result: urlRaw.length ? urlRaw : ['(no parameters)'], broken: urlRaw.length !== 1 || urlRaw[0] !== urlSafe[0] },
      safe: { code: '"…/search?q=" + encodeURIComponent(text)', result: urlSafe },
      fix: 'encodeURIComponent for each value',
    },
    {
      id: 'log',
      name: 'Log file',
      raw: { code: 'log("login ok user=" + text)', result: logRaw, broken: logRaw.length > 1 },
      safe: { code: 'log("login ok user=" + escape(text))', result: logLines(`login ok user=${escapeLogValue(text)}`) },
      fix: 'Escape line breaks (or log structured fields)',
    },
  ];
}

/** Things like a sort column can't be a parameter, so check them against a fixed list instead. */
export const SORT_COLUMNS = ['surname', 'first', 'created_at'] as const;
export const allowedSort = (column: string) => (SORT_COLUMNS as readonly string[]).includes(column);
