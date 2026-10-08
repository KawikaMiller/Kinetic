import { useScenePicker } from '../../components/ScenePicker';
import { RulesScene } from './RulesScene';
import { TreeScene } from './TreeScene';
import './styles.css';

const SCENES = [
  { value: 'tree' as const, label: 'Your dependency tree' },
  { value: 'rules' as const, label: 'The rule table' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'tree' });
  return scene === 'rules' ? <RulesScene picker={picker} /> : <TreeScene picker={picker} />;
}
