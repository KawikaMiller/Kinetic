import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { evaluate, matchGlob, ruleOrder, type Evaluation, type Request, type Statement } from './policy';

export interface PolicyFrame extends Frame {
  /** Statement ids looked at so far, in the order the rule looks. */
  checked: string[];
  /** The statement being looked at now. */
  current: string | null;
  /** Set on the last frame: the decision. */
  result: Evaluation | null;
}

const describe = (s: Statement) => `${s.effect} ${s.action} on ${s.resource}`;

/** The frames of one evaluation: the request, each statement in rule order until one decides, then the verdict. */
export function policyFrames(statements: readonly Statement[], r: Request): PolicyFrame[] {
  const result = evaluate(statements, r);
  const frames: PolicyFrame[] = [
    {
      checked: [], current: null, result: null,
      say: <><b>{r.principal}</b> asks to do <span className="hl info"><code>{r.action}</code></span> on <span className="hl info"><code>{r.resource}</code></span>. The rule: look at every Deny first, then every Allow, and refuse by default.</>,
    },
  ];
  const checked: string[] = [];
  for (const s of ruleOrder(statements)) {
    checked.push(s.id);
    const matched = result.matches[s.id];
    frames.push({ checked: [...checked], current: s.id, result: null, say: checkCaption(s, r, matched) });
    if (matched) break;
  }
  frames.push({ checked: [...checked], current: null, result, say: verdictCaption(result, statements) });
  return frames;
}

function checkCaption(s: Statement, r: Request, matched: boolean): ReactNode {
  const a = matchGlob(s.action, r.action);
  const res = matchGlob(s.resource, r.resource);
  const tone = matched ? (s.effect === 'Deny' ? 'bad' : 'ok') : 'dim';
  return (
    <>
      <code>{describe(s)}</code>: the action pattern {a ? 'matches' : 'does not match'} <code>{r.action}</code> and the resource pattern {res ? 'matches' : 'does not match'}{' '}
      <code>{r.resource}</code>, so this statement <span className={`hl ${tone}`}>{matched ? `matches: ${s.effect === 'Deny' ? 'an explicit deny wins' : 'allowed'}` : 'does not apply'}</span>.
    </>
  );
}

function verdictCaption(e: Evaluation, statements: readonly Statement[]): ReactNode {
  const by = statements.find((s) => s.id === e.decidedBy);
  switch (e.reason) {
    case 'explicit-deny':
      return <><span className="hl bad">Denied by an explicit Deny</span> (<code>{by && describe(by)}</code>). No Allow can override it, however broad.</>;
    case 'allow':
      return <><span className="hl ok">Allowed</span> by <code>{by && describe(by)}</code>. Nothing denied it first.</>;
    default:
      return <><span className="hl bad">Denied by default</span>: no statement matched, and with no Allow the answer is no. A wrong or missing pattern looks exactly like this.</>;
  }
}
