import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { NA } from '../../core/format';
import { LogStream, type StreamRow } from './LogStream';
import { ServiceMap } from './ServiceMap';
import {
  DEFAULT_SEED, FAILED_USER, QUERY_HELP, SERVICES, SERVICE_TONE, displayParts, filterHits, grepLines, makeRun, parseQuery, scoreHits, textParts, type Format, type Run, type Service,
} from './model';

const TEXT_DEFAULT = `user ${FAILED_USER}`;
const defaultQuery = (format: Format, run: Run) => (format === 'text' ? TEXT_DEFAULT : `request_id=${run.failedId}`);

const presetsFor = (format: Format, run: Run): string[] =>
  format === 'text'
    ? [TEXT_DEFAULT, `order ${run.failedOrderId}`, 'ERROR']
    : [`request_id=${run.failedId}`, `order_id=${run.failedOrderId}`, 'level>=WARN', 'service=payments AND level>=ERROR'];

export function FindScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [format, setFormat] = useState<Format>('text');
  const run = useMemo(() => makeRun(seed), [seed]);
  const [query, setQuery] = useState(() => defaultQuery('text', makeRun(DEFAULT_SEED)));
  const [replay, setReplay] = useState(0);

  const parsed = format === 'json' ? parseQuery(query) : null;
  const refusal = parsed && !parsed.ok ? parsed.message : null;
  const hits = useMemo(() => (format === 'text' ? grepLines(run.events, query) : parsed?.ok ? filterHits(run.events, parsed.clauses) : new Set<number>()), [format, query, parsed, run]);
  const active = query.trim() !== '' && refusal === null;
  const score = scoreHits(run.events, hits, run.failedIdx);
  const lit = new Set<Service>(run.events.filter((e) => e.requestIdx === run.failedIdx && hits.has(e.seq)).map((e) => e.service));

  const rows: StreamRow[] = run.events.map((e) => {
    const d = displayParts(e, format, false);
    return { key: e.seq, service: e.service, level: e.level, head: d.head, tag: format === 'text' ? textParts(e).tag : e.service, body: d.body, match: active ? hits.has(e.seq) : null };
  });

  const changeFormat = (f: Format) => {
    setFormat(f);
    setQuery(defaultQuery(f, run));
  };
  const nextSeed = () => {
    const next = makeRun(seed + 1);
    setSeed(seed + 1);
    setQuery(defaultQuery(format, next));
  };

  useIntroCaption(
    active ? (
      <>
        <b>{score.hits}</b> lines match. The failed request wrote <b>{score.truth}</b> lines: <span className="hl ok">{score.found} found</span>, <span className={score.missed ? 'hl bad' : 'hl ok'}>{score.missed} missed</span>,{' '}
        <span className={score.falseHits ? 'hl bad' : 'hl ok'}>{score.falseHits} unrelated</span>.
      </>
    ) : (
      <>
        Ten requests share one log. One of them failed in <b>payments</b>. {refusal ? 'That query is not in the supported syntax; see the message below it.' : 'Search for its lines.'}
      </>
    ),
    [active, score.hits, score.truth, score.found, score.missed, score.falseHits, refusal],
  );

  return (
    <StageFrame
      height={460}
      stats={
        <Stats>
          <Stat label="Lines returned" value={active ? score.hits : NA} />
          <Stat label="Failed request's lines found" value={active ? `${score.found} / ${score.truth}` : NA} color={active ? 'var(--ok)' : undefined} />
          <Stat label="Missed" value={active ? score.missed : NA} color={active ? (score.missed ? 'var(--bad)' : 'var(--ok)') : undefined} />
          <Stat label="Unrelated hits" value={active ? score.falseHits : NA} color={active ? (score.falseHits ? 'var(--bad)' : 'var(--ok)') : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'matched line · its request path' },
            { color: 'var(--bad)', label: 'ERROR' },
            { color: 'var(--orange)', label: 'WARN' },
            ...SERVICES.map((s) => ({ color: `var(--${SERVICE_TONE[s]})`, label: s })),
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Log format" value={format} onChange={changeFormat} options={[{ value: 'text', label: 'Free text' }, { value: 'json', label: 'Structured JSON' }]} />
          <Button onClick={nextSeed}>New traffic</Button>
        </>,
        <>
          <TextField label={format === 'text' ? 'grep -i' : 'Filter'} value={query} onChange={setQuery} width="100%" spellCheck={false} className="sl-field" />
          <ControlGroup label="Try" inline className="sl-presets">
            {presetsFor(format, run).map((p) => (
              <ChipButton key={p} tone="info" on={query === p} onClick={() => setQuery(p)}>
                {p}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
      ]}
    >
      <div className="sl stage-pad">
        <ServiceMap
          lit={lit}
          replayKey={replay}
          packetLabel={format === 'json' ? run.failedId : 'POST /checkout'}
          note={format === 'json' ? `x-request-id: ${run.failedId} travels with every call` : 'no id travels with the calls'}
        />
        <Button onClick={() => setReplay(replay + 1)}>Replay the failed request</Button>
        {refusal ? (
          <p className="sl-refusal" role="alert">
            {refusal}
          </p>
        ) : (
          <p className="sl-help">{format === 'text' ? 'Plain substring search over the text, like grep -i. Nothing else in the line is queryable.' : `Syntax: ${QUERY_HELP}`}</p>
        )}
        <LogStream rows={rows} label={`Log lines, ${format === 'text' ? 'free text' : 'JSON'}`} />
        <Hint block>
          Simulated services and logs: the ten requests, the lines and the timings are scripted. The failed request is the only one that fails, and the search results are scored against the lines the simulation
          knows belong to it.
        </Hint>
      </div>
    </StageFrame>
  );
}
