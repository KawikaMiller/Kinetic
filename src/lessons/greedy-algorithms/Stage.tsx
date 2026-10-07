import { useMemo, useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { ChipButton, ControlGroup } from '../../components/ui';
import { CoinsScene } from './CoinsScene';
import { ExchangeScene } from './ExchangeScene';
import { MeetingsScene } from './MeetingsScene';
import { meetings, PRESETS, randomMeetings, type PresetId, type Rule } from './model';
import './styles.css';

const SCENES = [
  { value: 'meetings' as const, label: 'Meetings' },
  { value: 'exchange' as const, label: 'Exchange argument' },
  { value: 'coins' as const, label: 'Coin change' },
];

type Source = { kind: 'preset'; id: PresetId } | { kind: 'random'; seed: number };

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'meetings' });
  const [source, setSource] = useState<Source>({ kind: 'preset', id: 'long' });
  const [rule, setRule] = useState<Rule>('start');
  const ms = useMemo(
    () => (source.kind === 'preset' ? meetings(PRESETS.find((p) => p.id === source.id)!.pairs) : randomMeetings(source.seed)),
    [source],
  );
  const nextSeed = source.kind === 'random' ? source.seed + 1 : 1;

  const presets = (
    <ControlGroup label="Day" inline className="gr-presets">
      {PRESETS.map((p) => (
        <ChipButton key={p.id} tone="info" size="md" on={source.kind === 'preset' && source.id === p.id} onClick={() => setSource({ kind: 'preset', id: p.id })}>
          {p.label}
        </ChipButton>
      ))}
      <ChipButton
        tone="info"
        size="md"
        on={source.kind === 'random'}
        title="Seeded, so the same number gives the same day. Press again for the next one."
        onClick={() => setSource({ kind: 'random', seed: nextSeed })}
      >
        {source.kind === 'random' ? `Random day #${source.seed}` : 'Random day'}
      </ChipButton>
    </ControlGroup>
  );

  if (scene === 'exchange') return <ExchangeScene picker={picker} presets={presets} meetings={ms} />;
  if (scene === 'coins') return <CoinsScene picker={picker} />;
  return <MeetingsScene picker={picker} presets={presets} meetings={ms} rule={rule} onRule={setRule} />;
}
