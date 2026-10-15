import { useScenePicker } from '../../components/ScenePicker';
import { GroupsScene } from './GroupsScene';
import { PartitionsScene } from './PartitionsScene';
import { ReplicationScene } from './ReplicationScene';
import { RetentionScene } from './RetentionScene';
import './styles.css';

type Scene = 'partitions' | 'groups' | 'replication' | 'retention';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'partitions', label: 'Partitions and keys' },
  { value: 'groups', label: 'Consumer groups' },
  { value: 'replication', label: 'Replication' },
  { value: 'retention', label: 'Retention and compaction' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'partitions' });
  if (scene === 'groups') return <GroupsScene picker={picker} />;
  if (scene === 'replication') return <ReplicationScene picker={picker} />;
  if (scene === 'retention') return <RetentionScene picker={picker} />;
  return <PartitionsScene picker={picker} />;
}
