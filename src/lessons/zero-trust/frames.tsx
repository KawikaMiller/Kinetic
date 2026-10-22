import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { CHECK_NAME, type Model } from './policy';
import { ALERT_DENIALS, INITIAL_STATE, breachedSystems, replay, SERVICES, type AttackState, type NodeId, type PillKind, type Step } from './replay';

export interface Msg {
  path: NodeId[];
  label: string;
  kind: PillKind;
  denied: boolean;
}

export interface ZFrame extends Frame {
  msgs: Msg[];
  state: AttackState;
}

const LEGIT: ReadonlySet<Step['id']> = new Set(['monday', 'service-call']);

/** What the decision was and which check stopped it, in the decision's own words. */
function outcome(step: Step, model: Model): ReactNode {
  const d = step.decision;
  if (!d) return null;
  if (d.allow) {
    return (
      <>
        <span className={`hl ${LEGIT.has(step.id) ? 'ok' : 'bad'}`}>Allowed</span>: {d.reason}.
        {model === 'moat' && d.checks.length === 1 ? ' Nothing beyond "did it come from inside?" was checked.' : ''}
      </>
    );
  }
  return <><span className="hl ok">Denied by {CHECK_NAME[d.denier!]}</span>: {d.reason}.</>;
}

/** What an allowed attacker request gained them, said only when it was allowed. */
function gain(step: Step): ReactNode {
  if (!step.decision?.allow) return null;
  switch (step.id) {
    case 'runbooks': return <> A runbook holds the <span className="hl bad">payments admin password</span>.</>;
    case 'hr': return <> They can now read <span className="hl bad">salaries</span>.</>;
    case 'password': return <> The payments service accepts the stolen password: <span className="hl bad">lateral movement</span>.</>;
    case 'database': return <> The <span className="hl bad">customer database</span> is open to them.</>;
    default: return null;
  }
}

function lead(step: Step, state: AttackState): ReactNode {
  switch (step.id) {
    case 'monday': return <>A normal Monday: Bob (SSO + MFA, managed laptop, engineering) reads the wiki.</>;
    case 'internet': return <>The attacker tries the wiki straight from the internet.</>;
    case 'phish': return <>So they phish Bob. He opens the attachment and <span className="hl bad">his laptop is compromised</span>. Neither model stops the phish; they differ in what happens next.</>;
    case 'runbooks': return <>From the compromised laptop the attacker reads the wiki's runbooks.</>;
    case 'hr': return step.request?.subject.origin === 'internet'
      ? <>The laptop is blocked, so the attacker replays Bob's stolen session from their own machine, aiming at HR.</>
      : <>Next, HR from the same laptop.</>;
    case 'password': return <>The runbook held a payments admin password, so the attacker tries it on the payments service.</>;
    case 'service-call': return <>Meanwhile, a normal service call: payments reads the customer database.</>;
    case 'database': return step.request?.subject.label === 'unknown'
      ? <>The attacker tries the customer database directly.</>
      : <>The payments service is under the attacker's control, so they query the customer database through it.</>;
    case 'exfil': return <><span className="hl bad">Data exfiltrated</span> out of the customer database.</>;
    case 'alert': return <>Monitoring checks once, after the database attempt: {state.denials} requests denied is at or over the alert threshold of {ALERT_DENIALS}. It raises an alert and security <b>revokes Bob's sessions and quarantines the laptop</b>.</>;
    case 'retry': return <>The compromised laptop tries the wiki again.</>;
  }
}

/** The attacker's script rules and the two author-set facts, stated before any step runs so no result depends on something unseen. */
const SCRIPT_RULES: ReactNode = (
  <> <b>The attacker script:</b> the same opening in both models (probe the wiki from the internet, phish Bob, read the runbooks from his laptop), then
    <b> one rule</b>: if the laptop is denied, they replay Bob's stolen session from their own machine; they try the admin password only if the runbooks
    were readable; in zero trust, monitoring checks once, after the database attempt. <b>Two facts the author set:</b> Bob's endpoint agent flags the
    infected laptop (<span className="hl">EDR alert</span>; with no such flag the device check would pass it), and the attacker's own machine is{' '}
    <span className="hl">unenrolled</span>.</>
);

const framesIntro = (model: Model): ReactNode =>
  model === 'moat' ? (
    <><b>Castle and moat.</b> A firewall and VPN guard the edge. Once you're <b>inside</b>, the network trusts you. Whether each attempt succeeds is decided by the network's policy.{SCRIPT_RULES}</>
  ) : (
    <><b>Zero trust:</b> there is no trusted inside. Every request goes through an <span className="hl">access proxy + policy engine</span> that checks <b>who</b>, <b>which device</b>, and <b>context</b> every time; the policy decides each attempt.{SCRIPT_RULES}</>
  );

function summary(model: Model, state: AttackState): ReactNode {
  const breached = breachedSystems(state).length;
  return (
    <>
      Result: <span className={`hl ${breached ? 'bad' : 'ok'}`}>{breached} of {SERVICES.length} systems breached</span>, customer data{' '}
      <span className={`hl ${state.exfil ? 'bad' : 'ok'}`}>{state.exfil ? 'exfiltrated' : 'not exfiltrated'}</span>, {state.denials}{' '}
      {state.denials === 1 ? 'request' : 'requests'} denied.{' '}
      {model === 'moat'
        ? <>Switch to <span className="hl ok">Zero trust</span> and replay the attack: same opening and same rule, different policy.</>
        : breached === 0
          ? <>One laptop, zero systems: the policy contained the compromise.</>
          : <>Zero trust limited the spread here but did not stop it.</>}
    </>
  );
}

const toMsg = (step: Step): Msg[] =>
  step.path.length ? [{ path: step.path, label: step.label, kind: step.pill, denied: step.decision ? !step.decision.allow : false }] : [];

/** The replay for one model: the intro, one frame per step of `replay(model)`, and the result. Every caption's outcome is read from the step's decision. */
export function buildFrames(model: Model): ZFrame[] {
  const steps = replay(model);
  const frames: ZFrame[] = [{ msgs: [], state: INITIAL_STATE, say: framesIntro(model) }];
  for (const step of steps) {
    frames.push({
      msgs: toMsg(step),
      state: step.state,
      say: <>{lead(step, step.state)} {outcome(step, model)}{gain(step)}</>,
      hold: step.decision ? undefined : 1.5,
    });
  }
  const last = steps[steps.length - 1].state;
  frames.push({ msgs: [], state: last, say: summary(model, last), hold: 2 });
  return frames;
}
