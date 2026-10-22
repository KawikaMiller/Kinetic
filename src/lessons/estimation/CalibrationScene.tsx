import { useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { sig } from '../../core/format';
import { calibrationCaption } from './captions';
import { QUANTITIES, readGuess, scoreCalibration, type Guess } from './model';
import { OPENING } from './opening';

/** Scene 4: eight quantities that code computes exactly; the learner gives a 90% range for each. */
export function CalibrationScene({ picker }: { picker: ReactNode }) {
  const [guesses, setGuesses] = useState<Guess[]>(OPENING.calibration.guesses);
  const [scored, setScored] = useState(OPENING.calibration.scored);
  const rows = QUANTITIES.map((q, i) => readGuess(guesses[i], q.value));
  const score = scoreCalibration(rows);

  const edit = (i: number, part: keyof Guess, text: string) => {
    setGuesses((gs) => gs.map((g, k) => (k === i ? { ...g, [part]: text } : g)));
    setScored(false);
  };

  return (
    <StageFrame
      height={520}
      intro={calibrationCaption(score, scored, QUANTITIES.length)}
      introKey={[JSON.stringify(guesses), scored]}
      stats={
        <Stats>
          <Stat label="Answered" value={`${score.answered} of ${QUANTITIES.length}`} />
          <Stat label="Ranges that held the truth" value={scored ? `${score.hits} of ${score.answered}` : '–'} color={scored ? 'var(--hi)' : undefined} sub={scored ? `about ${sig(score.expected, 2)} expected if 90% were true` : 'press Score my ranges'} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'the range held the true value' }, { color: 'var(--bad)', label: 'the range missed it' }]} />}
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => setScored(true)}>Score my ranges</Button>
          <Button onClick={() => { setGuesses(OPENING.calibration.guesses()); setScored(OPENING.calibration.scored); }}>Clear all</Button>
        </>,
      ]}
    >
      <div className="es-stage stage-pad">
        <Hint tone="muted" block>For each quantity, give a low and a high you are 90% sure the true value sits between. Commas are fine; leave a row blank to skip it.</Hint>
        <ul className="es-quantities">
          {QUANTITIES.map((q, i) => {
            const row = rows[i];
            return (
              <li key={q.id} className="es-quantity">
                <span className="es-quantity-label">{q.label}</span>
                <TextField label="Low" ariaLabel={`${q.label}: low`} value={guesses[i].low} width={150} onChange={(v) => edit(i, 'low', v)} />
                <TextField label="High" ariaLabel={`${q.label}: high`} value={guesses[i].high} width={150} onChange={(v) => edit(i, 'high', v)} />
                {row.kind === 'refused' && <span className="es-refusal">{row.reason}</span>}
                {scored && row.kind === 'answered' && (
                  <span className={row.hit ? 'es-hit' : 'es-miss'}>{row.hit ? 'held' : 'missed'}: the true value is {q.value.toLocaleString('en-US')}</span>
                )}
              </li>
            );
          })}
        </ul>
        <ProvenanceRow>
          <ClaimLabel kind="research">people&apos;s stated 90% ranges tend to contain the truth much less often than 90% of the time: from memory, check the calibration literature</ClaimLabel>
          <Provenance kind="real">each true value is computed by code when the page loads, not typed</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
