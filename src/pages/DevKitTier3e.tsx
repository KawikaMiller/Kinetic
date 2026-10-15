import { useState } from 'react';
import { ScenarioStory } from '../components/ScenarioStory';
import { SectionTitle } from '../components/Panel';
import { enumeratePaths, startWalk, validateScenario, type Scenario } from '../core/scenario';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round after wave 1, agent E: ScenarioStory + core/scenario (#/dev/kit). */

const PAGE: Scenario = {
  start: 'alert',
  meters: [
    { id: 'users', label: 'Users affected', start: 2, min: 0, max: 10, bad: { above: 6 }, unit: '%' },
    { id: 'trust', label: 'Team trust', start: 6, min: 0, max: 10, bad: { below: 3 } },
  ],
  nodes: [
    {
      id: 'alert',
      prompt: 'Error rates are climbing on checkout. What do you do first?',
      choices: [
        { id: 'rollback', label: 'Roll back the last deploy', to: 'after-rollback', effects: { users: -1 }, because: 'A rollback is the cheapest move that is easy to undo; it buys time to look.' },
        { id: 'dig', label: 'Dig through the logs before touching anything', to: 'after-dig', effects: { users: 3 }, because: 'Understanding first is tempting, but every minute of digging is a minute of errors.' },
      ],
    },
    {
      id: 'after-rollback',
      prompt: 'Errors drop, but only by half. What next?',
      choices: [
        { id: 'tell', label: 'Post an update to the status page', to: 'calm', effects: { trust: 2 }, because: 'Saying what you know, and what you do not, keeps people from guessing.' },
        { id: 'quiet', label: 'Keep quiet until you are sure', to: 'rumour', effects: { trust: -3 }, because: 'Silence leaves the story to whoever speaks first.' },
      ],
    },
    {
      id: 'after-dig',
      prompt: 'You find a slow query, and the fix is not trivial. What next?',
      choices: [
        { id: 'tell', label: 'Post an update to the status page', to: 'calm', effects: { trust: 2 }, because: 'Saying what you know, and what you do not, keeps people from guessing.' },
        { id: 'hotfix', label: 'Hotfix it now, alone', to: 'rumour', effects: { users: 2, trust: -2 }, because: 'A rushed fix with no second pair of eyes is how a small incident becomes a bigger one.' },
      ],
    },
  ],
  endings: [
    { id: 'calm', title: 'Contained and communicated', text: 'The errors subside and everyone knew what was going on while it happened.' },
    { id: 'rumour', title: 'Fixed, but nobody believes it', text: 'The system recovers; the story people tell about it is not yours.' },
  ],
};

/** The same scenario broken in four ways at once, to show what the validator says. */
const BROKEN: Scenario = {
  ...PAGE,
  nodes: [
    { ...PAGE.nodes[0], choices: [{ ...PAGE.nodes[0].choices[0], effects: { users: 40 } }, PAGE.nodes[0].choices[1]] },
    { ...PAGE.nodes[1], choices: [] },
    { id: 'island', prompt: 'Nobody can get here.', choices: [{ id: 'x', label: 'x', to: 'ghost', because: 'x' }] },
    PAGE.nodes[2],
  ],
};

const PATHS = enumeratePaths(PAGE).length;

export function DevKitTier3e() {
  const [walk, setWalk] = useState(() => startWalk(PAGE));
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 1 round, agent E</SectionTitle>
      <Section title="ScenarioStory · a branching decision simulator over core/scenario: pick (arrows move the choice), see the reason, Continue, Undo, Replay; meters and a ledger follow">
        <ScenarioStory
          scenario={PAGE}
          walk={walk}
          onWalk={setWalk}
          provenance="an invented incident: every effect is a made-up number chosen to show a trade-off"
          endingHint={validateScenario(PAGE).length === 0 ? `all ${PATHS} paths stay in bounds` : undefined}
          stepTitle={(n) => `Move ${n}`}
        />
      </Section>
      <Section title="validateScenario · the same scenario broken four ways: a path past a meter's bound, a dead end, an unreachable node, a missing target">
        <ul>
          {validateScenario(BROKEN).map((p) => (
            <li key={`${p.kind}-${p.detail}`}>
              <b>{p.kind}</b>: {p.detail}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
