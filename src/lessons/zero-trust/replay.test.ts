import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { buildFrames, type ZFrame } from './frames';
import { CHECK_NAME, decide, type Model } from './policy';
import { ALERT_DENIALS, LOG_ROWS, SERVICES, breachedSystems, replay, type NodeId, type Step } from './replay';

const text = (f: ZFrame) => renderToStaticMarkup(createElement(Fragment, null, f.say)).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
const final = (model: Model) => replay(model).at(-1)!.state;
const byId = (model: Model) => Object.fromEntries(replay(model).map((s) => [s.id, s])) as Record<Step['id'], Step | undefined>;
const MODELS: Model[] = ['moat', 'zt'];

describe('the replay is computed from decide, for both models', () => {
  it('castle and moat: only the internet attempt is denied, and the rest of the script walks through', () => {
    const steps = byId('moat');
    expect(steps.internet?.decision?.denier).toBe('firewall');
    for (const id of ['monday', 'runbooks', 'hr', 'password', 'service-call', 'database'] as const) {
      expect(steps[id]?.decision?.allow, id).toBe(true);
    }
    const end = final('moat');
    expect(breachedSystems(end)).toEqual(['wiki', 'hr', 'pay', 'db']);
    expect(end.exfil).toBe(true);
    expect(end.denials).toBe(1);
    expect(end.revoked).toBe(false);
    expect(end.log).toEqual([]);
  });

  it('zero trust: which check denied each step, computed', () => {
    const steps = byId('zt');
    const denier = (id: Step['id']) => steps[id]?.decision?.denier;
    expect(steps.monday?.decision?.allow).toBe(true);
    expect(steps.monday?.decision?.reason).toBe('MFA ✓ · device healthy ✓ · role engineering');
    expect(denier('internet')).toBe('identity');
    expect(denier('runbooks')).toBe('device');
    expect(steps.runbooks?.decision?.reason).toBe('device posture: EDR alert');
    expect(denier('hr')).toBe('device');
    expect(steps.hr?.decision?.reason).toBe('unenrolled device · role not permitted');
    expect(steps['service-call']?.decision?.allow).toBe(true);
    expect(steps['service-call']?.decision?.reason).toBe('valid workload cert · policy allows');
    expect(denier('database')).toBe('certificate');
    expect(steps.database?.decision?.reason).toBe('no client certificate · policy denies');
    expect(denier('retry')).toBe('identity');
    expect(steps.retry?.decision?.reason).toBe('sessions revoked · device quarantined');
  });

  it('zero trust: the attacker owns the laptop and nothing else, and nothing leaks', () => {
    const end = final('zt');
    expect(end.owned).toEqual(['bob']);
    expect(breachedSystems(end)).toEqual([]);
    expect(end.exfil).toBe(false);
    expect(end.creds).toBe(false);
    expect(end.denials).toBe(5);
    expect(end.revoked).toBe(true);
  });

  it('the password step only happens when the runbook was read, so zero trust skips it', () => {
    expect(replay('zt').some((s) => s.id === 'password')).toBe(false);
    expect(replay('moat').some((s) => s.id === 'password')).toBe(true);
  });

  it('the alert fires from the denial count, only in zero trust, and the retry is then denied', () => {
    const zt = replay('zt');
    const alertIndex = zt.findIndex((s) => s.id === 'alert');
    expect(alertIndex).toBeGreaterThan(0);
    expect(zt[alertIndex - 1].state.denials).toBeGreaterThanOrEqual(ALERT_DENIALS);
    expect(zt.slice(0, alertIndex).every((s) => !s.state.revoked)).toBe(true);
    expect(replay('moat').some((s) => s.id === 'alert' || s.id === 'retry')).toBe(false);
  });

  it('keeps the newest six log rows in zero trust and none in castle and moat', () => {
    const log = final('zt').log;
    expect(log).toHaveLength(LOG_ROWS);
    expect(log[0]).toMatchObject({ allow: false, who: 'bob@corp', what: 'wiki', why: 'sessions revoked · device quarantined' });
    expect(replay('zt').filter((s) => s.decision).length).toBe(7);
  });

  it('the shared opening of the script is the same attack in both models', () => {
    const ids = (m: Model) => replay(m).map((s) => s.id);
    expect(ids('moat').slice(0, 5)).toEqual(['monday', 'internet', 'phish', 'runbooks', 'hr']);
    expect(ids('zt').slice(0, 5)).toEqual(['monday', 'internet', 'phish', 'runbooks', 'hr']);
    for (const m of MODELS) {
      const phish = replay(m).find((s) => s.id === 'phish')!;
      expect(phish.state.bobPwned).toBe(true);
      expect(phish.state.owned).toEqual(['bob']);
    }
  });

  it('the model, not a flag, makes the difference: the same compromised laptop is allowed by moat and denied by zero trust', () => {
    const moat = byId('moat').runbooks!;
    const zt = byId('zt').runbooks!;
    expect(moat.request).toEqual(zt.request);
    expect(moat.decision?.allow).toBe(true);
    expect(zt.decision?.allow).toBe(false);
  });

  it('every state is reachable only through allowed requests: ownership grows exactly when an attacker request is allowed', () => {
    for (const model of MODELS) {
      let owned: NodeId[] = [];
      for (const step of replay(model)) {
        const grew = step.state.owned.length > owned.length;
        if (step.decision) {
          const attacker = !['monday', 'service-call'].includes(step.id);
          expect(grew, `${model} ${step.id}`).toBe(attacker && step.decision.allow && step.id !== 'retry');
        }
        owned = step.state.owned;
      }
    }
  });
});

