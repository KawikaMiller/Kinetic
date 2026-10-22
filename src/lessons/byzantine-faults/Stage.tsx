import { useScenePicker } from '../../components/ScenePicker';
import { QuorumScene } from './QuorumScene';
import { SampledScene } from './SampledScene';
import { SignedScene } from './SignedScene';
import { TraitorScene } from './TraitorScene';
import './styles.css';

type Scene = 'traitor' | 'quorums' | 'signed' | 'sampled';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'traitor', label: 'Be the traitor' },
  { value: 'quorums', label: 'Why 3f + 1' },
  { value: 'signed', label: 'Signatures change the game' },
  { value: 'sampled', label: 'A bigger cluster, sampled' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'traitor' });
  if (scene === 'quorums') return <QuorumScene key="quorums" picker={picker} />;
  if (scene === 'signed') return <SignedScene key="signed" picker={picker} />;
  if (scene === 'sampled') return <SampledScene key="sampled" picker={picker} />;
  return <TraitorScene key="traitor" picker={picker} />;
}
