import type { ReactNode } from 'react';
import type { Tone } from '../../core/tone';
import { shape, validate, verdict, type Endpoint, type Level, type Method } from './model';

export const LEVEL_TONE: Record<Level, Tone> = { ok: 'ok', warn: 'orange', bad: 'bad' };

/** The caption for an endpoint's current choice: what the validator says about it right now. */
export function boardCaption(e: Endpoint, choice: { method: Method; path: string }): ReactNode {
  const flags = validate(e.intent, choice.method, shape(choice.path));
  const v = verdict(flags);
  const problems = flags.filter((f) => f.level !== 'ok').length;
  return (
    <>{e.intent.job}: {choice.method} {choice.path} {v === 'ok'
      ? <span className="hl ok">matches the conventions</span>
      : <>has {problems === 1 ? 'one flag' : `${problems} flags`}, worst <span className={`hl ${LEVEL_TONE[v]}`}>{v === 'bad' ? 'a violation' : 'a style warning'}</span></>}.</>
  );
}
