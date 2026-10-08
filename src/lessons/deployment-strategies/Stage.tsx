import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { Button } from '../../components/ui';
import { CompareScene } from './CompareScene';
import { Presets, StrategyKnobs, StrategyPicker, WorldKnobs } from './Controls';
import { DeployScene } from './DeployScene';
import { DEFAULTS, type Config } from './model';
import { PRESETS } from './presets';
import './styles.css';

type Scene = 'deploy' | 'compare';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'deploy', label: 'One deploy' },
      { value: 'compare', label: 'Compare all four' },
    ],
    initial: 'deploy',
  });
  const [cfg, setCfg] = useState<Config>(DEFAULTS);
  const [bugMemory, setBugMemory] = useState(PRESETS[0].cfg.bugRate);
  const update = (patch: Partial<Config>, memory?: number) => {
    setCfg((c) => ({ ...c, ...patch }));
    if (memory !== undefined) setBugMemory(memory);
  };
  const pick = (c: Config) => update(c, c.bugRate > 0 ? c.bugRate : undefined);
  const sample = (
    <Button onClick={() => update({ seed: cfg.seed + 1 })}>New traffic sample (seed {cfg.seed})</Button>
  );

  const world = <WorldKnobs cfg={cfg} bugMemory={bugMemory} update={update} />;
  if (scene === 'compare') {
    return (
      <CompareScene
        cfg={cfg}
        controls={[
          picker,
          <Presets key="p" cfg={cfg} onPick={pick} />,
          <StrategyKnobs key="k" cfg={cfg} only={null} update={update} />,
          <>
            {world}
            {sample}
          </>,
        ]}
      />
    );
  }
  return (
    <DeployScene
      cfg={cfg}
      controls={[
        picker,
        <Presets key="p" cfg={cfg} onPick={pick} />,
        <>
          <StrategyPicker value={cfg.strategy} onChange={(strategy) => update({ strategy })} />
          <StrategyKnobs cfg={cfg} only={cfg.strategy} update={update} />
        </>,
        <>
          {world}
          {sample}
        </>,
      ]}
    />
  );
}
