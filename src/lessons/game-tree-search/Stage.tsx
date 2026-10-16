import { useScenePicker } from '../../components/ScenePicker';
import { AlphaBetaScene } from './AlphaBetaScene';
import { DepthScene } from './DepthScene';
import { GameScene } from './GameScene';
import { MinimaxScene } from './MinimaxScene';
import './styles.css';

type Scene = 'minimax' | 'alphabeta' | 'game' | 'depth';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'minimax', label: 'A tree you can edit' },
  { value: 'alphabeta', label: 'Alpha-beta' },
  { value: 'game', label: 'Tic-tac-toe' },
  { value: 'depth', label: 'When the tree is too big' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'minimax' });
  if (scene === 'alphabeta') return <AlphaBetaScene key="alphabeta" picker={picker} />;
  if (scene === 'game') return <GameScene key="game" picker={picker} />;
  if (scene === 'depth') return <DepthScene key="depth" picker={picker} />;
  return <MinimaxScene key="minimax" picker={picker} />;
}
