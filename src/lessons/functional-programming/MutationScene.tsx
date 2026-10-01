import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { CodePanel } from '../../components/CodePanel';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Segmented } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { applyMethod, METHOD_CODE, METHOD_LABEL, SCORES, type ArrayMethod } from './model';

const METHODS: ArrayMethod[] = ['sort', 'toSorted', 'spreadSort', 'reverse', 'toReversed'];
const CELL_MAX = 56;

export function MutationScene({ picker }: { picker: ReactNode }) {
  const [method, setMethod] = useState<ArrayMethod>('sort');
  const [ran, setRan] = useState(false);
  const result = useMemo(() => applyMethod(method), [method]);
  const setCaption = useSetCaption();
  useIntroCaption(
    <>Two parts of an app share one array of scores. The leaderboard wants them sorted; the entry log wants them in the order people entered. Press Run it.</>,
  );

  const lines = ['const scores = [42, 7, 19]; // the order people entered', METHOD_CODE[method], '', 'leaderboard.show(ranked);', 'entryLog.show(scores);'];
  const scores = ran ? result.scoresAfter : [...SCORES];
  const broken = ran && result.mutated;

  const pick = (m: ArrayMethod) => {
    setMethod(m);
    setRan(false);
    setCaption(<>Switched to <code>{METHOD_LABEL[m]}</code>. Press Run it.</>);
  };

  const run = () => {
    setRan(true);
    setCaption(
      result.mutated ? (
        <>
          <code>{METHOD_LABEL[method]}</code> changed <b>scores itself</b> and handed back the same array: the entry log reordered
          without anyone touching it. <span className="hl bad">It does not return a new array.</span>
        </>
      ) : (
        <>
          <code>{METHOD_LABEL[method]}</code> made a <b>new</b> array. The leaderboard gets its order; the entry log is{' '}
          <span className="hl ok">untouched</span>.
        </>
      ),
    );
  };

  return (
    <StageFrame
      height={360}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'changed unexpectedly' },
            { color: 'var(--ok)', label: 'unchanged' },
            { color: 'var(--violet)', label: 'one array, two names' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Method" value={method} onChange={pick} options={METHODS.map((m) => ({ value: m, label: METHOD_LABEL[m] }))} />
        </>,
        <>
          <Button variant="primary" onClick={run} disabled={ran}>
            Run it
          </Button>
          <Button onClick={() => pick(method)} disabled={!ran}>
            Reset
          </Button>
        </>,
      ]}
    >
      <div className="fp stage-pad fp-mutation">
        <CodePanel title="The code" lines={lines} active={ran ? 1 : null} />
        <div className="fp-consumers">
          <Box className="fp-consumer">
            <SectionTitle hint="shows ranked">Leaderboard</SectionTitle>
            {ran ? (
              <ArrayStrip values={result.ranked} cellMax={CELL_MAX} ranges={[{ from: 0, to: result.ranked.length - 1, tone: 'ok' }]} />
            ) : (
              <span className="empty-note">not run yet</span>
            )}
          </Box>
          <Box className={`fp-consumer ${broken ? 'is-bad' : ran ? 'is-ok' : ''}`}>
            <SectionTitle hint="shows scores, expects entry order">Entry log</SectionTitle>
            <ArrayStrip values={scores} cellMax={CELL_MAX} cellState={() => (broken ? 'bad' : 'idle')} />
            {ran && (
              <span className={`fp-verdict ${broken ? 'is-bad' : 'is-ok'}`}>
                {broken ? 'reordered, though entryLog never touched it' : 'still in entry order'}
              </span>
            )}
          </Box>
          {ran && (
            <span className={`chip ${result.sameArray ? 'tone-violet' : 'tone-ok'} fp-same`}>
              ranked === scores → {String(result.sameArray)}
              {result.sameArray ? ': one array, two names' : ': two separate arrays'}
            </span>
          )}
        </div>
      </div>
    </StageFrame>
  );
}
