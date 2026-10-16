import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { runAgent, type ApprovalChoice } from './agent';
import { trustCaption } from './captions';
import { SUPPLIER_PAGE, UNTRUSTED_MARKER } from './data';
import { EventLog, Outbox } from './EventLog';
import { trustConfig } from './facts';
import { TRUST_DEFAULT, type TrustMode } from './settings';
import { TOOLS, callText } from './tools';

const TRUST_OPTIONS = [
  { value: 'naive' as TrustMode, label: 'Naive: any text is an instruction' },
  { value: 'separated' as TrustMode, label: 'Separated: tool output is data' },
];

export function TrustScene({ picker }: { picker: ReactNode }) {
  const [trust, setTrust] = useState<TrustMode>(TRUST_DEFAULT.trust);
  const [emailOffered, setEmailOffered] = useState<boolean>(TRUST_DEFAULT.emailOffered);
  const [approval, setApproval] = useState<boolean>(TRUST_DEFAULT.approval);
  const [approvals, setApprovals] = useState<ApprovalChoice[]>([]);
  const result = useRef<HTMLDivElement>(null);
  const run = useMemo(
    () => runAgent(trustConfig({ trust, approval, approvals, offered: emailOffered ? TOOLS : TOOLS.filter((t) => t !== 'send_email') })),
    [trust, emailOffered, approval, approvals],
  );
  const caption = trustCaption(run, trust);
  const attempted = run.events.some((e) => e.phase === 'act' && e.text.startsWith('send_email'));
  const executed = run.writes.some((w) => !w.requested);
  const change = <T,>(set: (v: T) => void) => (v: T) => { set(v); setApprovals([]); };
  const decide = (choice: ApprovalChoice) => {
    setApprovals([...approvals, choice]);
    result.current?.focus();
  };

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Unrequested write attempted" value={attempted ? 'yes' : 'no'} color={attempted ? 'var(--orange)' : 'var(--ok)'} sub="the task only asked for a summary" />
          <Stat label="Unrequested write executed" value={executed ? 'yes' : 'no'} color={executed ? 'var(--bad)' : 'var(--ok)'} sub={executed ? 'the fake outbox has a message' : 'the outbox is empty'} />
          <Stat label="Messages in the outbox" value={run.world.outbox.length} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'untrusted text (labelled) and a call awaiting approval', shape: 'square' },
            { color: 'var(--hi)', label: 'an executed call', shape: 'square' },
            { color: 'var(--bad)', label: 'a rejected call, or an unrequested write that ran', shape: 'square' },
            { color: 'var(--violet)', label: 'the answer', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Stand-in policy" value={trust} onChange={change(setTrust)} options={TRUST_OPTIONS} />
        </>,
        <>
          <Toggle label="send_email tool" value={emailOffered} onChange={change(setEmailOffered)} off="Not offered (least privilege)" on="Offered" />
          <Toggle label="Approval gate" value={approval} onChange={change(setApproval)} off="Off" on="On: writes wait" />
        </>,
      ]}
    >
      <div className="ag-stage stage-pad">
        <Box>
          <SectionTitle hint="the page the task fetches (invented)">{SUPPLIER_PAGE.url}</SectionTitle>
          <p className="ag-page">{SUPPLIER_PAGE.text}</p>
          <p className="ag-untrusted"><b>untrusted</b> {UNTRUSTED_MARKER}</p>
          <Hint tone="muted" block>The block above is an abstract placeholder for text that tries to give the agent an instruction. It is never a real wording. Task: "summarise the page".</Hint>
        </Box>
        {run.pending && (
          <Box>
            <SectionTitle hint="the loop is paused">Approval needed</SectionTitle>
            <p className="ag-approve">The agent wants to run <code>{callText(run.pending)}</code>, which the task did not ask for.</p>
            <div className="ag-approve-buttons">
              <Button variant="primary" onClick={() => decide('approve')}>Approve</Button>
              <Button onClick={() => decide('deny')}>Deny</Button>
            </div>
          </Box>
        )}
        <EventLog events={run.events} title="What the agent did" />
        <div ref={result} tabIndex={-1} className="ag-result" aria-label="Fake outbox">
          <Outbox run={run} />
        </div>
        <ProvenanceRow>
          <Provenance kind="scripted">scripted policies, not an LLM; the naive rule is invented to show the risk</Provenance>
          <Provenance kind="illustrative">invented page, placeholder text and fake outbox: nothing is fetched or sent</Provenance>
          <Provenance kind="from-memory">the position that permissions and a gate are the defence, not prompt wording, is common current guidance, from memory</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
