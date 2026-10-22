import type { ReactNode } from 'react';
import { plural } from '../../core/format';
import { CLASS_ORDER, DEFENCE_ORDER, defenceSet, verdictOf, type DefenceId } from './matrix';
import { checkName, parseName } from './names';
import type { Check } from './provenance';
import { COMPROMISED_PACKAGE, COMPROMISED_VERSION, PACKAGE_NAMES, SERVICE_NAMES, WITHDRAWN_DAY } from './registry';
import { affectedBy, installAll, releaseStatus, type LockWhen, type Policy } from './resolve';
import type { Holder } from './sbom';
import { INSTALL_DAY } from './opening';
import { WARN_DISTANCE } from './names';

const BAD = `${COMPROMISED_PACKAGE}@${COMPROMISED_VERSION}`;

export const POLICY_LABEL: Record<Policy, string> = { ranges: 'Ranges, no lockfile', lockfile: 'Ranges with a lockfile', exact: 'Exact pins' };

/** What an install on the install day does under a policy: who runs the compromised release. */
export function spreadNumbers(policy: Policy, lockWhen: LockWhen) {
  const installs = installAll(policy, lockWhen, { day: INSTALL_DAY, cooldown: 0 });
  const affected = affectedBy(installs);
  return { installs, affected };
}

export function spreadCaption(policy: Policy, lockWhen: LockWhen): ReactNode {
  const { affected } = spreadNumbers(policy, lockWhen);
  const head = (
    <>
      {POLICY_LABEL[policy]}{policy === 'lockfile' ? `, written ${lockWhen === 'before' ? 'before' : 'after'} the bad release` : ''}: install on day {INSTALL_DAY}.{' '}
    </>
  );
  if (affected.services.length === 0) {
    return (
      <>
        {head}No service runs {BAD}: {policy === 'exact' ? 'an exact pin names the version it was given, so a newer release is never offered' : 'the lockfile still holds the version chosen before the release'}.
      </>
    );
  }
  return (
    <>
      {head}
      {plural(affected.services.length, 'service')} of {SERVICE_NAMES.length} and {plural(affected.packages.length, 'package')} run {BAD}.{' '}
      {policy === 'lockfile' ? 'The lockfile froze a choice that was already bad: a lock records what was picked, it does not make it trustworthy.' : 'Every dependent whose range allows the new release picked it up on the next install.'}
    </>
  );
}

export function cooldownCaption(installDay: number, cooldown: number): ReactNode {
  const s = releaseStatus({ day: installDay, cooldown });
  return s === 'withdrawn' ? (
    <>
      An install on day {installDay} comes after the registry pulled {BAD} on day {WITHDRAWN_DAY}: nothing to pick up, whatever the cooldown.
    </>
  ) : s === 'held-back' ? (
    <>
      A cooldown of {plural(cooldown, 'day')} holds {BAD} back on day {installDay}: it is {plural(installDay, 'day')} old.
    </>
  ) : (
    <>
      On day {installDay} {BAD} is {plural(installDay, 'day')} old and the cooldown is {plural(cooldown, 'day')}: it is installed.
    </>
  );
}

export function integrityCaption(flipped: number | null, checkOn: boolean, recorded: string | null, actual: string | null): ReactNode {
  if (recorded === null || actual === null) return <>This browser has no crypto.subtle, so the real SHA-256 cannot be computed here.</>;
  if (flipped === null) return <>The bytes are as the lockfile recorded them: the hashes match and the install goes ahead.</>;
  const same = recorded === actual;
  return (
    <>
      Byte {flipped} was changed: the hash is {same ? 'the same (which a one-bit change cannot cause)' : 'different'}.{' '}
      {checkOn ? 'The integrity check compares it with the lockfile and refuses the install.' : 'With the check off the changed bytes are installed anyway: same version number, different bytes.'}
    </>
  );
}

export function matrixCaption(defences: readonly DefenceId[], name: string): ReactNode {
  const on = defenceSet(...defences);
  const verdicts = CLASS_ORDER.map((c) => verdictOf(c, on));
  const count = (v: string) => verdicts.filter((x) => x === v).length;
  const parsed = parseName(name);
  const check = parsed.ok ? checkName(parsed.value) : null;
  return (
    <>
      With {defences.length === 0 ? 'no defence' : plural(defences.length, 'defence')} of {DEFENCE_ORDER.length} on, {count('blocked')} of {CLASS_ORDER.length} classes are blocked, {count('limited')} limited and {count('open')} open.{' '}
      {check === null ? (
        <>The name is refused: {parsed.ok ? '' : parsed.error}</>
      ) : check.kind === 'warn' ? (
        <>
          The name <code>{name}</code> is {plural(check.near.distance, 'edit')} from <code>{check.near.name}</code>: close enough (within {WARN_DISTANCE}) to warn.
        </>
      ) : check.kind === 'known' ? (
        <>
          <code>{name}</code> is a known package.
        </>
      ) : check.kind === 'empty' ? (
        <>Type a package name to check it against {PACKAGE_NAMES.length + 5} known names.</>
      ) : (
        <>
          <code>{name}</code> is not within {WARN_DISTANCE} edits of a known name.
        </>
      )}
    </>
  );
}

export function provenanceCaption(checks: readonly Check[] | null, ok: boolean, query: string, held: readonly Holder[], queryError: string | null): ReactNode {
  const verdict =
    checks === null ? (
      <>Checking the attestation…</>
    ) : ok ? (
      <>Every check passes: this says who built the artifact from which commit, not that the code is benign.</>
    ) : (
      <>{plural(checks.filter((c) => !c.ok).length, 'check')} failed: {checks.filter((c) => !c.ok).map((c) => c.label).join('; ')}.</>
    );
  const sbom = queryError ? (
    <> The name is refused: {queryError}</>
  ) : query === '' ? null : held.length === 0 ? (
    <>
      {' '}
      No service contains <code>{query}</code>.
    </>
  ) : (
    <>
      {' '}
      <code>{query}</code> is in {plural(held.length, 'service')}: {held.map((h) => `${h.service} (${h.version})`).join(', ')}.
    </>
  );
  return (
    <>
      {verdict}
      {sbom}
    </>
  );
}
