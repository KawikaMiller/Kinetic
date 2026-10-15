import { useScenePicker } from '../../components/ScenePicker';
import { CompareScene } from './CompareScene';
import { GroupsScene } from './GroupsScene';
import { RulesScene } from './RulesScene';
import { StepScene } from './StepScene';
import './styles.css';

type Scene = 'rules' | 'insert' | 'delete' | 'groups' | 'compare';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'rules', label: 'The four rules' },
  { value: 'insert', label: 'Insert and fix-up' },
  { value: 'delete', label: 'Delete' },
  { value: 'groups', label: 'The 2-3-4 view' },
  { value: 'compare', label: 'AVL vs red-black' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'rules' });
  if (scene === 'insert') return <StepScene picker={picker} mode="insert" />;
  if (scene === 'delete') return <StepScene picker={picker} mode="delete" />;
  if (scene === 'groups') return <GroupsScene picker={picker} />;
  if (scene === 'compare') return <CompareScene picker={picker} />;
  return <RulesScene picker={picker} />;
}
