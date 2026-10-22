import { useScenePicker } from '../../components/ScenePicker';
import { BrooksScene } from './BrooksScene';
import { CrashScene } from './CrashScene';
import { OPENING, type SceneId } from './opening';
import { PathScene } from './PathScene';
import { PeopleScene } from './PeopleScene';
import { RiskScene } from './RiskScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'path', label: 'The critical path' },
  { value: 'crash', label: 'Crashing tasks' },
  { value: 'people', label: 'People' },
  { value: 'brooks', label: 'Adding people late' },
  { value: 'risk', label: 'Uncertainty' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'crash') return <CrashScene key="crash" picker={picker} />;
  if (scene === 'people') return <PeopleScene key="people" picker={picker} />;
  if (scene === 'brooks') return <BrooksScene key="brooks" picker={picker} />;
  if (scene === 'risk') return <RiskScene key="risk" picker={picker} />;
  return <PathScene key="path" picker={picker} />;
}
