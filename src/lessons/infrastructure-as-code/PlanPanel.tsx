import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { Button } from '../../components/ui';
import { plural } from '../../core/format';
import { toneVar } from '../../core/tone';
import { isNoop, type Plan } from './model';
import { destroyed, planLines } from './view';

/** The plan as colour-coded lines, and (while `reviewing`) the checkpoint that asks to approve or reject it. */
export function PlanPanel({ plan, reviewing, onApprove, onReject }: { plan: Plan | null; reviewing: boolean; onApprove: () => void; onReject: () => void }) {
  if (!plan) {
    return (
      <Box className="iac-plan">
        <SectionTitle hint="press Plan">Plan</SectionTitle>
        <p className="empty-note">No plan yet. Plan compares the config with the state and with what really exists.</p>
      </Box>
    );
  }
  const lines = planLines(plan);
  const doomed = destroyed(plan);
  return (
    <Box className="iac-plan">
      <SectionTitle hint="diff of config, state and cloud">Plan</SectionTitle>
      <CodePanel
        lines={lines.map((l) => l.text)}
        gutter="none"
        renderLine={(text, i) => <span style={lines[i].tone === 'plain' ? undefined : { color: toneVar(lines[i].tone as Exclude<(typeof lines)[number]['tone'], 'plain'>) }}>{text}</span>}
      />
      {reviewing && !isNoop(plan) && (
        <div className="iac-review" role="group" aria-label="Review the plan">
          <p>
            <b>Review the plan.</b>{' '}
            {doomed.length > 0 ? (
              <span className="iac-destroys">
                It destroys {plural(doomed.length, 'resource')}: {doomed.join(', ')}.
              </span>
            ) : (
              'It destroys nothing.'
            )}
          </p>
          <div className="iac-review-buttons">
            <Button variant={doomed.length > 0 ? 'danger' : 'primary'} onClick={onApprove}>
              Approve and apply
            </Button>
            <Button onClick={onReject}>Reject</Button>
          </div>
        </div>
      )}
    </Box>
  );
}
