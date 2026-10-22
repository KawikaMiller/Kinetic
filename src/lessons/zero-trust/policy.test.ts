import { describe, expect, it } from 'vitest';
import {
  CHECK_NAME, PAYMENTS_IDENTITY, decide, type DeviceState, type Model, type Origin, type Resource, type Role, type SessionState,
  type Subject, type UserSubject,
} from './policy';

const RESOURCES: Resource[] = ['wiki', 'hr', 'pay', 'db'];
const ROLES: Role[] = ['engineering', 'hr', 'payments-admin', 'none'];
const SESSIONS: SessionState[] = ['mfa', 'revoked', 'none'];
const DEVICES: DeviceState[] = ['healthy', 'edr-alert', 'unenrolled', 'quarantined'];
const ORIGINS: Origin[] = ['internet', 'inside'];

/** Written out independently of policy.ts: which role reaches which system. */
const ROLE_REACHES: Record<Resource, Role[]> = { wiki: ['engineering'], hr: ['hr'], pay: ['payments-admin'], db: [] };

const user = (patch: Partial<UserSubject>): UserSubject => ({
  kind: 'user', label: 'u', origin: 'inside', session: 'mfa', device: 'healthy', role: 'engineering', ...patch,
});
const everyUser = (): UserSubject[] =>
  ORIGINS.flatMap((origin) => SESSIONS.flatMap((session) => DEVICES.flatMap((device) => ROLES.map((role) => user({ origin, session, device, role })))));
const everyWorkload = (): Subject[] =>
  ORIGINS.flatMap((origin) => [null, PAYMENTS_IDENTITY, 'spiffe://corp/wiki'].map((cert): Subject => ({ kind: 'workload', label: 'w', origin, cert })));

describe('castle and moat', () => {
  it('stops every request from the internet at the firewall, and nothing else', () => {
    for (const subject of [...everyUser(), ...everyWorkload()].filter((s) => s.origin === 'internet')) {
      for (const resource of RESOURCES) {
        const d = decide({ subject, resource }, { model: 'moat' });
        expect(d.allow).toBe(false);
        expect(d.denier).toBe('firewall');
        expect(d.checks.map((c) => c.check)).toEqual(['firewall']);
      }
    }
  });

  it('trusts everything inside, whatever the identity, device, role or certificate (the model checks one thing)', () => {
    for (const subject of [...everyUser(), ...everyWorkload()].filter((s) => s.origin === 'inside')) {
      for (const resource of RESOURCES) {
        const d = decide({ subject, resource }, { model: 'moat' });
        expect(d.allow, `${JSON.stringify(subject)} -> ${resource}`).toBe(true);
        expect(d.checks).toHaveLength(1);
      }
    }
  });
});

describe('zero trust', () => {
  const policy = { model: 'zt' as Model };

  it('lets a person in only with a live MFA session, a healthy device and a role the system allows, whatever the origin (all 384 cases)', () => {
    let cases = 0;
    for (const subject of everyUser()) {
      for (const resource of RESOURCES) {
        const expected = subject.session === 'mfa' && subject.device === 'healthy' && ROLE_REACHES[resource].includes(subject.role);
        expect(decide({ subject, resource }, policy).allow, `${JSON.stringify(subject)} -> ${resource}`).toBe(expected);
        cases += 1;
      }
    }
    expect(cases).toBe(2 * 3 * 4 * 4 * 4);
  });

  it('lets a service in only with the one certificate the policy names for that system', () => {
    for (const subject of everyWorkload()) {
      for (const resource of RESOURCES) {
        const expected = subject.kind === 'workload' && subject.cert === 'spiffe://corp/payments' && resource === 'db';
        expect(decide({ subject, resource }, policy).allow).toBe(expected);
      }
    }
  });

  it('is the same decision wherever the request came from', () => {
    for (const subject of [...everyUser(), ...everyWorkload()]) {
      for (const resource of RESOURCES) {
        const inside = decide({ subject: { ...subject, origin: 'inside' }, resource }, policy);
        const outside = decide({ subject: { ...subject, origin: 'internet' }, resource }, policy);
        expect(outside).toEqual(inside);
      }
    }
  });

  it('names the first failing check in the order identity, device, role, and lists every failed one in the reason', () => {
    const d = decide({ subject: user({ session: 'none', device: 'unenrolled', role: 'none' }), resource: 'hr' }, policy);
    expect(d.checks.map((c) => c.check)).toEqual(['identity', 'device', 'role']);
    expect(d.denier).toBe('identity');
    expect(d.reason).toBe('no valid session · unenrolled device · role not permitted');
    expect(decide({ subject: user({ device: 'edr-alert' }), resource: 'wiki' }, policy).denier).toBe('device');
    expect(decide({ subject: user({ role: 'hr' }), resource: 'wiki' }, policy).denier).toBe('role');
    const svc = decide({ subject: { kind: 'workload', label: 'w', origin: 'inside', cert: null }, resource: 'db' }, policy);
    expect(svc.checks.map((c) => c.check)).toEqual(['certificate', 'role']);
    expect(svc.denier).toBe('certificate');
  });

  it('every check that stops a request is necessary: fixing just that field changes the denier', () => {
    const stolen = user({ device: 'unenrolled', role: 'engineering', origin: 'internet' });
    expect(decide({ subject: stolen, resource: 'hr' }, policy).denier).toBe('device');
    // Fix the device: the role check (engineers cannot read HR) is next.
    expect(decide({ subject: { ...stolen, device: 'healthy' }, resource: 'hr' }, policy).denier).toBe('role');
    // Fix the role too: allowed.
    expect(decide({ subject: { ...stolen, device: 'healthy', role: 'hr' }, resource: 'hr' }, policy).allow).toBe(true);
    const flagged = user({ device: 'edr-alert' });
    expect(decide({ subject: flagged, resource: 'wiki' }, policy).allow).toBe(false);
    expect(decide({ subject: { ...flagged, device: 'healthy' }, resource: 'wiki' }, policy).allow).toBe(true);
  });

  it('is pure: the same request gives an equal decision and the request is not changed', () => {
    const request = { subject: user({ device: 'edr-alert' }), resource: 'wiki' as Resource };
    const before = JSON.stringify(request);
    expect(decide(request, policy)).toEqual(decide(request, policy));
    expect(JSON.stringify(request)).toBe(before);
  });
});

describe('check names', () => {
  it('every check a decision can name has a caption name', () => {
    for (const subject of [...everyUser(), ...everyWorkload()]) {
      for (const model of ['moat', 'zt'] as Model[]) {
        const d = decide({ subject, resource: 'db' }, { model });
        if (d.denier) expect(CHECK_NAME[d.denier]).toBeTruthy();
      }
    }
  });
});
