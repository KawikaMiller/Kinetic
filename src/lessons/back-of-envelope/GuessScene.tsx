import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import type { Option } from '../../components/options';
import { Button, Hint, Legend, Provenance, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { power } from '../../core/format';
import { sig } from '../distributions/fmt';
import { guessCaption } from './frames';
import { GUESS_EXPONENTS, SCENARIOS, bigText, orderError, scenarioQps, withinTenfold } from './model';

const SCENARIO_OPTIONS: Option<string>[] = SCENARIOS.map((s) => ({ value: s.id, label: s.id === 'chat' ? 'Chat app' : s.id === 'photos' ? 'Photo site' : 'Internal tool' }));
const GUESS_OPTIONS: Option<number>[] = GUESS_EXPONENTS.map((e) => ({ value: e, label: power(e, 10) }));

export function GuessScene({ picker }: { picker: ReactNode }) {
  const [scenarioId, setScenarioId] = useState('chat');
  const [guess, setGuess] = useState<number | null>(null);
  const scenario = SCENARIOS.find((s) => s.id === scenarioId)!;
  const truth = scenarioQps(scenario);
  const err = guess === null ? null : orderError(guess, truth);

  useIntroCaption(guessCaption(guess, truth), [guess, truth]);

  return (
    <StageFrame
      height={360}
      stats={
        <Stats>
          <Stat label="Your guess" value={guess === null ? '–' : `${power(guess, 10)} /s`} sub={[guess === null ? 'pick one first' : 'average requests per second']} />
          <Stat
            label="Answer"
            value={guess === null ? 'hidden' : `${bigText(truth)} /s`}
            sub={[guess === null ? 'shown after you guess' : `about 10^${sig(Math.log10(truth), 3)}`]}
          />
          <Stat
            label="Off by"
            value={err === null ? '–' : `${sig(Math.abs(err), 2)} orders`}
            color={err === null ? undefined : withinTenfold(guess!, truth) ? 'var(--ok)' : 'var(--bad)'}
            sub={[err === null ? '' : err < 0 ? 'too low' : 'too high']}
          />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'within 10×' }, { color: 'var(--bad)', label: 'more than 10× off' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="Scenario" value={scenarioId} onChange={(v) => { setScenarioId(v); setGuess(null); }} options={SCENARIO_OPTIONS} />
        </>,
        <>
          <Segmented label="Average requests per second, to the nearest power of ten" value={guess ?? -1} onChange={setGuess} options={[...GUESS_OPTIONS]} />
          <Button onClick={() => setGuess(null)}>Hide the answer</Button>
        </>,
      ]}
    >
      <div className="boe-stage stage-pad">
        <Box className="boe-strip">
          <SectionTitle>The system</SectionTitle>
          <p className="boe-units">{scenario.name}. What is the average request rate?</p>
          {guess === null ? <Hint tone="muted" block>Guess first: the arithmetic is shown only after you pick.</Hint> : (
            <p className="boe-units">{bigText(scenario.dau)} users/day × {scenario.actionsPerUser} req/user ÷ 86,400 s/day = <b>{bigText(truth)} req/s</b></p>
          )}
        </Box>
        <div className="boe-chips">
          <Provenance kind="invented">the three systems are made up</Provenance>
        </div>
        <Hint tone="muted" className="boe-note">Being within a factor of ten is the goal: estimates are for order of magnitude.</Hint>
      </div>
    </StageFrame>
  );
}
