import { useScenePicker } from '../../components/ScenePicker';
import { BellmanFordScene } from './BellmanFordScene';
import { CostScene } from './CostScene';
import { DijkstraScene } from './DijkstraScene';
import { useGraphEditor } from './useGraphEditor';
import { FloydWarshallScene } from './FloydWarshallScene';
import './styles.css';

type Scene = 'bellman' | 'dijkstra' | 'floyd' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'bellman', label: 'Bellman-Ford in rounds' },
  { value: 'dijkstra', label: 'Why not Dijkstra' },
  { value: 'floyd', label: 'Floyd-Warshall' },
  { value: 'cost', label: 'Cost' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'bellman' });
  const ed = useGraphEditor();
  if (scene === 'dijkstra') return <DijkstraScene picker={picker} ed={ed} />;
  if (scene === 'floyd') return <FloydWarshallScene picker={picker} ed={ed} />;
  if (scene === 'cost') return <CostScene picker={picker} ed={ed} />;
  return <BellmanFordScene picker={picker} ed={ed} />;
}
