import { useScenePicker } from '../../components/ScenePicker';
import { AvroScene } from './AvroScene';
import { ProtoScene } from './ProtoScene';
import { RolloutScene } from './RolloutScene';
import './styles.css';

type SceneId = 'protobuf' | 'avro' | 'rollout';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'protobuf', label: 'Protobuf: evolve a message' },
  { value: 'avro', label: 'Avro and a registry' },
  { value: 'rollout', label: 'A rolling deploy' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'protobuf' });
  if (scene === 'avro') return <AvroScene picker={picker} />;
  if (scene === 'rollout') return <RolloutScene picker={picker} />;
  return <ProtoScene picker={picker} />;
}
