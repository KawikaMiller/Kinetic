import { useEffect, useMemo, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { usePlayer } from '../../core/usePlayer';
import { genOf, type Config } from './config';
import { configRows } from './ConfigControls';
import { playerFrames, shrinkFrames, show } from './frames';
import { replayIdentical } from './replay';
import { DEFAULT_CASES } from './generator';
import { SHRINK_STEP_LIMIT, findAndShrink } from './runner';
import { bugOf } from './sorts';
import { Values } from './Values';

const SHRINK_INTERVAL_MS = 260;
export function ShrinkScene({ picker, config, set }: { picker: ReactNode; config: Config; set: (patch: Partial<Config>) => void }) {
  const bug = bugOf(config.fn);
  const found = useMemo(() => findAndShrink(bug.fn, config.props, genOf(config)), [bug, config]);
  const frames = useMemo(() => (found ? shrinkFrames(found.shrunk, found.run.failure!.k) : []), [found]);
  const setCaption = useSetCaption();
  const player = usePlayer(playerFrames(frames), { interval: SHRINK_INTERVAL_MS, autoplay: false });
  const f = player.frame;

  useEffect(() => {
    if (!found) {
      setCaption(<>No case fails in this setup, so there is nothing to shrink. Pick a buggy function, or tick a property it breaks, then come back.</>, { quiet: true });
    }
  }, [setCaption, found]);

  const same = useMemo(() => (found ? replayIdentical(config) : null), [found, config]);

  return (
    <StageFrame
      height={500}
      player={found ? player : undefined}
      stats={
        <Stats>
          <Stat label="Found input" value={found ? `${found.run.failure!.input.length} values` : 'none'} sub={found ? `case ${found.run.failure!.k}` : 'no failing case'} />
          <Stat
            label="Smallest reached"
            value={found && player.atEnd ? `${found.shrunk.minimal.length} values` : found ? 'shrinking' : 'none'}
            color="var(--violet)"
            sub={found && player.atEnd ? show(found.shrunk.minimal) : undefined}
          />
          <Stat label="Tries" value={found ? `${f.tried} of ${found.shrunk.steps.length}` : 0} sub={found ? `${f.accepted} accepted · limit ${SHRINK_STEP_LIMIT}` : undefined} />
          <Stat label="Replay from seed" value={same === null ? 'nothing to replay' : same ? 'identical' : 'differs'} color="var(--muted)" sub={`seed ${config.seed}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'input being shrunk', shape: 'square' },
            { color: 'var(--ok)', label: 'accepted: still fails', shape: 'square' },
            { color: 'var(--dim)', label: 'rejected: passes (struck through)', shape: 'square' },
            { color: 'var(--violet)', label: 'smallest failing input', shape: 'square' },
          ]}
        />
      }
      controls={configRows(picker, config, set)}
    >
      <div className="pbt stage-pad">
        {found ? (
          <>
            <Box variant="sunken" className="pbt-shrink">
              <SectionTitle hint="the failing input the shrinker holds">Current</SectionTitle>
              <Values xs={f.current} state={f.verdict === 'done' ? 'minimal' : 'hi'} label="Current failing input" />
              <SectionTitle hint="one simplification of it">Candidate</SectionTitle>
              {f.candidate ? (
                <Values xs={f.candidate} state={f.verdict === 'accepted' ? 'ok' : 'struck'} label={`Candidate, ${f.verdict}`} />
              ) : (
                <span className="pbt-empty">{f.verdict === 'done' ? 'no candidate left that still fails' : 'none yet'}</span>
              )}
            </Box>
            <ul className="pbt-log" aria-label="Recent tries">
              {f.log.map((l, i) => (
                <li key={i} className={l.accepted ? 'is-accepted' : 'is-rejected'}>
                  <span className="chip">{l.accepted ? 'accepted' : 'rejected'}</span> {l.text}
                </li>
              ))}
            </ul>
            <Hint block>Step with the buttons or the arrow keys. Replaying the same seed reproduces the same failing input and the same tries.</Hint>
          </>
        ) : (
          <Box variant="sunken">
            <p>None of the {DEFAULT_CASES} cases failed a ticked property, so there is no failing input to shrink.</p>
          </Box>
        )}
        <div className="pbt-notes">
          <Provenance kind="real">the function under test is real JavaScript</Provenance>
          <Provenance kind="toy">a small shrinker with a {SHRINK_STEP_LIMIT}-step limit; real libraries shrink more cleverly</Provenance>
        </div>
      </div>
    </StageFrame>
  );
}
