import { useScenePicker } from '../../components/ScenePicker';
import { ContractScene } from './ContractScene';
import { DeployScene } from './DeployScene';
import { MeaningScene } from './MeaningScene';
import { VerifyScene } from './VerifyScene';
import './styles.css';

type SceneId = 'contract' | 'verify' | 'deploy' | 'meaning';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'contract', label: 'The consumer writes it' },
  { value: 'verify', label: 'The provider verifies' },
  { value: 'deploy', label: 'Can I deploy?' },
  { value: 'meaning', label: 'What it cannot see' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'contract' });
  if (scene === 'verify') return <VerifyScene picker={picker} />;
  if (scene === 'deploy') return <DeployScene picker={picker} />;
  if (scene === 'meaning') return <MeaningScene picker={picker} />;
  return <ContractScene picker={picker} />;
}
