import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Stat, Stats, TextArea } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { diffCaption } from './frames';
import { applyDiff, CONFIG_V1, CONFIG_V2, diffLines, MAX_LINE_CHARS, MAX_LINES, parseConfig } from './model';

export function DiffScene({ picker }: { picker: ReactNode }) {
  const [v1, setV1] = useState(CONFIG_V1);
  const [v2, setV2] = useState(CONFIG_V2);
  const [draft1, setDraft1] = useState(CONFIG_V1);
  const [draft2, setDraft2] = useState(CONFIG_V2);
  const [error, setError] = useState<string | null>(null);
  const diff = useMemo(() => diffLines(v1, v2), [v1, v2]);
  const applies = applyDiff(v1, diff) === v2;
  const removed = diff.filter((l) => l.sign === '-').length;
  const added = diff.filter((l) => l.sign === '+').length;
  const kept = diff.length - removed - added;

  useIntroCaption(diffCaption(removed, added, kept, applies), [removed, added, kept, applies]);

  const apply = () => {
    const r1 = parseConfig(draft1, 'Version 1');
    if (!r1.ok) return setError(r1.error);
    const r2 = parseConfig(draft2, 'Version 2');
    if (!r2.ok) return setError(r2.error);
    setV1(r1.value);
    setV2(r2.value);
    setError(null);
  };
  const reset = () => {
    setV1(CONFIG_V1);
    setV2(CONFIG_V2);
    setDraft1(CONFIG_V1);
    setDraft2(CONFIG_V2);
    setError(null);
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Removed" value={removed} color="var(--bad)" sub="lines" />
          <Stat label="Added" value={added} color="var(--ok)" sub="lines" />
          <Stat label="Unchanged" value={kept} color="var(--muted)" sub="a longest common subsequence" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: '− removed' },
            { color: 'var(--ok)', label: '+ added' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={apply}>Diff these</Button>
          <Button onClick={reset}>Reset</Button>
          <Hint tone={error ? 'muted' : 'faint'} className="ed-note">
            <span role="status">{error ?? `Up to ${MAX_LINES} lines of ${MAX_LINE_CHARS} characters per version.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="ed stage-pad">
        <div className="ed-versions">
          <TextArea label="Version 1" value={draft1} onChange={setDraft1} rows={8} className="ed-version" />
          <TextArea label="Version 2" value={draft2} onChange={setDraft2} rows={8} className="ed-version" />
        </div>
        <CodePanel
          title="diff: version 1 → version 2"
          lines={diff.map((l) => `${l.sign} ${l.text}`)}
          gutter="none"
          stateOf={(i) => (diff[i].sign === '+' ? 'add' : diff[i].sign === '-' ? 'del' : 'idle')}
          className="ed-code"
        />
        <Hint block>
          The same table as the word scene, run over whole lines, with substitution ruled out: a changed line is a delete plus an insert.
          Myers' O(ND) algorithm, git's default, solves the same shortest-script problem much faster (on big files git trades a little
          minimality for speed unless you pass --minimal), and may pick a different script when several are equally short.
        </Hint>
      </div>
    </StageFrame>
  );
}
