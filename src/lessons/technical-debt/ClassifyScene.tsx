import { useEffect, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { classifyCaption } from './captions';
import { BOXES, CARDS, boxOf, isArguable, matches, matchesKey, placed, type BoxId, type Card, type Placements } from './quadrant';

/** What one card shows once the learner has checked: the key's verdict, derived from the current placement. */
function Verdict({ card, box }: { card: Card; box: BoxId | undefined }) {
  if (box === undefined) return <span className="chip tone-dim">not placed</span>;
  const ok = matchesKey(card, box);
  return (
    <div className="td-verdict">
      <span className={`chip tone-${ok ? 'ok' : 'bad'}`}>{ok ? 'matches the key' : 'not the key'}</span>
      {isArguable(card) && (
        <span className="chip tone-violet">arguable: {card.accepts.map((id) => boxOf(id).label).join(' or ')}</span>
      )}
      {!ok && !isArguable(card) && <span className="chip tone-violet">key: {boxOf(card.accepts[0]).label}</span>}
      <span className="td-why">{card.why}</span>
    </div>
  );
}

export function ClassifyScene({ picker }: { picker: ReactNode }) {
  const [placements, setPlacements] = useState<Placements>({});
  const [checked, setChecked] = useState(false);
  const setCaption = useSetCaption();

  useEffect(() => {
    setCaption(classifyCaption(placements, checked), { quiet: true });
  }, [setCaption, placements, checked]);

  const place = (card: Card, box: BoxId) => setPlacements({ ...placements, [card.id]: placements[card.id] === box ? undefined : box });
  const reset = () => {
    setPlacements({});
    setChecked(false);
  };

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Placed" value={`${placed(placements)}/${CARDS.length}`} />
          <Stat label="Match the key" value={checked ? `${matches(placements)}/${placed(placements)}` : 'not checked'} color={checked ? 'var(--ok)' : 'var(--muted)'} sub="the lesson's opinion" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            ...BOXES.map((b) => ({ color: `var(--${b.tone})`, label: b.label, shape: 'square' as const })),
            { color: 'var(--ok)', label: 'matches the key', shape: 'square' },
            { color: 'var(--bad)', label: 'not the key', shape: 'square' },
            { color: 'var(--violet)', label: 'arguable: both boxes', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button variant="primary" onClick={() => setChecked(true)} disabled={placed(placements) === 0}>Check my sorting</Button>
          <Button onClick={reset}>Start over</Button>
        </>,
      ]}
    >
      <div className="td stage-pad">
        <div className="td-boxes">
          {BOXES.map((b) => (
            <Box key={b.id} variant="sunken" className={`td-box tone-${b.tone}`}>
              <SectionTitle>{b.label}</SectionTitle>
              <ul>
                {CARDS.filter((c) => placements[c.id] === b.id).map((c) => (
                  <li key={c.id}>{c.text}</li>
                ))}
              </ul>
            </Box>
          ))}
        </div>

        <ul className="td-cards">
          {CARDS.map((c) => (
            <li key={c.id} className="td-card">
              <p>{c.text}</p>
              <div className="td-place" role="group" aria-label={`Place: ${c.text}`}>
                {BOXES.map((b) => (
                  <ChipButton key={b.id} tone={b.tone} on={placements[c.id] === b.id} onStyle="solid" onClick={() => place(c, b.id)}>
                    {b.label}
                  </ChipButton>
                ))}
              </div>
              {checked && <Verdict card={c} box={placements[c.id]} />}
            </li>
          ))}
        </ul>

        <div className="td-notes">
          <Provenance kind="invented">six invented scenarios</Provenance>
          <span className="td-claim">
            <ClaimLabel kind="view">a four-box framework popularly credited to Martin Fowler, written from memory; one view, not a standard</ClaimLabel>
            <ClaimLabel kind="view">the key is the lesson&apos;s opinion</ClaimLabel>
          </span>
          <Hint block>Deliberate or inadvertent asks whether anyone chose the shortcut. Reckless or prudent asks whether the choice weighed its cost.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
