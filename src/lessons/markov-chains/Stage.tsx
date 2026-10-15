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

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'weather' });
  const chain = useChain();
  if (scene === 'forget') return <ForgetScene picker={picker} chain={chain} />;
  if (scene === 'never') return <NeverScene picker={picker} />;
  if (scene === 'text') return <TextScene picker={picker} />;
  return <WeatherScene picker={picker} chain={chain} />;
}
