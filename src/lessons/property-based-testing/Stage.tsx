import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { DEFAULT_CONFIG, type Config } from './config';
import { FireScene } from './FireScene';
import { GeneratorScene } from './GeneratorScene';
import { MatrixScene } from './MatrixScene';
import { ShrinkScene } from './ShrinkScene';
import './styles.css';

const SCENES = [
  { value: 'fire', label: 'Fire random inputs' },
  { value: 'shrink', label: 'Shrink' },
  { value: 'matrix', label: 'Properties worth writing' },
  { value: 'generator', label: 'Generator design' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'fire' });
  // Scenes 1 and 2 share one setup: shrinking works on the failure the first scene finds.
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const set = (patch: Partial<Config>) => setConfig({ ...config, ...patch });
  if (scene === 'shrink') return <ShrinkScene picker={picker} config={config} set={set} />;
  if (scene === 'matrix') return <MatrixScene picker={picker} />;
  if (scene === 'generator') return <GeneratorScene picker={picker} />;
  return <FireScene picker={picker} config={config} set={set} />;
}
