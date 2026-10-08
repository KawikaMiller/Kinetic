/**
 * A small, documented subset of Wireshark's display-filter language. Display filters only
 * hide packets that were already captured; capture filters (tcpdump's BPF, "host x") decide
 * what gets recorded in the first place. Anything outside the subset is refused.
 *
 *   protocols      tcp  udp  dns  tls
 *   addresses      ip.addr == A   ip.src == A   ip.dst == A
 *   ports          tcp.port == N  udp.port == N
 *   TCP flags      tcp.flags.syn  tcp.flags.ack  tcp.flags.fin  tcp.flags.reset   (bare, or == 0 / == 1)
 *   analysis       tcp.analysis.retransmission  tcp.analysis.duplicate_ack
 *   DNS            dns.flags.rcode == N
 *   combining      !  not  &&  and  ||  or   (no parentheses)
 */
import { parseIPv4 } from '../../core/ipv4';
import { parseBoundedInt, type FieldParse } from '../../core/parse';
import type { Captured } from './captures';
import { decode } from './wire';

export type Predicate = (p: Captured) => boolean;

export const FILTER_MAX = 120;
const NOT_SUPPORTED = (what: string) => `"${what}" is not supported in this simplified filter.`;

const FLAG_FIELDS: Record<string, 'SYN' | 'ACK' | 'FIN' | 'RST'> = {
  'tcp.flags.syn': 'SYN', 'tcp.flags.ack': 'ACK', 'tcp.flags.fin': 'FIN', 'tcp.flags.reset': 'RST',
};
const PROTOCOLS: Record<string, Predicate> = {
  tcp: (p) => !!p.tcp,
  udp: (p) => !!decode(p.frame).udp,
  dns: (p) => !!p.dns,
  tls: (p) => !!p.tls,
};
const ANALYSIS: Record<string, Predicate> = {
  'tcp.analysis.retransmission': (p) => p.tag === 'retransmission',
  'tcp.analysis.duplicate_ack': (p) => p.tag === 'dup-ack',
};

type Token = { kind: 'word' | 'op'; text: string };

function tokenize(text: string): FieldParse<Token[]> {
  const tokens: Token[] = [];
  const re = /\s*(&&|\|\||==|!=|!|[A-Za-z_][\w.]*|[0-9][0-9.]*)\s*/y;
  let i = 0;
  while (i < text.length) {
    re.lastIndex = i;
    const m = re.exec(text);
    if (!m) return { ok: false, error: NOT_SUPPORTED(text.slice(i).trim().split(/\s+/)[0]) };
    const t = m[1];
    tokens.push({ kind: /^(&&|\|\||==|!=|!)$/.test(t) ? 'op' : 'word', text: t });
    i = re.lastIndex;
  }
  return { ok: true, value: tokens };
}

