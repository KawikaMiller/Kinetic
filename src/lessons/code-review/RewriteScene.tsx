import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { plural } from '../../core/format';
import { bestOption, HARSH, QUALITIES, type HarshComment } from './feedback';

export function RewriteScene({ picker }: { picker: ReactNode }) {
  const [picked, setPicked] = useState<Record<string, number>>({});
  const setCaption = useSetCaption();

  useIntroCaption(
    <>
      Two comments from a rushed reviewer. Both are <i>right</i> about the code, and both will make the author defensive. Pick
      the rewrite you'd actually send.
    </>,
  );

  const choose = (c: HarshComment, i: number) => {
    setPicked({ ...picked, [c.id]: i });
    const option = c.options[i];
    const missing = QUALITIES.filter((q) => !option.has.includes(q.id));
    setCaption(
      missing.length === 0 ? (
        <>
          <span className="hl ok">That's the one.</span> It says what's wrong, why it matters and what to try, and it talks about
          the code, not the person.
        </>
      ) : (
        <>
          Better than the original? {option.has.length ? 'A bit.' : 'No.'} Still missing:{' '}
          <b>{missing.map((q) => q.label.toLowerCase()).join(', ')}</b>.
        </>
      ),
    );
  };

  return (
    <StageFrame
      height={420}
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'the harsh original' },
            { color: 'var(--hi)', label: 'your pick' },
            { color: 'var(--ok)', label: 'quality present' },
            { color: 'var(--dim)', label: 'quality missing' },
          ]}
        />
      }
      controls={picker}
    >
      <div className="crv stage-pad">
        {HARSH.map((c) => {
          const choice = picked[c.id];
          const option = choice === undefined ? null : c.options[choice];
          return (
            <Box key={c.id} className="crv-rewrite">
              <SectionTitle hint="on the line">
                <code>{c.line}</code>
              </SectionTitle>
              <p className="crv-harsh">“{c.harsh}”</p>
              <div className="crv-options">
                {c.options.map((o, i) => (
                  <button key={i} type="button" className={`crv-option ${choice === i ? 'is-picked' : ''}`} onClick={() => choose(c, i)} aria-pressed={choice === i}>
                    {o.text}
                  </button>
                ))}
              </div>
              <ul className="crv-qualities" aria-label="What the picked comment does">
                {QUALITIES.map((q) => (
                  <li key={q.id} className={option?.has.includes(q.id) ? 'is-yes' : 'is-no'}>
                    {option?.has.includes(q.id) ? '✓' : '·'} {q.label}
                  </li>
                ))}
              </ul>
              {choice !== undefined && choice !== bestOption(c) && (
                <p className="crv-nudge">{plural(QUALITIES.length - (option?.has.length ?? 0), 'quality', 'qualities')} missing: try another.</p>
              )}
            </Box>
          );
        })}
      </div>
    </StageFrame>
  );
}
