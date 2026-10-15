import type { ReactNode } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { ForgetScene } from './ForgetScene';
import { NeverScene } from './NeverScene';
import { TextScene } from './TextScene';
import { useChain } from './useChain';
import { WeatherScene } from './WeatherScene';
import './styles.css';

type Scene = 'weather' | 'forget' | 'never' | 'text';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'weather', label: 'A weather chain' },
  { value: 'forget', label: 'How fast it forgets' },
  { value: 'never', label: 'When it never settles' },
  { value: 'text', label: 'A text chain' },
];

/** The weather chain's own state: mounted under a key per scene, so each scene opens on the default matrix, not on an edit made in the other. */
function ChainScene({ scene, picker }: { scene: 'weather' | 'forget'; picker: ReactNode }) {
  const chain = useChain();
  return scene === 'forget' ? <ForgetScene picker={picker} chain={chain} /> : <WeatherScene picker={picker} chain={chain} />;
}

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'weather' });
  if (scene === 'never') return <NeverScene picker={picker} />;
  if (scene === 'text') return <TextScene picker={picker} />;
  return <ChainScene key={scene} scene={scene} picker={picker} />;
}