/** Parse a filter. Empty means "show everything". */
export function parseFilter(input: string): FieldParse<Predicate> {
  const text = input.trim();
  if (!text) return { ok: true, value: () => true };
  if (text.length > FILTER_MAX) return { ok: false, error: `That filter is too long for this demo (at most ${FILTER_MAX} characters).` };
  const tk = tokenize(text);
  if (!tk.ok) return tk;
  const tokens = tk.value;
  let pos = 0;
  const peek = () => tokens[pos]?.text;
  const isAnd = (t?: string) => t === '&&' || t === 'and';
  const isOr = (t?: string) => t === '||' || t === 'or';
  const isNot = (t?: string) => t === '!' || t === 'not';

  function atom(): FieldParse<Predicate> {
    const t = tokens[pos++];
    if (!t) return { ok: false, error: 'The filter ends too early: expected a field or protocol.' };
    if (t.kind !== 'word') return { ok: false, error: NOT_SUPPORTED(t.text) };
    const field = t.text;
    const hasEq = peek() === '==';
    if (peek() === '!=') return { ok: false, error: NOT_SUPPORTED('!=') };
    const value = (): FieldParse<string> => {
      pos++;
      const v = tokens[pos++];
      return v && v.kind === 'word' ? { ok: true, value: v.text } : { ok: false, error: `Expected a value after == ${field}.` };
    };
    if (PROTOCOLS[field] && !hasEq) return { ok: true, value: PROTOCOLS[field] };
    if (ANALYSIS[field] && !hasEq) return { ok: true, value: ANALYSIS[field] };
    if (FLAG_FIELDS[field]) {
      const flag = FLAG_FIELDS[field];
      const has: Predicate = (p) => !!p.tcp?.flags.includes(flag);
      if (!hasEq) return { ok: true, value: has };
      const v = value();
      if (!v.ok) return v;
      if (v.value !== '0' && v.value !== '1') return { ok: false, error: `${field} is 0 or 1.` };
      return { ok: true, value: v.value === '1' ? has : (p) => !!p.tcp && !has(p) };
    }
    if (field === 'ip.addr' || field === 'ip.src' || field === 'ip.dst') {
      if (!hasEq) return { ok: false, error: `${field} needs a value: ${field} == 203.0.113.10` };
      const v = value();
      if (!v.ok) return v;
      const a = parseIPv4(v.value);
      if (!a.ok) return { ok: false, error: a.error };
      const want = a.value;
      return {
        ok: true,
        value: (p) => {
          const d = decode(p.frame);
          return field === 'ip.src' ? d.src === want : field === 'ip.dst' ? d.dst === want : d.src === want || d.dst === want;
        },
      };
    }
    if (field === 'tcp.port' || field === 'udp.port' || field === 'dns.flags.rcode') {
      if (!hasEq) return { ok: false, error: `${field} needs a value, like ${field} == ${field === 'dns.flags.rcode' ? 3 : 443}` };
      const v = value();
      if (!v.ok) return v;
      const n = parseBoundedInt(v.value, { min: 0, max: field === 'dns.flags.rcode' ? 15 : 65535 });
      if (!n.ok) return { ok: false, error: `${field}: ${n.error}` };
      const want = n.value;
      if (field === 'dns.flags.rcode') return { ok: true, value: (p) => !!p.dns?.response && p.dns.rcode === want };
      return {
        ok: true,
        value: (p) => {
          const d = decode(p.frame);
          const ports = field === 'tcp.port' ? d.tcp && [d.tcp.sport, d.tcp.dport] : d.udp && [d.udp.sport, d.udp.dport];
          return !!ports && ports.includes(want);
        },
      };
    }
    return { ok: false, error: NOT_SUPPORTED(field) };
  }
  function unary(): FieldParse<Predicate> {
    if (isNot(peek())) {
      pos++;
      const inner = unary();
      return inner.ok ? { ok: true, value: (p) => !inner.value(p) } : inner;
    }
    return atom();
  }
  function conj(): FieldParse<Predicate> {
    let left = unary();
    while (left.ok && isAnd(peek())) {
      pos++;
      const right = unary();
      if (!right.ok) return right;
      const [l, r] = [left.value, right.value];
      left = { ok: true, value: (p) => l(p) && r(p) };
    }
    return left;
  }
  function disj(): FieldParse<Predicate> {
    let left = conj();
    while (left.ok && isOr(peek())) {
      pos++;
      const right = conj();
      if (!right.ok) return right;
      const [l, r] = [left.value, right.value];
      left = { ok: true, value: (p) => l(p) || r(p) };
    }
    return left;
  }
  const result = disj();
  if (result.ok && pos < tokens.length) return { ok: false, error: NOT_SUPPORTED(tokens[pos].text) };
  return result;
}

export const FILTER_EXAMPLES = ['tcp.flags.syn == 1', 'ip.addr == 203.0.113.10', 'dns', 'tcp.analysis.retransmission', 'tcp.flags.reset', 'tls'];
