import { useMemo, useState, type ReactNode } from 'react';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Segmented, Slider } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { swrCaption } from './captions';
import { PRICE_RANGE, isStale, swrFrames, swrMessages, type SwrFrame, type SwrMode } from './swr';

const ACTORS = [
  { id: 'ui', label: 'Component' },
  { id: 'cache', label: 'Query cache' },
  { id: 'server', label: 'Server' },
];
const MODES: { value: SwrMode; label: string }[] = [
  { value: 'swr', label: 'Read the cache (SWR)' },
  { value: 'copy', label: 'Copy into local state' },
];
const DEFAULT_PRICE = 14;

type Freshness = 'owner' | 'fresh' | 'stale' | 'empty';
const freshnessOf = (value: number | null, server: number): Freshness => (value === null ? 'empty' : value === server ? 'fresh' : 'stale');
const FRESH_NOTE: Record<Freshness, string> = { owner: 'the source', fresh: 'matches the server', stale: 'stale', empty: 'nothing yet' };

function ValueBox({ title, value, kind }: { title: string; value: number | null; kind: Freshness }) {
  return (
    <div className={`fs-value is-${kind}`} role="group" aria-label={`${title}: ${value === null ? 'nothing' : `$${value}`}, ${FRESH_NOTE[kind]}`}>
      <span className="fs-value-title">{title}</span>
      <b>{value === null ? '–' : `$${value}`}</b>
      <span className="fs-value-note">{FRESH_NOTE[kind]}</span>
    </div>
  );
}

export function ServerScene({ picker }: { picker: ReactNode }) {
  const [price, setPrice] = useState(DEFAULT_PRICE);
  const [mode, setMode] = useState<SwrMode>('swr');
  const frames = useMemo(() => swrFrames(price, mode).map((f) => ({ ...f, say: swrCaption(f, mode, price) })), [price, mode]);
  const player = usePlayer(frames, { interval: 1700 });
  const f: SwrFrame = player.frame;
  const messages = useMemo(() => swrMessages(price, mode), [price, mode]);

  return (
    <StageFrame
      player={player}
      height={520}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'fresh: matches the server' },
            { color: 'var(--bad)', label: 'stale: the server has moved on' },
            { color: 'var(--violet)', label: 'the server owns the truth' },
            { color: 'var(--hi)', label: 'message in flight' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="The component" value={mode} onChange={setMode} options={MODES} />
          <Slider label="Server price becomes" value={price} min={PRICE_RANGE.min} max={PRICE_RANGE.max} onChange={setPrice} format={(v) => `$${v}`} />
        </>,
      ]}
    >
      <div className="fs stage-pad">
        <div className="fs-values">
          <ValueBox title="Server" value={f.server} kind="owner" />
          <ValueBox title="Query cache" value={f.cache} kind={freshnessOf(f.cache, f.server)} />
          <ValueBox title="UI shows" value={f.ui} kind={freshnessOf(f.ui, f.server)} />
        </div>
        <SequenceDiagram actors={ACTORS} messages={messages} step={f.step} fit="shown" ariaLabel="Component, query cache and server exchanging a price" />
        <Hint block>
          {isStale(f) ? 'The UI is showing a value the server no longer has.' : 'The UI matches the server (or has nothing to show yet).'} The server and its latency are simulated: this is the shape of stale-while-revalidate, not a real client library.
        </Hint>
      </div>
    </StageFrame>
  );
}
