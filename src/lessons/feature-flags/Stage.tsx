import { useScenePicker } from '../../components/ScenePicker';
import { DebtScene } from './DebtScene';
import { KillScene } from './KillScene';
import { RolloutScene } from './RolloutScene';
import { RulesScene } from './RulesScene';
import './styles.css';

type Scene = 'rollout' | 'rules' | 'kill' | 'debt';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'rollout', label: 'Rollout dial' },
      { value: 'rules', label: 'Targeting rules' },
      { value: 'kill', label: 'Kill switch' },
      { value: 'debt', label: 'Flag debt' },
    ],
    initial: 'rollout',
  });
  if (scene === 'rules') return <RulesScene picker={picker} />;
  if (scene === 'kill') return <KillScene picker={picker} />;
  if (scene === 'debt') return <DebtScene picker={picker} />;
  return <RolloutScene picker={picker} />;
}
