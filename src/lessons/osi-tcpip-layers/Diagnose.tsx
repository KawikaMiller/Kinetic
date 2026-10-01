import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { LAYERS, layer, score, SYMPTOMS, type LayerId } from './model';

type Placed = Partial<Record<string, LayerId>>;

export function Diagnose({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [placed, setPlaced] = useState<Placed>({});
  const [checked, setChecked] = useState(false);
  const placedCount = Object.keys(placed).length;
  const correct = score(placed);

  useIntroCaption(<>Six real symptoms. Put each on the layer where the problem lives: that's where you'd start debugging.</>);

  const place = (id: string, layerId: LayerId) => {
    setPlaced((p) => ({ ...p, [id]: layerId }));
    setChecked(false);
  };

  const check = () => {
    setChecked(true);
    setCaption(
      correct === SYMPTOMS.length
        ? <><span className="hl ok">All {SYMPTOMS.length} right.</span> Knowing the layer tells you which tool to reach for: DNS lookup, port check, HTTP logs, the cable.</>
        : <><span className="hl">{correct} of {SYMPTOMS.length}</span> right. Read the red cards' explanations, move them and check again.</>,
    );
  };

  const reset = () => {
    setPlaced({});
    setChecked(false);
    setCaption(<>Cleared. Place each symptom on a layer, then check.</>);
  };

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Placed" value={`${placedCount}/${SYMPTOMS.length}`} color="var(--info)" />
          <Stat label="Correct" value={checked ? `${correct}/${SYMPTOMS.length}` : '?'} color={checked ? (correct === SYMPTOMS.length ? 'var(--ok)' : 'var(--hi)') : undefined} sub={checked ? 'checked' : 'press Check'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={check} disabled={placedCount === 0}>Check answers</Button>
          <Button onClick={reset}>Reset</Button>
        </>,
        <Hint key="note" block>Answers use the 4-layer TCP/IP model; the explanations give the OSI number where it differs.</Hint>,
      ]}
    >
      <ul className="osi-cards stage-pad">
        {SYMPTOMS.map((s) => {
          const choice = placed[s.id];
          const verdict = checked && choice ? (choice === s.answer ? 'is-right' : 'is-wrong') : '';
          return (
            <li key={s.id} className={`osi-card ${verdict}`}>
              <p className="osi-card-text">{s.text}</p>
              <div className="osi-card-layers" role="group" aria-label={`Layer for: ${s.text}`}>
                {LAYERS.map((l) => (
                  <ChipButton key={l.id} tone={l.tone} on={choice === l.id} onClick={() => place(s.id, l.id)}>
                    {l.name}
                  </ChipButton>
                ))}
              </div>
              {verdict && (
                <p className="osi-card-why">
                  {verdict === 'is-right' ? '✓ ' : <>✗ It's <b>{layer(s.answer).name}</b>. </>}
                  {s.why}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </StageFrame>
  );
}
