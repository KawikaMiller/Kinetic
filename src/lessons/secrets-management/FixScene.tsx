import { useState, type ReactNode } from 'react';
import { CommitGraph } from '../../components/CommitGraph';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ConfigCode } from './ConfigCode';
import { GRAPH_SPACING, graphCommits } from './graph';
import { applyFix, scan, type FixId } from './model';

const FIXES: { value: FixId; label: string }[] = [
  { value: 'delete', label: '1 · Delete the line' },
  { value: 'gitignore', label: '2 · Add it to .gitignore' },
  { value: 'rotate', label: '3 · Rotate the key' },
  { value: 'prevent', label: '4 · Prevent it' },
];

export function FixScene({ picker }: { picker: ReactNode }) {
  const [fix, setFix] = useState<FixId>('delete');
  const setCaption = useSetCaption();
  const o = applyFix(fix);
  const head = o.commits[o.commits.length - 1];
  const files = Object.entries(head.files);
  const headFindings = files.flatMap(([path, text]) => scan(text).map((f) => ({ path, ...f })));

  useIntroCaption(<>The key leaked. Try each fix and watch two things: is the key still in the history, and does it still work?</>);

  const choose = (next: FixId) => {
    setFix(next);
    setCaption(<>{applyFix(next).verdict}</>, { quiet: true });
  };

  return (
    <StageFrame
      height={540}
      stats={
        <Stats>
          <Stat label="Key in history" value={o.stillInHistory.length ? `${o.stillInHistory.length} commit${o.stillInHistory.length === 1 ? '' : 's'}` : 'none'} color={!o.stillInHistory.length ? 'var(--ok)' : o.keyWorks ? 'var(--bad)' : 'var(--dim)'} sub={o.stillInHistory.length && !o.keyWorks ? 'but the key is dead' : undefined} />
          <Stat label="Key still works" value={o.keyWorks && fix !== 'prevent' ? 'yes' : fix === 'prevent' ? 'never leaked' : 'no, revoked'} color={o.keyWorks && fix !== 'prevent' ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Leak fixed" value={fix === 'rotate' || fix === 'prevent' ? 'yes' : 'no'} color={fix === 'rotate' || fix === 'prevent' ? 'var(--ok)' : 'var(--bad)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'live secret' },
            { color: 'var(--dim)', label: 'revoked (dead) key' },
            { color: 'var(--ok)', label: 'safe reference' },
            { color: 'var(--info)', label: 'commit' },
          ]}
        />
      }
      controls={[picker, <Segmented key="fix" label="Try a fix" value={fix} onChange={choose} options={FIXES} />]}
    >
      <div className="stage-pad sm">
        <CommitGraph commits={graphCommits(o.commits, o.keyWorks)} refs={[{ name: 'main', at: o.tip, head: true }]} title="history after the fix" messageFit="truncate" spacing={GRAPH_SPACING} />
        <div className="sm-pair">
          <ConfigCode title={`config.js at ${head.id} (latest)`} text={head.files['config.js']} keyDead={!o.keyWorks} />
          <Box className="sm-facts">
            <SectionTitle>What this did</SectionTitle>
            <ul>
              <li className={`log-row ${!o.stillInHistory.length ? 'tone-ok' : o.keyWorks ? 'tone-bad' : 'tone-dim'}`}>
                {!o.stillInHistory.length
                  ? 'No commit contains the key'
                  : o.keyWorks
                    ? `Key still in history: ${o.stillInHistory.join(', ')}`
                    : `Dead key still in history: ${o.stillInHistory.join(', ')} (harmless now)`}
              </li>
              <li className={`log-row ${fix === 'gitignore' ? 'tone-bad' : 'tone-dim'}`}>
                config.js {o.configTracked ? 'is tracked' : 'is not tracked'}{fix === 'gitignore' ? ', despite .gitignore' : ''}
              </li>
              <li className={`log-row ${o.keyWorks && fix !== 'prevent' ? 'tone-bad' : 'tone-ok'}`}>
                {fix === 'prevent' ? 'The key never reached git' : o.keyWorks ? 'The leaked key still works' : 'The leaked key is revoked'}
              </li>
              {headFindings.length > 0 && (
                <li className="log-row tone-bad">A secret scanner would flag {headFindings[0].path} line {headFindings[0].line}</li>
              )}
            </ul>
            {fix === 'prevent' && (
              <ol className="sm-steps">
                <li><code>.env</code> in <code>.gitignore</code> from the first commit</li>
                <li>Code reads <code className="sm-env">process.env.STRIPE_KEY</code> at runtime</li>
                <li>A secret manager injects the value at deploy</li>
                <li>A pre-commit secret scanner blocks a commit that contains a key</li>
              </ol>
            )}
          </Box>
        </div>
        <p className="sm-honest">
          Rewriting history (e.g. git filter-repo) can scrub the key from your repo, but every clone, fork and bot already has a
          copy. Once a key is public, rotating it is the only real fix.
        </p>
      </div>
    </StageFrame>
  );
}
