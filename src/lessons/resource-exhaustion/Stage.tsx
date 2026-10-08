import { useScenePicker } from '../../components/ScenePicker';
import { CascadeScene } from './CascadeScene';
import { GameScene } from './GameScene';
import { GaugesScene } from './GaugesScene';
import { useRunState } from './useRunState';
import './styles.css';

type Scene = 'gauges' | 'cascade' | 'game';

export function Stage() {
  const run = useRunState();
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'gauges', label: 'Gauges' },
      { value: 'cascade', label: 'The cascade' },
      { value: 'game', label: 'Find the limit' },
    ],
    initial: 'gauges',
  });
  if (scene === 'cascade') return <CascadeScene picker={picker} run={run} />;
  if (scene === 'game') return <GameScene picker={picker} />;
  return <GaugesScene picker={picker} run={run} />;
}
