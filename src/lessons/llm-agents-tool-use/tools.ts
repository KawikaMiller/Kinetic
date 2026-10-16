/** The agent's tools: real in-lesson functions over the invented data. Write tools only touch a fake outbox and ledger. */
import { calc } from './calc';
import { HELP_PAGES, ORDERS, SUPPLIER_PAGE, UNTRUSTED_MARKER, type Order } from './data';

export type ToolName = 'lookup_order' | 'search_docs' | 'calc' | 'fetch_page' | 'refund' | 'send_email';
export const TOOLS: readonly ToolName[] = ['lookup_order', 'search_docs', 'calc', 'fetch_page', 'refund', 'send_email'];
export const WRITE_TOOLS: readonly ToolName[] = ['refund', 'send_email'];
export const isWrite = (tool: ToolName): boolean => WRITE_TOOLS.includes(tool);

export interface Call {
  tool: ToolName;
  args: Readonly<Record<string, string | number>>;
}

export interface ToolResult {
  ok: boolean;
  text: string;
  /** A failure worth one retry (a simulated flaky call), as opposed to a refusal. */
  transient?: boolean;
  error?: string;
  data?: { order?: Order; value?: number; page?: string; title?: string };
}

export interface Email {
  to: string;
  text: string;
}

export interface Refund {
  order: number;
  amount: number;
}

export interface World {
  outbox: Email[];
  refunds: Refund[];
}

export const emptyWorld = (): World => ({ outbox: [], refunds: [] });

export const callText = (call: Call): string => `${call.tool}(${Object.values(call.args).join(', ')})`;
export const orderLine = (o: Order): string => `order ${o.id}: customer ${o.customer}, ${o.items} items, total ${o.total.toFixed(2)}, status ${o.status}, shipping to the address on file with the courier`;

const STOP = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'and', 'for', 'is', 'my', 'what', 'how', 'do', 'i']);
export const words = (text: string): string[] => (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => !STOP.has(w));

/** Pages ranked by how many distinct query words they contain (title and text); ties go to the earlier page. */
export function searchDocs(query: string): { index: number; score: number }[] {
  const q = [...new Set(words(query))];
  return HELP_PAGES.map((p, index) => {
    const have = new Set(words(`${p.title} ${p.text}`));
    return { index, score: q.filter((w) => have.has(w)).length };
  })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

export const firstSentence = (text: string): string => text.split(/(?<=\.)\s/)[0];

/** Run one call against the world (a write tool mutates it). Policy checks and failure draws happen outside. */
export function executeTool(call: Call, world: World): ToolResult {
  const bad = (error: string): ToolResult => ({ ok: false, text: `error: ${error}`, error });
  switch (call.tool) {
    case 'lookup_order': {
      const order = ORDERS.find((o) => o.id === Number(call.args.id));
      return order ? { ok: true, text: orderLine(order), data: { order } } : bad(`no order ${call.args.id}`);
    }
    case 'search_docs': {
      const hit = searchDocs(String(call.args.query))[0];
      if (!hit) return bad('no page matches');
      const page = HELP_PAGES[hit.index];
      return { ok: true, text: `${page.title}: ${page.text}`, data: { page: page.text, title: page.title } };
    }
    case 'calc': {
      const r = calc(String(call.args.expression));
      return r.ok ? { ok: true, text: String(Math.round(r.value * 100) / 100), data: { value: r.value } } : bad(r.error);
    }
    case 'fetch_page':
      return String(call.args.url) === SUPPLIER_PAGE.url
        ? { ok: true, text: `${SUPPLIER_PAGE.text} ${UNTRUSTED_MARKER}`, data: { page: SUPPLIER_PAGE.text } }
        : bad('page not found');
    case 'refund': {
      const order = ORDERS.find((o) => o.id === Number(call.args.order));
      const amount = Number(call.args.amount);
      if (!order) return bad(`no order ${call.args.order}`);
      if (!(amount > 0) || amount > order.total) return bad(`refund must be above 0 and at most the order total ${order.total.toFixed(2)}`);
      world.refunds.push({ order: order.id, amount });
      return { ok: true, text: `refunded ${amount.toFixed(2)} on order ${order.id}`, data: { value: amount } };
    }
    case 'send_email':
      world.outbox.push({ to: String(call.args.to), text: String(call.args.text) });
      return { ok: true, text: `queued a message to ${call.args.to} (fake outbox, nothing is sent)` };
  }
}
