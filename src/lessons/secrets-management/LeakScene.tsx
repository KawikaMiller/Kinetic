import { useMemo, type ReactNode } from 'react';
import { CommitGraph } from '../../components/CommitGraph';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { ConfigCode } from './ConfigCode';
import { GRAPH_SPACING, graphCommits } from './graph';
import { TIMELINE, leakFrames } from './frames';
import { LEAK_HISTORY, scan } from './model';

export function LeakScene({ picker }: { picker: ReactNode }) {
  const frames = useMemo(() => leakFrames(), []);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;
  const commits = LEAK_HISTORY.slice(0, f.commits);
  const tip = commits[commits.length - 1].id;
  const config = LEAK_HISTORY[1].files['config.js'];
  const finding = scan(config)[0];

  return (
    <StageFrame
      player={player}
      height={520}
      stats={
        <Stats>
          <Stat label="In the repo" value={f.commits > 1 ? 'yes' : 'not yet'} color={f.commits > 1 ? 'var(--bad)' : undefined} />
          <Stat label="Public" value={f.pushed ? 'yes' : 'no'} color={f.pushed ? 'var(--bad)' : undefined} />
          <Stat label="Misused" value={f.misused ? '214 calls' : 'no'} color={f.misused ? 'var(--bad)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the secret, and the commit holding it' },
            { color: 'var(--info)', label: 'ordinary commit' },
            { color: 'var(--ok)', label: 'a safe reference (process.env)' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="stage-pad sm">
        <div className="sm-pair">
          {f.events >= 1 ? <ConfigCode title="config.js" text={config} /> : <Box className="sm-empty"><span className="empty-note">config.js isn&apos;t written yet</span></Box>}
          <Box className="sm-timeline">
            <SectionTitle hint="scripted timeline">What happens next</SectionTitle>
            <ol>
              {TIMELINE.slice(0, f.events).map((e, i) => (
                <li key={e.at} className={`log-row tone-${e.tone} ${i === f.events - 1 ? 'is-now' : ''}`}>
                  <code>{e.at}</code> {e.text}
                </li>
              ))}
            </ol>
            {f.found && (
              <p className="sm-bot">
                🤖 scanner rule matched on line {finding.line}: <code className="sm-secret">{finding.match}</code>
              </p>
            )}
          </Box>
        </div>
        <CommitGraph commits={graphCommits(commits, true)} refs={[{ name: 'main', at: tip, head: true }]} title={f.pushed ? 'github.com/acme/shop (public)' : 'local repository'} messageFit="truncate" spacing={GRAPH_SPACING} className="sm-graph" />
        <p className="sm-honest">Scripted timeline with a fake key. Real bots do scan public pushes, typically within minutes.</p>
      </div>
    </StageFrame>
  );
}
