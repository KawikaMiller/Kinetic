import { useScenePicker } from '../../components/ScenePicker';
import { ContextsScene } from './ContextsScene';
import { DamageScene } from './DamageScene';
import { SinksScene } from './SinksScene';
import './styles.css';

type Scene = 'contexts' | 'sinks' | 'damage';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'contexts', label: '① Four contexts' },
  { value: 'sinks', label: '② Sinks' },
  { value: 'damage', label: '③ If it gets in' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'contexts' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  if (scene === 'sinks') return <SinksScene picker={picker} />;
  if (scene === 'damage') return <DamageScene picker={picker} />;
  return <ContextsScene picker={picker} />;
}
