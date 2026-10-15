import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { binExplanation, riceCaption } from './captions';
import { BIN_LABEL, BINS, isRight, RICE_CARDS, type Bin, type Placement } from './rice';

const NONE = 'none' as const;
type Choice = Bin | typeof NONE;
const SHORT: Record<Bin, string> = { read: 'Read it', bounded: 'Run it', rice: 'Undecidable', trivial: 'Trivial' };

/** Scene 3: eight properties of programs sorted into the class each belongs to; a wrong sort explains the class. */
export function RiceScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [choices, setChoices] = useState<Record<string, Bin | null>>({});
  const placements = useMemo<Placement[]>(() => RICE_CARDS.map((card) => ({ card, chosen: choices[card.id] ?? null })), [choices]);
  const sorted = placements.filter((p) => p.chosen !== null);
  const right = sorted.filter(isRight).length;

  useEffect(() => {
    setCaption(riceCaption(placements), { quiet: true });
  }, [setCaption, placements]);

  return (
    <StageFrame
      height={640}
      stats={
        <Stats>
          <Stat label="Sorted" value={`${sorted.length} of ${RICE_CARDS.length}`} />
          <Stat label="In the right class" value={right} color={right > 0 ? 'var(--ok)' : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'sorted into the right class', shape: 'square' },
            { color: 'var(--bad)', label: 'sorted wrong: the reason is shown', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setChoices({})}>Clear the sort</Button>
        </>,
      ]}
    >
      <div className="hp stage-pad">
        <Box variant="sunken">
          <SectionTitle>Rice’s theorem</SectionTitle>
          <p className="hp-note">
            A property of programs is <b>semantic</b> when it depends only on the function the program computes: two programs that compute the same function both have it or both lack it. It is <b>non-trivial</b> when some programs have it and some do not. Rice’s theorem: every non-trivial semantic property of programs is undecidable.
          </p>
          <ClaimLabel kind="standard">a textbook theorem (Rice, 1953), stated here and argued from the halting problem, not proved on this page</ClaimLabel>
        </Box>
        <ol className="hp-cards">
          {placements.map((pl, i) => (
            <li key={pl.card.id} className="hp-card">
              <p className="hp-card-text">{pl.card.text}</p>
              <Segmented<Choice>
                ariaLabel={`Class for property ${i + 1}: ${pl.card.text}`}
                value={pl.chosen ?? NONE}
                onChange={(bin) => bin !== NONE && setChoices({ ...choices, [pl.card.id]: bin })}
                options={BINS.map((b) => ({ value: b, label: SHORT[b] }))}
              />
              {pl.chosen && (
                <p className={`hp-feedback ${isRight(pl) ? 'is-ok' : 'is-bad'}`}>
                  <b>{binExplanation(pl)}</b> {pl.card.reason}
                </p>
              )}
            </li>
          ))}
        </ol>
        <ul className="hp-bins">
          {BINS.map((b) => (
            <li key={b}><b>{SHORT[b]}</b>: {BIN_LABEL[b]}</li>
          ))}
        </ul>
        <ProvenanceRow>
          <Provenance kind="toy">eight hand-picked properties; the two decidable-by-running cases have real deciders that the tests run</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
