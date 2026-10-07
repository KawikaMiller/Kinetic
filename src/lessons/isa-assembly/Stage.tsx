import { useScenePicker } from '../../components/ScenePicker';
import type { ProgId } from './model';
import { ProgramScene } from './ProgramScene';
import { WidthsScene } from './WidthsScene';
import './styles.css';

type Scene = ProgId | 'widths';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Program',
    options: [
      { value: 'sum', label: 'sum (a loop)' },
      { value: 'max', label: 'max (if)' },
      { value: 'absdiff', label: 'absdiff (signed?)' },
      { value: 'area', label: 'struct field' },
      { value: 'widths', label: 'Register widths' },
    ],
    initial: 'sum',
  });
  if (scene === 'widths') return <WidthsScene picker={picker} />;
  return <ProgramScene key={scene} picker={picker} prog={scene} />;
}
