import { useState } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { ChipButton } from '../../components/ui';
import { LAYERS, SPEC, type Layer } from './model';

const SCENARIOS: { id: string; text: string; layer: Layer; why: string }[] = [
  { id: 'price', text: "parsePrice('12.50') returns 1250 cents", layer: 'unit', why: 'Pure logic, no I/O: a unit test runs it in milliseconds.' },
  { id: 'round', text: 'A 0.5% discount on 1¢ rounds down to 0', layer: 'unit', why: 'An edge case of one function: exactly what unit tests are for.' },
  { id: 'orders', text: 'POST /orders saves a row in the test database', layer: 'integration', why: 'It checks two real pieces working together: your API and the database.' },
  { id: 'token', text: 'The API rejects an expired login token', layer: 'integration', why: 'It needs the real middleware stack, but not a browser.' },
  { id: 'checkout', text: 'A user can check out, start to finish', layer: 'e2e', why: 'One critical journey through the real UI: worth a few slow E2E tests.' },
  { id: 'safari', text: 'The pay button is visible in mobile Safari', layer: 'e2e', why: 'Only a real browser can show a real browser\'s layout bug.' },
];

/** "What should this test be?": pick a layer for each scenario, then see why. */
export function Scenarios() {
  const [picked, setPicked] = useState<Record<string, Layer>>({});
  const right = SCENARIOS.filter((s) => picked[s.id] === s.layer).length;
  return (
    <Box className="tpy-scen">
      <SectionTitle hint={`${right}/${SCENARIOS.length} right`}>What should this test be?</SectionTitle>
      <ul>
        {SCENARIOS.map((s) => {
          const choice = picked[s.id];
          const verdict = choice === undefined ? '' : choice === s.layer ? 'is-right' : 'is-wrong';
          return (
            <li key={s.id} className={verdict}>
              <span className="tpy-scen-text">{s.text}</span>
              <span className="tpy-scen-picks">
                {LAYERS.map((l) => (
                  <ChipButton key={l} tone={choice === l ? (l === s.layer ? 'ok' : 'bad') : 'violet'} on={choice === l} onClick={() => setPicked({ ...picked, [s.id]: l })}>
                    {SPEC[l].label}
                  </ChipButton>
                ))}
              </span>
              {choice !== undefined && (
                <span className="tpy-scen-why">
                  {choice === s.layer ? '✓ ' : `✗ Better as ${SPEC[s.layer].label.toLowerCase()}. `}
                  {s.why}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </Box>
  );
}
