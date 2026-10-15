import { useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, TextField } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { DEFAULT_COIN_SEED, DEFAULT_INSERT_KEY, DEFAULT_P, P_OPTIONS, RIG_NOTE, RIG_OPTIONS } from './presets';
import type { Rig } from './model';
import { CoinChips } from './CoinChips';
import { SkipDrawing } from './SkipDrawing';
import { drawingMinWidth } from './skipLayout';
import { P_LABEL } from './text';
import { useListSession } from './useListSession';

const STEP_MS = 800;

export function InsertScene({ picker }: { picker: ReactNode }) {
  const session = useListSession();
  const [text, setText] = useState(String(DEFAULT_INSERT_KEY));
  const [p, setP] = useState<number>(DEFAULT_P);
  const [rig, setRig] = useState<Rig>('fair');
  const [seed, setSeed] = useState(DEFAULT_COIN_SEED);
  const player = usePlayer(session.frames, { interval: STEP_MS });
  const f = player.frame;
  const rigged = RIG_NOTE[rig];

  const insert = () => session.insert(text, { p, rig, seed });
  const flips = f.coins.length;
  const height = 1 + f.coins.filter(Boolean).length;

  return (
    <StageFrame
      player={player}
      height={300}
      stats={
        <Stats>
          <Stat label="Tower height" value={f.coins.length ? height : '–'} color={f.coins.length ? 'var(--hi)' : undefined} sub={f.coins.length ? `after ${flips} ${flips === 1 ? 'flip' : 'flips'}` : 'set by the coin flips'} />
          <Stat label="Pointer writes" value={f.writes} sub="two per level linked" />
          <Stat label="Keys" value={f.snap.towers.length} sub={`${f.snap.levels} ${f.snap.levels === 1 ? 'level' : 'levels'} drawn`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'token, new tower, pointer just written', shape: 'dot' },
            { color: 'var(--info)', label: 'pointer followed, node to link after', shape: 'dot' },
            { color: 'var(--violet)', label: 'level dropped', shape: 'line' },
            { color: 'var(--amber)', label: 'heads', shape: 'square' },
            { color: 'var(--pink)', label: 'tails', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Key" value={text} onChange={setText} onEnter={insert} width={96} spellCheck={false} />
          <Button variant="primary" onClick={insert}>
            Insert
          </Button>
          <Button onClick={() => session.remove(text)}>Delete</Button>
          <Button
            onClick={() => {
              player.queueNext({ play: false });
              session.reset();
              setText(String(DEFAULT_INSERT_KEY));
            }}
          >
            Reset list
          </Button>
        </>,
        <>
          <Segmented label="p" value={p} onChange={setP} options={P_OPTIONS.map((v) => ({ value: v, label: P_LABEL[v] }))} />
          <Segmented label="Coins" value={rig} onChange={setRig} options={RIG_OPTIONS} />
          {rig === 'fair' && <SeedField seed={seed} onSeed={setSeed} />}
          <Hint>
            <span role="status">{session.note ?? (rigged ? `Rigged coins are not random: ${rig === 'tails' ? 'height 1 every time, so the list degenerates into a plain linked list' : 'one tower as tall as the 16-level cap'}.` : 'A tower grows one level for each heads, up to a cap of 16 levels.')}</span>
          </Hint>
        </>,
      ]}
    >
      <div className="sl-stage stage-pad">
        <WideRegion minWidth={drawingMinWidth(f.snap)} label="Skip list: scroll sideways to see all of it">
        <SkipDrawing
          snap={f.snap}
          token={f.token}
          followed={f.followed}
          drops={f.drops}
          target={f.target}
          update={f.update}
          fresh={f.fresh}
          changed={f.changed}
          ariaLabel={`Skip list of ${f.snap.towers.length} keys, ${f.snap.levels} levels`}
        />
        </WideRegion>
        <CoinChips coins={f.coins} />
      </div>
      <ProvenanceRow>
        <Provenance kind="real">the search, the links and every pointer write happen on the list drawn</Provenance>
        {rig === 'fair' ? <Provenance kind="simulated" seed={seed}>coin flips come from a seeded generator, so a replay gives the same towers</Provenance> : <Provenance kind="scripted">the coins are rigged: not random</Provenance>}
      </ProvenanceRow>
    </StageFrame>
  );
}
