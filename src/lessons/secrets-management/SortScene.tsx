import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { ITEMS, type Bucket } from './model';

const BUCKETS: { id: Bucket; label: string; where: string }[] = [
  { id: 'code', label: 'Code', where: 'in the repo' },
  { id: 'config', label: 'Config', where: 'environment variables / config files' },
  { id: 'secret', label: 'Secret', where: 'a secret manager or env, never git' },
];

export function SortScene({ picker }: { picker: ReactNode }) {
  const [picks, setPicks] = useState<Record<string, Bucket>>({});
  const setCaption = useSetCaption();
  const answered = ITEMS.filter((i) => picks[i.id]);
  const right = answered.filter((i) => picks[i.id] === i.answer).length;

  useIntroCaption(<>Not everything belongs in the repository. Put each value where it should live.</>);

  const pick = (id: string, bucket: Bucket) => {
    setPicks((p) => ({ ...p, [id]: bucket }));
    const item = ITEMS.find((i) => i.id === id)!;
    setCaption(
      bucket === item.answer ? <><span className="hl ok">Right.</span> {item.why}</> : <><span className="hl bad">Not quite:</span> it&apos;s {item.answer}. {item.why}</>,
      { quiet: true },
    );
  };

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Sorted" value={`${answered.length} of ${ITEMS.length}`} color="var(--info)" />
          <Stat label="Right" value={right} color="var(--ok)" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'right place' }, { color: 'var(--bad)', label: 'wrong place' }]} />}
      controls={[picker, <Button key="reset" onClick={() => setPicks({})}>Start again</Button>]}
    >
      <div className="stage-pad sm">
        <div className="sm-buckets">
          {BUCKETS.map((b) => (
            <div key={b.id} className={`sm-bucket sm-bucket-${b.id}`}>
              <b>{b.label}</b>
              <span>{b.where}</span>
            </div>
          ))}
        </div>
        <ul className="sm-items">
          {ITEMS.map((item) => {
            const chosen = picks[item.id];
            const tone = !chosen ? '' : chosen === item.answer ? 'tone-ok' : 'tone-bad';
            return (
              <li key={item.id} className={`sm-item ${tone}`}>
                <span className="sm-item-label">{item.label}</span>
                <span className="sm-item-picks" role="group" aria-label={`Where does "${item.label}" belong?`}>
                  {BUCKETS.map((b) => (
                    <button key={b.id} type="button" className={`sm-pick ${chosen === b.id ? 'is-on' : ''}`} aria-pressed={chosen === b.id} onClick={() => pick(item.id, b.id)}>
                      {b.label}
                    </button>
                  ))}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </StageFrame>
  );
}
