import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { contextsCaption } from './captions';
import { CONTEXTS, ENCODERS, SAMPLES, styleRuns, tally, verdict, type ContextId, type EncoderId } from './contexts';

const DEFAULT_SAMPLE = SAMPLES[1].value;
const TEMPLATE_NOTE: Record<ContextId, string> = {
  text: 'the comment sits between tags',
  attr: 'the comment is the value of a double-quoted attribute',
  url: 'the comment is one value in a link\'s query string',
  script: 'the comment is a string inside a script block',
};

export function ContextsScene({ picker }: { picker: ReactNode }) {
  const [value, setValue] = useState(DEFAULT_SAMPLE);
  const setCaption = useSetCaption();
  const t = tally(value);
  const total = CONTEXTS.length;

  useIntroCaption(<>One comment, written into four places in a page. Pick a sample and compare pasting it as typed, escaping it for HTML everywhere, and encoding it for the place it lands.</>);

  const pick = (v: string) => {
    setValue(v);
    setCaption(contextsCaption(v), { quiet: true });
  };
  const tone = (n: number) => (n === total ? 'var(--ok)' : 'var(--bad)');

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Pasted as typed" value={`${t.raw} of ${total}`} color={tone(t.raw)} sub="places stay data" />
          <Stat label="HTML-escaped everywhere" value={`${t.html} of ${total}`} color={tone(t.html)} sub="places stay data" />
          <Stat label="Encoded per context" value={`${t.right} of ${total}`} color={tone(t.right)} sub="places stay data" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'your text' },
            { color: 'var(--bad)', label: 'became structure' },
            { color: 'var(--ok)', label: 'encoded, stays data' },
          ]}
        />
      }
      controls={[
        picker,
        <ControlGroup key="s" label="Comment">
          {SAMPLES.map((s) => (
            <ChipButton key={s.id} tone="info" on={value === s.value} onClick={() => pick(s.value)}>{s.value}</ChipButton>
          ))}
        </ControlGroup>,
      ]}
    >
      <div className="stage-pad xss">
        <div className="xss-cards">
          {CONTEXTS.map((c) => (
            <Box key={c.id} className="xss-card" role="group" aria-label={c.label}>
              <SectionTitle hint={TEMPLATE_NOTE[c.id]}>{c.label}</SectionTitle>
              {ENCODERS.map((e) => (
                <Row key={e.id} ctx={c.id} enc={e.id} label={e.label} note={e.id === 'right' ? c.encoder : null} value={value} />
              ))}
            </Box>
          ))}
        </div>
        <Hint block>
          Simulated browser: a small model of how a page reads HTML, URLs and script strings. The comment is shown as inert text and is never put into this page as HTML.
        </Hint>
      </div>
    </StageFrame>
  );
}

function Row({ ctx, enc, label, note, value }: { ctx: ContextId; enc: EncoderId; label: string; note: string | null; value: string }) {
  const v = verdict(ctx, enc, value);
  const same = enc === 'html' && v.output === verdict(ctx, 'right', value).output;
  const ok = v.reading.intact;
  return (
    <div className="xss-row">
      <span className="xss-row-label">
        {label}
        {note && <span className="xss-note"> · {note}</span>}
        {same && <span className="xss-note"> · the same encoder as the right one here</span>}
      </span>
      <code className="xss-code">
        {styleRuns(v, enc).map((r, i) => (
          <span key={i} className={`xss-run is-${r.kind}`}>{r.text}</span>
        ))}
      </code>
      <p className={`log-row ${ok ? 'tone-ok' : 'tone-bad'} xss-verdict`}>{ok ? 'stays data' : v.reading.issues[0]}</p>
    </div>
  );
}
