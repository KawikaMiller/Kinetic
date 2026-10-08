import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { APP_DEFAULTS, type AppOptions } from './model';
import { NavigateScene } from './NavigateScene';
import './styles.css';

const SCENES = [
  { value: 'build', label: 'Bundle, shake, split' },
  { value: 'navigate', label: 'Load and navigate' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'build' });
  const [options, setOptions] = useState<AppOptions>(APP_DEFAULTS);
  return scene === 'navigate' ? (
    <NavigateScene picker={picker} options={options} onOptions={setOptions} />
  ) : (
    <BuildScene picker={picker} options={options} onOptions={setOptions} />
  );
}
