import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pct } from '../../core/format';
import { GAUGES, GAUGE_IDS, POOL_TIMEOUT_SECONDS, SYMPTOMS, WRONG_GUESS_MINUTES, check, symptomOrder, type Check, type GaugeId } from './model';
import { LessonRef } from './GaugeRow';

const SEED = 3;

const MECHANISM: Record<GaugeId, string> = {
  disk: 'The disk has no free blocks left, so every write fails. A deleted file that a process still holds open keeps its bytes too.',
  inodes: 'The file system ran out of inodes, the records that name files. Free bytes cannot help: no new file can be created.',
  fds: 'The process hit its limit on open descriptors. Sockets, files and pipes all count, so everything that opens one fails.',
  pool: `Every connection in the pool is checked out and never came back. Callers wait for one until the acquire timeout (${POOL_TIMEOUT_SECONDS} s in this scenario; the connection-pooling lesson uses 1 s to keep its simulation short), then fail.`,
  ports: 'Each outgoing connection needs a local port, and a closed one stays reserved for a minute (TIME_WAIT). Under heavy traffic to one upstream address and port the range runs out.',
  memory: 'The cache never evicts, so memory grows until the container limit. The kernel kills the process with SIGKILL, with no chance to log anything.',
};

export function GameScene({ picker }: { picker: ReactNode }) {
  const order = useMemo(() => symptomOrder(SEED), []);
  const [index, setIndex] = useState(0);
  const [checked, setChecked] = useState<Partial<Record<GaugeId, Check>>>({});
  const [lost, setLost] = useState(0);

  const finished = index >= order.length;
  const answer = finished ? null : order[index];
  const found = answer !== null && checked[answer] !== undefined;

  const guess = (g: GaugeId) => {
    if (answer === null || checked[g] || found) return;
    const c = check(answer, g);
    setChecked((prev) => ({ ...prev, [g]: c }));
    setLost((m) => m + c.minutesLost);
  };
  const next = () => {
    setIndex(index + 1);
    setChecked({});
  };
  const restart = () => {
    setIndex(0);
    setChecked({});
    setLost(0);
  };

  useIntroCaption(
    finished ? (
      <>
        All six found, <b>{lost} minutes</b> lost to wrong guesses. Each wrong gauge costs {WRONG_GUESS_MINUTES} minutes in this game.
      </>
    ) : found && answer !== null ? (
      <>
        It was <span className="hl ok wrap">{GAUGES[answer].label}</span>: {MECHANISM[answer]}
      </>
    ) : (
      <>
        Symptom {index + 1} of {order.length}. Pick the gauge to check: a wrong one costs {WRONG_GUESS_MINUTES} minutes.
      </>
    ),
    [finished, found, answer, lost, index],
  );

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Symptom" value={`${Math.min(index + 1, order.length)} / ${order.length}`} />
          <Stat label="Time lost" value={`${lost} min`} color={lost > 0 ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the culprit', shape: 'square' },
            { color: 'var(--dim)', label: 'ruled out', shape: 'square' },
          ]}
        />
      }
      controls={[picker]}
    >
      <div className="re stage-pad">
        {answer === null ? (
          <div className="box re-symptom">
            <b>Done.</b> You lost {lost} minutes. An 80% alert on each gauge would have warned you first: hours earlier for the slow leaks, seconds earlier for the ports.
            <div>
              <Button variant="primary" onClick={restart}>
                Play again
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="box re-symptom">
              <span className="section-title">The page says</span>
              <p>{SYMPTOMS[answer]}</p>
            </div>
            <div className="re-picks" role="group" aria-label="Which gauge do you check?">
              {GAUGE_IDS.map((g) => {
                const c = checked[g];
                return (
                  <ChipButton key={g} tone={c ? (c.correct ? 'ok' : 'dim') : 'info'} on={c !== undefined} onStyle="solid" disabled={found && !c} onClick={() => guess(g)}>
                    {GAUGES[g].label}
                  </ChipButton>
                );
              })}
            </div>
            <div className="re-readings">
              {GAUGE_IDS.filter((g) => checked[g]).map((g) => {
                const c = checked[g]!;
                return (
                  <div key={g} className={`log-row tone-${c.correct ? 'ok' : 'dim'}`}>
                    {GAUGES[g].label}: {pct(c.reading, 0)} full. {c.correct ? <>That is it: {GAUGES[g].error}. Taught in <LessonRef id={GAUGES[g].lesson} />.</> : `Not it (+${c.minutesLost} min).`}
                  </div>
                );
              })}
            </div>
            {found && (
              <div>
                <Button variant="primary" onClick={next}>
                  {index + 1 < order.length ? 'Next symptom' : 'Finish'}
                </Button>
              </div>
            )}
          </>
        )}
        <Hint block>Simulated incidents: the readings come from the lesson&apos;s model at the moment each limit is hit, the symptoms are typical rather than exact, and the ten-minute penalty is a game rule.</Hint>
      </div>
    </StageFrame>
  );
}
