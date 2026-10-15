import { useMemo, useState, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { searchFrames } from './frames';
import { parseKey } from './keys';
import { buildList } from './model';
import { DEFAULT_KEYS, DEFAULT_TARGET, LIST_SEED, defaultEntries } from './presets';
import { SkipDrawing } from './SkipDrawing';
import { drawingMinWidth } from './skipLayout';

const STEP_MS = 800;

export function SearchScene({ picker }: { picker: ReactNode }) {
  const entries = useMemo(() => defaultEntries(), []);
  const snap = useMemo(() => buildList(entries).snapshot(), [entries]);
  const [target, setTarget] = useState(DEFAULT_TARGET);
  const [text, setText] = useState(String(DEFAULT_TARGET));
  const [note, setNote] = useState<string | null>(null);
  const frames = useMemo(() => searchFrames(entries, target), [entries, target]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const f = player.frame;
  const done = f.found !== null || f.stop !== null;
  const walked = done ? (f.linear as number) : 0;

  const run = (key: number) => {
    setTarget(key);
    setText(String(key));
    setNote(null);
  };
  const submit = () => {
    const parsed = parseKey(text);
    if (parsed.ok) run(parsed.value);
    else setNote(parsed.error);
  };

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Skip list steps" value={f.moves + f.dropCount} color="var(--ok)" sub={`${f.moves} moves + ${f.dropCount} drops so far`} />
          <Stat label="Plain list steps" value={done ? f.linear : '–'} color={done ? 'var(--bad)' : undefined} sub="one move per key below the target" />
          <Stat label="Levels" value={snap.levels} sub="the tallest tower" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'search token', shape: 'dot' },
            { color: 'var(--info)', label: 'pointer followed', shape: 'line' },
            { color: 'var(--violet)', label: 'level dropped', shape: 'line' },
            { color: 'var(--ok)', label: 'found', shape: 'square' },
            { color: 'var(--dim)', label: 'last key below an absent target', shape: 'square' },
            { color: 'var(--bad)', label: 'the plain list walk', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Search for" value={text} onChange={setText} onEnter={submit} width={96} spellCheck={false} />
          <Button variant="primary" onClick={submit}>
            Search
          </Button>
          <Hint>
            <span role="status">{note ?? 'Any whole number from −999 to 999, present or not; or press a key in the plain list below.'}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="sl-stage stage-pad">
        <WideRegion minWidth={drawingMinWidth(snap)} label="Skip list: scroll sideways to see all of it">
        <SkipDrawing
          snap={snap}
          token={f.token}
          followed={f.followed}
          drops={f.drops}
          target={f.target}
          found={f.found}
          stop={f.stop}
          ariaLabel={`Skip list of ${snap.towers.length} keys, ${snap.levels} levels; searching for ${target}`}
        />
        </WideRegion>
        <Tray label="The same keys as a plain linked list: press one to search for it" labelWeight="regular" stack ariaLabel="Plain linked list">
          <ArrayStrip
            values={DEFAULT_KEYS}
            cellState={(i) => (done && DEFAULT_KEYS[i] === f.found ? 'done' : 'idle')}
            cellTone={(i) => (i < walked ? { tone: 'bad', fill: 'tint' } : null)}
            onCellClick={(i) => run(DEFAULT_KEYS[i])}
            cellTitle={(i) => `Search for ${DEFAULT_KEYS[i]}`}
            fontSize={12}
            cellMax={56}
          />
        </Tray>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the search runs on the list drawn; every step is counted from its pointers</Provenance>
        <Provenance kind="simulated" seed={LIST_SEED}>the towers of this list come from seeded coin flips</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