describe('try-this', () => {
  it('try-this 1: in castle and moat the phish becomes the customer database through the laptop, the wiki and payments', () => {
    const firstOwned: NodeId[] = [];
    for (const step of replay('moat')) for (const n of step.state.owned) if (!firstOwned.includes(n)) firstOwned.push(n);
    expect(firstOwned.filter((n) => n === 'bob' || n === 'wiki' || n === 'pay' || n === 'db')).toEqual(['bob', 'wiki', 'pay', 'db']);
  });

  it('try-this 2: in zero trust Bob still gets phished', () => {
    const phish = replay('zt').find((s) => s.id === 'phish')!;
    expect(phish.state.bobPwned).toBe(true);
  });

  it('try-this 3: the checks that stopped each zero-trust step are identity, device and certificate first, with role also failing twice', () => {
    const denials = replay('zt').filter((s) => s.decision && !s.decision.allow);
    expect(denials.map((s) => s.decision?.denier)).toEqual(['identity', 'device', 'device', 'certificate', 'identity']);
    const failedRoles = denials.filter((s) => s.decision?.checks.some((c) => c.check === 'role' && !c.pass)).map((s) => s.id);
    expect(failedRoles).toEqual(['internet', 'hr', 'database']);
    const captions = buildFrames('zt').map(text);
    for (const name of [CHECK_NAME.identity, CHECK_NAME.device, CHECK_NAME.certificate]) expect(captions.some((c) => c.includes(`Denied by ${name}`)), name).toBe(true);
  });

  it('try-this 4: Systems breached is 4 of 4 in castle and moat and 0 of 4 in zero trust', () => {
    expect(SERVICES).toHaveLength(4);
    expect(breachedSystems(final('moat'))).toHaveLength(4);
    expect(breachedSystems(final('zt'))).toHaveLength(0);
    expect(final('moat').exfil).toBe(true);
    expect(final('zt').exfil).toBe(false);
  });
});

