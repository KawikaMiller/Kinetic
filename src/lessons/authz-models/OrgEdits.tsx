import { Button, Toggle } from '../../components/ui';
import { setCycle, setShare } from './edits';
import { defaultOrg, type Org } from './org';

/** The two edits that add something a model must express, and a reset: shared by the scenes that work on the organisation. */
export function OrgEdits({ org, setOrg }: { org: Org; setOrg: (next: Org) => void }) {
  return (
    <>
      <Toggle label="Share the Roadmap with Erin" value={org.share} onChange={(v) => setOrg(setShare(org, v))} off="not shared" on="shared for a week" />
      <Toggle label="Engineering clearance groups" value={org.cycle} onChange={(v) => setOrg(setCycle(org, v))} off="a ladder" on="a loop (ReBAC)" />
      <Button onClick={() => setOrg(defaultOrg())}>Reset organisation</Button>
    </>
  );
}
