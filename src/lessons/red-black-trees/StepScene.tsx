import { useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import type { Tone } from '../../core/tone';
import { buildRb, heightOf, sizeOf } from './model';
import { DELETE_DEFAULT_KEY, DEFAULT_SEED, DELETE_PRESETS, INSERT_PRESETS, deleteBase, insertStart, type DeletePreset, type InsertPreset } from './presets';
import { KEY_MAX, KEY_MIN, TREE_NODE_LIMIT, parseKeyList } from '../../core/keyInput';
import { RbTreeView } from './RbTreeView';
import { useRbSession } from './useRbSession';

const STEP_MS = 1100;

const LEGEND = [
  { color: 'var(--pink)', label: 'red node', shape: 'dot' },
  { color: 'var(--muted)', label: 'black node', shape: 'dot' },
  { color: 'var(--hi)', label: 'ring: the node being fixed', shape: 'line' },
  { color: 'var(--info)', label: 'ring: the uncle or sibling', shape: 'line' },
  { color: 'var(--bad)', label: 'ring: rule 3 broken', shape: 'line' },
  { color: 'var(--violet)', label: 'ring: just changed, or one black short', shape: 'line' },
] as const;

/** Scenes 2 and 3: insert with its fix-up, or delete with its fix-up, one step at a time. */
export function StepScene({ picker, mode }: { picker: ReactNode; mode: 'insert' | 'delete' }) {
  const [seed, setSeed] = useState(DEFAULT_SEED);
  const [presetId, setPresetId] = useState<string | null>(mode === 'insert' ? INSERT_PRESETS[0].id : DELETE_PRESETS[0].id);
  const startFor = () => {
    if (mode === 'insert') {
      const s = insertStart(INSERT_PRESETS[0].id, DEFAULT_SEED);
      return { base: s.base, op: 'insert' as const, key: s.key };
    }
    return { base: deleteBase(), op: 'delete' as const, key: DELETE_DEFAULT_KEY };
  };
  const session = useRbSession(startFor);
  const firstKey = startFor().key;
  const [keyText, setKeyText] = useState(String(firstKey));
  const [listText, setListText] = useState('30 10 20');
  const [listNote, setListNote] = useState<string | null>(null);
  const player = usePlayer(session.frames, { interval: STEP_MS });
  const f = player.frame;

  const loadInsert = (id: InsertPreset['id'], withSeed = seed) => {
    const s = insertStart(id, withSeed);
    player.queueNext({ play: false });
    session.restart({ base: s.base, op: 'insert', key: s.key });
    setKeyText(String(s.key));
    setPresetId(id);
  };
  const loadDelete = (p: DeletePreset) => {
    player.queueNext({ play: false });
    session.restart({ base: p.base(), op: 'delete', key: p.key });
    setKeyText(String(p.key));
    setPresetId(p.id);
  };
  const loadList = () => {
    const parsed = parseKeyList(listText);
    if (!parsed.ok) {
      setListNote(parsed.error);
      return;
    }
    setListNote(null);
    const keys = parsed.value;
    player.queueNext({ play: false });
    session.restart({ base: buildRb(keys.slice(0, -1)).tree, op: 'insert', key: keys[keys.length - 1] });
    setKeyText(String(keys[keys.length - 1]));
    setPresetId(null);
  };
  const submit = (op: 'insert' | 'delete') => {
    if (session.submit(op, keyText)) setPresetId(null);
  };

  const ringFor = (k: number): Tone | null => {
    if (f.bad.includes(k)) return 'bad';
    if (f.moved.includes(k)) return 'violet';
    if (k === f.hi) return 'hi';
    if (k === f.other) return 'info';
    return null;
  };

  return (
    <StageFrame
      player={player}
      height={470}
      stats={
        <Stats>
          <Stat label="Nodes" value={sizeOf(f.tree)} sub={`height ${heightOf(f.tree)}`} />
          <Stat label="Rotations" value={f.rotations} color={f.rotations ? 'var(--violet)' : undefined} sub="this operation: one left or right rotation each" />
          <Stat label="Recolours" value={f.recolors} color={f.recolors ? 'var(--violet)' : undefined} sub="this operation: one colour flip each, not added to rotations" />
        </Stats>
      }
      legend={<Legend items={[...LEGEND]} />}
      controls={[
        <>
          {picker}
          {mode === 'insert' ? (
            <ControlGroup label="Load" inline>
              {INSERT_PRESETS.map((p) => (
                <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => loadInsert(p.id)}>
                  {p.label}
                </ChipButton>
              ))}
            </ControlGroup>
          ) : (
            <ControlGroup label="Load" inline>
              {DELETE_PRESETS.map((p) => (
                <ChipButton key={p.id} tone="info" on={presetId === p.id} onClick={() => loadDelete(p)}>
                  {p.label}
                </ChipButton>
              ))}
            </ControlGroup>
          )}
          {mode === 'insert' && presetId === 'random' && (
            <SeedField
              seed={seed}
              onSeed={(s) => {
                setSeed(s);
                loadInsert('random', s);
              }}
            />
          )}
        </>,
        <>
          <TextField label="Key" value={keyText} onChange={setKeyText} onEnter={() => submit(mode)} width={96} spellCheck={false} />
          <Button variant="primary" onClick={() => submit('insert')}>
            Insert
          </Button>
          <Button onClick={() => submit('delete')}>Delete</Button>
          <Hint>
            <span role="status">{session.note ?? `Whole numbers from ${KEY_MIN} to ${KEY_MAX}, each once, up to ${TREE_NODE_LIMIT} nodes.`}</span>
          </Hint>
        </>,
        ...(mode === 'insert'
          ? [
              <>
                <TextField label="Your keys (the last one is stepped)" value={listText} onChange={setListText} onEnter={loadList} width={220} spellCheck={false} />
                <Button onClick={loadList}>Build, then step the last</Button>
                {listNote && <Hint><span role="status">{listNote}</span></Hint>}
              </>,
            ]
          : []),
      ]}
    >
      <div className="rb-stage stage-pad">
        <RbTreeView
          tree={f.tree}
          badge="color"
          rings={ringFor}
          short={f.short}
          ariaLabel={`Red-black tree of ${sizeOf(f.tree)} nodes`}
        />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the cases, rotations and recolours are what CLRS&apos;s algorithm does on this tree; every colour is recomputed</Provenance>
        {mode === 'insert' && presetId === 'random' && <Provenance kind="simulated" seed={seed}>the keys come from a seeded shuffle</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
