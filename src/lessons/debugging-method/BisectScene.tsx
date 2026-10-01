import { useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { randInt } from '../../core/random';
import { bisectDone, COMMIT_COUNT, commitHash, markCommit, nextCommit, START_BISECT, type BisectState } from './model';

/** Commits that could be the first bad one: everything after c0 up to HEAD. */
const OPTIMAL_STEPS = Math.ceil(Math.log2(COMMIT_COUNT - 1));
/** Below this the 16 hash cells overlap, so narrow screens swipe instead. */
const MIN_STRIP_WIDTH = 720;
/** Room for the range labels above the cells and the range outline at the ends. */
const STRIP_GUTTER = { top: 30, bottom: 4, x: 8 };
const HASHES = Array.from({ length: COMMIT_COUNT }, (_, i) => commitHash(i));
const START_LOG = [
  '$ git bisect start',
  `$ git bisect bad ${HASHES[COMMIT_COUNT - 1]}    # HEAD: the bug is there`,
  `$ git bisect good ${HASHES[0]}   # last release: it worked`,
  `# git checks out ${HASHES[nextCommit(START_BISECT)]}`,
];

type Result = 'pass' | 'fail';

export function BisectScene({ picker }: { picker: ReactNode }) {
  const [firstBad, setFirstBad] = useState(() => randInt(1, COMMIT_COUNT - 1));
  const [s, setS] = useState<BisectState>(START_BISECT);
  const [result, setResult] = useState<Result | null>(null);
  const [log, setLog] = useState<string[]>(START_LOG);
  const [lied, setLied] = useState(false);
  /** good/bad marks given so far. */
  const [steps, setSteps] = useState(0);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>
      {COMMIT_COUNT} commits: the oldest works, HEAD is broken. git checks out the commit halfway between, you test it and say good or
      bad, and the range halves. Press Run the test.
    </>,
  );

  const done = bisectDone(s);
  const c = nextCommit(s);
  const truth = (i: number): Result => (i >= firstBad ? 'fail' : 'pass');

  const runTest = () => {
    const r = truth(c);
    setResult(r);
    setCaption(
      r === 'fail' ? (
        <>On {HASHES[c]} the test <span className="hl bad">fails</span>: the bug is already here. Mark it bad.</>
      ) : (
        <>On {HASHES[c]} the test <span className="hl ok">passes</span>: the bug came later. Mark it good.</>
      ),
    );
  };

  const mark = (m: 'good' | 'bad') => {
    const honest = (m === 'bad') === (truth(c) === 'fail');
    const next = markCommit(s, m);
    setS(next);
    setResult(null);
    setLied(lied || !honest);
    setSteps(steps + 1);
    const line = `$ git bisect ${m}`;
    if (bisectDone(next)) {
      const blamed = next.bad;
      setLog((l) => [...l, line, `# ${HASHES[blamed]} is the first bad commit`]);
      setCaption(
        blamed === firstBad ? (
          <>
            git names <span className="hl bad">{HASHES[blamed]}</span> as the first bad commit, after {steps + 1} steps. Checking {COMMIT_COUNT - 1}{' '}
            suspects one by one could take {COMMIT_COUNT - 1}; halving never needs more than {OPTIMAL_STEPS}.
          </>
        ) : (
          <>
            git blamed {HASHES[blamed]}, but the real first bad commit is <span className="hl bad">{HASHES[firstBad]}</span>. git trusted a
            mark that contradicted the test: bisect is only as honest as your answers.
          </>
        ),
      );
    } else {
      setLog((l) => [...l, line, `# git checks out ${HASHES[nextCommit(next)]}`]);
      setCaption(
        honest ? (
          <>Marked {m}. {next.bad - next.good} candidates left: git checks out the middle one, {HASHES[nextCommit(next)]}.</>
        ) : (
          <>You marked it {m}, but the test said otherwise. git can't know: it just halved the wrong way.</>
        ),
      );
    }
  };

  const restart = (newHistory: boolean) => {
    if (newHistory) setFirstBad(randInt(1, COMMIT_COUNT - 1));
    setS(START_BISECT);
    setResult(null);
    setLog(START_LOG);
    setLied(false);
    setSteps(0);
    setCaption(newHistory ? <>A new history with the bug in a different commit. Run the test.</> : <>Back to the start. Run the test.</>);
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="steps" value={steps} color="var(--hi)" sub={`at most ${OPTIMAL_STEPS} for ${COMMIT_COUNT} commits`} />
          <Stat label="candidates" value={s.bad - s.good} sub="could be the first bad commit" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'suspect range / testing now' },
            { color: 'var(--ok)', label: 'known good' },
            { color: 'var(--bad)', label: 'known bad / first bad commit' },
            { color: 'var(--dim)', label: 'ruled out' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={runTest} disabled={done || result !== null}>
            Run the test on {HASHES[c]}
          </Button>
          <Button onClick={() => mark('good')} disabled={done || result === null}>
            git bisect good
          </Button>
          <Button onClick={() => mark('bad')} disabled={done || result === null}>
            git bisect bad
          </Button>
        </>,
        <>
          <Button onClick={() => restart(false)}>Start over</Button>
          <Button onClick={() => restart(true)}>New history</Button>
        </>,
      ]}
    >
      <div className="dm stage-pad dm-bisect">
        <WideRegion minWidth={MIN_STRIP_WIDTH} gutter={STRIP_GUTTER} label="Commit history: scroll sideways to see every commit">
          <ArrayStrip
            values={HASHES}
            fontSize={11}
            showIndex
            cellState={(i) => (done && i === s.bad ? 'bad' : !done && i === c ? 'active' : i <= s.good || i > s.bad ? 'dim' : 'idle')}
            ranges={done ? [] : [{ from: s.good + 1, to: s.bad, labels: ['oldest suspect', 'newest'] }]}
            pointers={[
              { i: s.good, label: 'good', tone: 'ok' },
              { i: s.bad, label: 'bad', tone: 'bad' },
              ...(done ? [] : [{ i: c, label: result === null ? 'test' : result, tone: 'hi' as const, id: 'test' }]),
            ]}
            cellTitle={(i) => `commit ${HASHES[i]}`}
          />
        </WideRegion>
        <ConsolePanel title="terminal" lines={log} />
        {lied && !done && <p className="dm-warn">One of your marks contradicted the test result.</p>}
        <p className="dm-note">A simulated history: each commit's test result is fixed in advance, as it would be if you ran a real test on it.</p>
      </div>
    </StageFrame>
  );
}
