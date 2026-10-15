import { useScenePicker } from '../../components/ScenePicker';
import { CondenseScene } from './CondenseScene';
import { KosarajuScene } from './KosarajuScene';
import { OrderScene } from './OrderScene';
import { useSccEditor } from './useSccEditor';
import { WhyScene } from './WhyScene';
import './styles.css';

type Scene = 'kosaraju' | 'condense' | 'order' | 'why';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'kosaraju', label: 'Two passes' },
  { value: 'condense', label: 'Condensation' },
  { value: 'order', label: 'Try to break it' },
  { value: 'why', label: 'Why it matters' },
];

export function Stage() {
  const [scene, picker, setScene] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'kosaraju' });
  const ed = useSccEditor();
  if (scene === 'condense') return <CondenseScene picker={picker} ed={ed} />;
  if (scene === 'order') return <OrderScene picker={picker} ed={ed} />;
  if (scene === 'why') return <WhyScene picker={picker} ed={ed} onShow={() => setScene('kosaraju')} />;
  return <KosarajuScene picker={picker} ed={ed} />;
}
