import { useEffect, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { FAULT_REASON, SENTENCES, correctIndex } from './blame';
import { blameCaption } from './captions';

export function BlameScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [picks, setPicks] = useState<Readonly<Record<string, number>>>({});
  const [last, setLast] = useState<string | null>(null);
  const done = SENTENCES.filter((s) => picks[s.id] === correctIndex(s)).length;

  useEffect(() => {
    setCaption(blameCaption(picks, last), { quiet: true });
  }, [setCaption, picks, last]);

  const pick = (id: string, i: number) => {
    setPicks((p) => ({ ...p, [id]: i }));
    setLast(id);
  };

  return (
    <StageFrame
      height={560}
      stats={
        <Stats>
          <Stat label="Rewritten" value={`${done} of ${SENTENCES.length}`} color={done === SENTENCES.length ? 'var(--ok)' : undefined} sub="name a condition, not a person" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'names a condition of the system', shape: 'square' },
            { color: 'var(--bad)', label: 'still blames, or names nothing', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => { setPicks({}); setLast(null); }}>Start over</Button>
        </>,
      ]}
    >
      <div className="pm stage-pad">
        <ol className="pm-sentences">
          {SENTENCES.map((s) => {
            const chosen = picks[s.id];
            return (
              <li key={s.id} className="pm-sentence">
                <p className="pm-blame">“{s.blame}”</p>
                <div className="pm-rewrites" role="group" aria-label={`Rewrites of: ${s.blame}`}>
                  {s.rewrites.map((r, i) => (
                    <ChipButton
                      key={r.text}
                      size="md"
                      tone={chosen === i ? (r.fault ? 'bad' : 'ok') : 'muted'}
                      on={chosen === i}
                      onStyle="solid"
                      onClick={() => pick(s.id, i)}
                    >
                      {r.text}
                    </ChipButton>
                  ))}
                </div>
                {chosen !== undefined && (
                  <p className={`pm-verdict ${s.rewrites[chosen].fault ? 'is-bad' : 'is-ok'}`}>
                    {s.rewrites[chosen].fault ? FAULT_REASON[s.rewrites[chosen].fault!] : 'Names a condition of the system: it can be checked, owned and fixed.'}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        <ProvenanceRow>
          <Provenance kind="invented">invented incident, invented names</Provenance>
          <ClaimLabel kind="practice">blameless wording is common practice in incident reviews; teams differ on how far it goes</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