describe('captions are read from the decisions', () => {
  it('a denied step says "Denied by" the denier and an allowed one says "Allowed", for both models', () => {
    for (const model of MODELS) {
      const steps = replay(model);
      const frames = buildFrames(model);
      steps.forEach((step, i) => {
        const caption = text(frames[i + 1]);
        if (!step.decision) return;
        if (step.decision.allow) {
          expect(caption, `${model} ${step.id}`).toContain('Allowed');
          expect(caption).not.toContain('Denied by');
        } else {
          expect(caption, `${model} ${step.id}`).toContain(`Denied by ${CHECK_NAME[step.decision.denier!]}`);
          expect(caption).toContain(step.decision.reason);
        }
      });
    }
  });

  it('the stolen-password, salary and runbook consequences are stated only when the request was allowed', () => {
    for (const model of MODELS) {
      const steps = replay(model);
      const frames = buildFrames(model);
      const caption = (id: Step['id']) => {
        const i = steps.findIndex((s) => s.id === id);
        return i < 0 ? null : text(frames[i + 1]);
      };
      const phrases: [Step['id'], string][] = [['runbooks', 'payments admin password'], ['hr', 'salaries'], ['database', 'customer database is open']];
      for (const [id, phrase] of phrases) {
        const step = steps.find((s) => s.id === id)!;
        expect(caption(id)!.includes(phrase), `${model} ${id}`).toBe(step.decision!.allow);
      }
    }
  });

  it('the hr step names where the attacker attacks from, following whether the laptop worked', () => {
    expect(text(buildFrames('moat')[5])).toContain('from the same laptop');
    expect(text(buildFrames('zt')[5])).toContain("replays Bob's stolen session from their own machine");
  });

  it('the result caption quotes the breached count, the leak and the denials from the final state', () => {
    for (const model of MODELS) {
      const frames = buildFrames(model);
      const state = final(model);
      const caption = text(frames[frames.length - 1]);
      expect(caption).toContain(`${breachedSystems(state).length} of 4 systems breached`);
      expect(caption).toContain(state.exfil ? 'exfiltrated' : 'not exfiltrated');
      expect(caption).toContain(`${state.denials} ${state.denials === 1 ? 'request' : 'requests'} denied`);
      expect(caption.includes('zero systems')).toBe(breachedSystems(state).length === 0);
    }
  });

  it('the intro frames claim no outcome and state the script rule, the stolen-session rule and the two author-set facts', () => {
    for (const model of MODELS) {
      const intro = text(buildFrames(model)[0]);
      expect(intro).not.toContain('breached');
      expect(intro).not.toContain('same fixed script');
      expect(intro).toContain('the same opening');
      expect(intro).toContain('one rule');
      expect(intro).toContain("replay Bob's stolen session from their own machine");
      expect(intro).toContain('admin password only if the runbooks were readable');
      expect(intro).toContain('EDR alert');
      expect(intro).toContain('unenrolled');
    }
  });

  it('what the intro says is true: the opening is identical, the rest of the script differs by model, and the EDR flag decides the laptop', () => {
    const [moat, zt] = [replay('moat'), replay('zt')];
    // Same opening: the first four requests are equal across models.
    expect(moat.slice(0, 4).map((s) => s.request)).toEqual(zt.slice(0, 4).map((s) => s.request));
    // The attempts differ: HR uses a different subject, the password step is skipped, alert and retry appear only in zero trust.
    expect(moat.find((s) => s.id === 'hr')!.request!.subject).not.toEqual(zt.find((s) => s.id === 'hr')!.request!.subject);
    expect(moat.map((s) => s.id)).toContain('password');
    expect(zt.map((s) => s.id)).not.toContain('password');
    expect(zt.map((s) => s.id)).toEqual(expect.arrayContaining(['alert', 'retry']));
    expect(moat.map((s) => s.id)).not.toContain('alert');
    // The author-set fact: the same laptop with no EDR flag passes zero trust's wiki check; with the flag it is denied.
    const laptop = zt.find((s) => s.id === 'runbooks')!.request!;
    expect(laptop.subject).toMatchObject({ device: 'edr-alert' });
    expect(decide(laptop, { model: 'zt' }).allow).toBe(false);
    expect(decide({ ...laptop, subject: { ...laptop.subject, device: 'healthy' } as typeof laptop.subject }, { model: 'zt' }).allow).toBe(true);
  });

  it('the alert caption says monitoring checks once after the database attempt and quotes the denials and the threshold', () => {
    const frames = buildFrames('zt');
    const steps = replay('zt');
    const caption = text(frames[steps.findIndex((s) => s.id === 'alert') + 1]);
    expect(caption).toContain('checks once, after the database attempt');
    expect(caption).toContain(`${steps.find((s) => s.id === 'alert')!.state.denials} requests denied`);
    expect(caption).toContain(`threshold of ${ALERT_DENIALS}`);
    expect(caption).not.toContain('burst');
  });

  it('each frame carries the state after its step, and a packet is denied exactly when the decision was', () => {
    for (const model of MODELS) {
      const steps = replay(model);
      const frames = buildFrames(model);
      expect(frames).toHaveLength(steps.length + 2);
      steps.forEach((step, i) => {
        expect(frames[i + 1].state).toEqual(step.state);
        for (const msg of frames[i + 1].msgs) expect(msg.denied).toBe(step.decision ? !step.decision.allow : false);
      });
    }
  });
});
