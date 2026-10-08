import { useScenePicker } from '../../components/ScenePicker';
import { BlastScene } from './BlastScene';
import { CredScene } from './CredScene';
import { PolicyScene } from './PolicyScene';
import './styles.css';

type Scene = 'policy' | 'blast' | 'creds';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'policy', label: '① Policy simulator' },
  { value: 'blast', label: '② Blast radius' },
  { value: 'creds', label: '③ Short-lived credentials' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'policy' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  if (scene === 'blast') return <BlastScene picker={picker} />;
  if (scene === 'creds') return <CredScene picker={picker} />;
  return <PolicyScene picker={picker} />;
}
