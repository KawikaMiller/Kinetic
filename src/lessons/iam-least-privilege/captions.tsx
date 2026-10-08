import type { ReactNode } from 'react';
import { humanDuration, plural } from '../../core/format';
import { PRINCIPAL, RESOURCES, allowedPairs, blastRadius, keepsServiceWorking, totalPairs, ACCESS_LOG } from './account';
import { exposures, KEY_ROTATION_MINUTES, ROLE_MINUTES } from './credentials';
import type { Statement } from './policy';

const minutes = (m: number) => humanDuration(m * 60);

export function blastCaption(statements: readonly Statement[], compromised: boolean): ReactNode {
  const radius = blastRadius(statements);
  const pairs = allowedPairs(statements);
  const works = keepsServiceWorking(statements, ACCESS_LOG);
  const used = ACCESS_LOG.length;
  const names = RESOURCES.filter((r) => radius.includes(r.id)).map((r) => r.label).join(', ');
  return (
    <>
      {compromised
        ? <>If <b>{PRINCIPAL}</b> is compromised, an attacker reaches <span className="hl bad">{radius.length} of {RESOURCES.length} resources</span>{radius.length ? <> ({names})</> : null}.</>
        : <><b>{PRINCIPAL}</b> can reach {radius.length} of {RESOURCES.length} resources{radius.length ? <> ({names})</> : null}. Compromise it to see them light up.</>}
      {' '}It is allowed {pairs} of {totalPairs} actions, and the service really used {plural(used, 'action')} in the last 90 days.
      {works ? <> The service still works.</> : <> <span className="hl orange">The service would break:</span> something it uses is no longer allowed.</>}
    </>
  );
}

export function credCaption(leakAt: number, rotation: number, now: number): ReactNode {
  const leaked = now >= leakAt;
  const e = exposures(leakAt, rotation);
  if (!leaked) return <>The clock is at minute {now}. At minute {leakAt} a copy of each credential will land on a laptop.</>;
  const roleLeft = Math.max(0, leakAt + e.role - now);
  const vaultLeft = Math.max(0, leakAt + e.vault - now);
  return (
    <>
      A copy made at minute {leakAt} still works for: the access key <span className="hl bad">{minutes(Math.min(e.key, KEY_ROTATION_MINUTES))}</span> (until someone rotates it), the {ROLE_MINUTES}-minute role{' '}
      <span className={`hl ${roleLeft ? 'bad' : 'ok'}`}>{roleLeft ? `${minutes(roleLeft)} more` : 'no longer'}</span>, the vault credential{' '}
      <span className={`hl ${vaultLeft ? 'bad' : 'ok'}`}>{vaultLeft ? `${minutes(vaultLeft)} more` : 'no longer'}</span>.
    </>
  );
}
