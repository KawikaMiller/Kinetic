import { useScenePicker } from '../../components/ScenePicker';
import { BoundScene } from './BoundScene';
import { CountingScene } from './CountingScene';
import { RadixScene } from './RadixScene';
import './styles.css';

const SCENES = [
  { value: 'bound' as const, label: 'Lower bound' },
  { value: 'counting' as const, label: 'Counting sort' },
  { value: 'radix' as const, label: 'Radix sort' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'bound' });
  if (scene === 'counting') return <CountingScene picker={picker} />;
  if (scene === 'radix') return <RadixScene picker={picker} />;
  return <BoundScene picker={picker} />;
}
