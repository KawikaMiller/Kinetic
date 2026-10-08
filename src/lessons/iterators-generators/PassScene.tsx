import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { ConsolePanel } from '../../components/ConsolePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { passFrames } from './frames';
import { FILE_TEXT, PASS_CODE, SOURCES, SOURCE_CODE, reusable, showArray, twoPasses, type SourceId } from './model';

export function PassScene({ picker }: { picker: ReactNode }) {
  const [source, setSource] = useState<SourceId>('generator');
  const frames = useMemo(() => passFrames(source), [source]);
  const player = usePlayer(frames, { interval: 1600 });
  const f = player.frame;
  const [items] = twoPasses(source);
  const spent = f.pass >= 1 && !reusable(source);
  const lines = [
    ...(f.first ? [showArray(f.first)] : []),
    ...(f.second ? [f.second.length ? showArray(f.second) : { text: showArray(f.second), tone: 'bad' as const }] : []),
  ];

  return (
    <StageFrame
      player={player}
      height={360}
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'values still to come' },
            { color: 'var(--dim)', label: 'already consumed' },
            { color: 'var(--hi)', label: 'line running' },
            { color: 'var(--ok)', label: 'printed' },
            { color: 'var(--bad)', label: 'empty second pass' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Source" value={source} onChange={setSource} options={SOURCES} />
        </>,
      ]}
    >
      <div className="itg stage-pad">
        <ul className="itg-items" aria-label={spent ? 'All values consumed' : 'Values available'}>
          {items.map((x, i) => (
            <li key={i} className={`itg-item tone-${spent ? 'dim' : 'info'}`}>
              {typeof x === 'string' ? x : String(x)}
            </li>
          ))}
          <li className="itg-item-note">{spent ? 'consumed: this iterator is at its end' : reusable(source) ? 'each pass starts a fresh iterator' : 'not read yet'}</li>
        </ul>
        <div className="itg-row">
          <div className="itg-col">
            <CodePanel lines={[...SOURCE_CODE[source], ...PASS_CODE]} active={f.pass === 0 ? null : SOURCE_CODE[source].length + f.pass - 1} className="itg-code" />
            {source === 'file' && <Hint block>accessLog is a fixed three-line string here: {JSON.stringify(FILE_TEXT)}.</Hint>}
          </div>
          <div className="itg-col">
            <ConsolePanel lines={lines} empty="(not run yet)" />
          </div>
        </div>
        <Hint block>Both passes are real JavaScript results, checked in the lesson&apos;s tests.</Hint>
      </div>
    </StageFrame>
  );
}
