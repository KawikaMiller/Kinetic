import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Stat, Stats, TextField } from '../../components/ui';
import { plainTone } from '../../core/tone';
import { usePlayer } from '../../core/usePlayer';
import { countingFrames, type CountFrame } from './frames';
import { COUNT_KEYS, COUNT_MAX_ITEMS, COUNT_PRESETS, itemsOf, occurrenceTag, parseKeys, type Item } from './model';

const STEP_MS = 900;
const MAX_KEY = COUNT_KEYS - 1;
const KEY_CELL_MAX = 44;
const ITEM_CELL_MAX = 52;
const FONT = 14;

export function CountingScene({ picker }: { picker: ReactNode }) {
  const [keys, setKeys] = useState<number[]>([...COUNT_PRESETS[0].keys]);
  const [draft, setDraft] = useState(COUNT_PRESETS[0].keys.join(', '));
  const [error, setError] = useState<string | null>(null);
  const frames = useMemo(() => countingFrames(keys), [keys]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const items = useMemo(() => itemsOf(keys), [keys]);

  const load = (ks: readonly number[]) => {
    setKeys([...ks]);
    setDraft(ks.join(', '));
    setError(null);
  };
  const apply = () => {
    const r = parseKeys(draft, MAX_KEY, COUNT_MAX_ITEMS);
    if (!r.ok) return setError(r.error);
    load(r.keys);
  };

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Item comparisons" value={0} color="var(--ok)" sub="keys are used as indices" />
          <Stat label="Steps" value={f.work} color="var(--hi)" sub={`of ${2 * keys.length + COUNT_KEYS}: n + k + n`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'handled now' },
            { color: 'var(--info)', label: 'count per key' },
            { color: 'var(--violet)', label: 'next slot per key' },
            { color: 'var(--ok)', label: 'placed (outline)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Keys" value={draft} onChange={setDraft} onEnter={apply} width={220} spellCheck={false} />
          <Button onClick={apply}>Apply</Button>
        </>,
        <>
          <ControlGroup label="Presets" inline>
            {COUNT_PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" on={keys.join() === p.keys.join()} onClick={() => load(p.keys)}>
                {p.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Hint tone={error ? 'muted' : 'faint'} className="lts-note">
            <span role="status">{error ?? `Up to ${COUNT_MAX_ITEMS} whole numbers, 0 to ${MAX_KEY}: this demo sorts 0-${MAX_KEY}.`}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="lts stage-pad lts-rows">
        <Row title="Input">
          <ArrayStrip
            values={items.map((it) => it.id)}
            renderValue={(_, i) => <ItemTag item={items[i]} />}
            cellState={(i) => (i === f.current ? 'active' : f.placed.includes(i) ? 'dim' : 'idle')}
            fontSize={FONT}
            cellMax={ITEM_CELL_MAX}
          />
        </Row>
        <Row title={<>count[key] <span className="hint-inline">key = the index above</span></>}>
          <ArrayStrip
            values={f.counts}
            showIndex
            ranges={[{ from: 0, to: MAX_KEY, tone: 'info' }]}
            cellState={(k) => (k === f.hotKey && f.phase === 'count' ? 'active' : 'idle')}
            fontSize={FONT}
            cellMax={KEY_CELL_MAX}
          />
        </Row>
        <Row title="next slot for key">
          <ArrayStrip
            values={f.starts.map((v) => (v === null ? '·' : v))}
            showIndex
            ranges={[{ from: 0, to: MAX_KEY, tone: 'violet' }]}
            cellState={(k) => (k === f.hotKey && (f.phase === 'start' || f.phase === 'place') ? 'active' : 'idle')}
            fontSize={FONT}
            cellMax={KEY_CELL_MAX}
          />
        </Row>
        <Row title="Output">
          <ArrayStrip
            values={f.out.map((it, i) => (it ? it.id : `slot ${i}`))}
            showIndex
            renderValue={(_, i) => <OutCell item={f.out[i]} />}
            cellState={(i) => (i === f.slot ? 'active' : 'idle')}
            cellTone={(i) => (f.out[i] ? { tone: 'ok', fill: 'outline' } : null)}
            fontSize={FONT}
            cellMax={ITEM_CELL_MAX}
          />
        </Row>
      </div>
    </StageFrame>
  );
}

function Row({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="lts-row">
      <SectionTitle className="lts-row-title">{title}</SectionTitle>
      {children}
    </div>
  );
}

/** A key with its occurrence letter, coloured per occurrence so equal keys can be told apart. */
export function ItemTag({ item }: { item: Item }) {
  return (
    <span className={`lts-key tone-${plainTone(item.occurrence)}`}>
      {item.key}
      <span className="lts-tag">{occurrenceTag(item.occurrence)}</span>
    </span>
  );
}

function OutCell({ item }: { item: CountFrame['out'][number] }) {
  if (!item) return <span className="lts-empty">·</span>;
  return <ItemTag item={item} />;
}
