import { useScenePicker } from '../../components/ScenePicker';
import { LakeScene } from './LakeScene';
import { NameScene } from './NameScene';
import { PipelineScene } from './PipelineScene';
import { StarScene } from './StarScene';
import { WorkloadScene } from './WorkloadScene';
import './styles.css';

type Scene = 'workloads' | 'flow' | 'star' | 'format' | 'names';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'workloads', label: 'Two workloads' },
  { value: 'flow', label: 'ETL vs ELT' },
  { value: 'star', label: 'Star schema' },
  { value: 'format', label: 'A table format over files' },
  { value: 'names', label: 'Pick a name' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'workloads' });
  if (scene === 'flow') return <PipelineScene key="flow" picker={picker} />;
  if (scene === 'star') return <StarScene key="star" picker={picker} />;
  if (scene === 'format') return <LakeScene key="format" picker={picker} />;
  if (scene === 'names') return <NameScene key="names" picker={picker} />;
  return <WorkloadScene key="workloads" picker={picker} />;
}
