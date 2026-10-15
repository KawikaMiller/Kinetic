import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { LogStream } from '../../components/LogStream';
import { EMPTY_STREAM, STREAM_MAX_HEIGHT_PX, streamHighlight, toLogRows, type StreamRow } from './streamRows';
import { DEFAULT_SEED, REDACTED, cardShapes, displayParts, makeRun, renderLine, textParts, type Format } from './model';

const NOT_LOGGED = '(the request body is not logged)';

export function RedactScene({ picker }: { picker: ReactNode }) {
  const [logBody, setLogBody] = useState(true);
  const [redact, setRedact] = useState(false);
  const [format, setFormat] = useState<Format>('json');
  const run = useMemo(() => makeRun(DEFAULT_SEED, { logBody }), [logBody]);

  const rows: StreamRow[] = run.events.map((e) => {
    const d = displayParts(e, format, redact);
    const flag = e.body ? (cardShapes([d.body]) > 0 ? ('secret' as const) : d.body.includes(REDACTED) ? ('redacted' as const) : undefined) : undefined;
    return { key: e.seq, service: e.service, level: e.level, head: d.head, tag: format === 'text' ? textParts(e).tag : e.service, body: d.body, match: null, flag };
  });
  const cards = cardShapes(run.events.map((e) => renderLine(e, format, redact)));
  const sample = run.events.find((e) => e.body);
  const sampleLine = sample ? renderLine(sample, format, redact) : NOT_LOGGED;

  useIntroCaption(
    cards > 0 ? (
      <>
        Each charge logs the whole request body, so the log now holds <span className="hl bad">{cards} card numbers</span>, readable by anyone who can read logs. Redact them, or better, do not log the body.
      </>
    ) : logBody ? (
      <>
        The body is still logged, but each card number is masked as <span className="hl ok">{REDACTED}</span> before the line is written: <b>0</b> card-shaped strings left.
      </>
    ) : (
      <>
        Nothing sensitive is written because the body is not logged: <b>0</b> card-shaped strings, and nothing for a redaction rule to miss.
      </>
    ),
    [cards, logBody],
  );

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="Lines written" value={run.events.length} />
          <Stat label="Card-shaped strings in the log" value={cards} color={cards > 0 ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'unredacted card number', shape: 'square' },
            { color: 'var(--ok)', label: 'masked field', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Toggle label="Log the full request body" value={logBody} onChange={setLogBody} off="No" on="Yes" />
          <Toggle label="Redact before writing" value={redact} onChange={setRedact} off="Off" on="On" />
          <Segmented label="Log format" value={format} onChange={setFormat} options={[{ value: 'text', label: 'Free text' }, { value: 'json', label: 'Structured JSON' }]} />
        </>,
      ]}
    >
      <div className="sl stage-pad">
        <div className="sl-code">
          <CodePanel title="one payments line, as written" lines={[sampleLine]} stateOf={() => (cards > 0 ? 'bad' : sample ? 'good' : 'idle')} />
        </div>
        <LogStream rows={toLogRows(rows)} highlight={streamHighlight(rows)} maxHeight={STREAM_MAX_HEIGHT_PX} className="sl-stream" empty={EMPTY_STREAM} label="Log lines" />
        <Hint block>
          Simulated services and logs; the card number is fake and generated at runtime. The mask works by shape (a run of 13 to 19 digits), so it is a safety net: an oddly formatted number could slip past it, which is
          why the safest fix is not to log the body at all.
        </Hint>
      </div>
    </StageFrame>
  );
}
