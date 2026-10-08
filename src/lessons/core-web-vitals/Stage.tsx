import { useScenePicker } from '../../components/ScenePicker';
import { ClsScene } from './ClsScene';
import { InpScene } from './InpScene';
import { LcpScene } from './LcpScene';
import './styles.css';

const SCENES = [
  { value: 'lcp', label: 'LCP: loading' },
  { value: 'cls', label: 'CLS: stability' },
  { value: 'inp', label: 'INP: responsiveness' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Metric', options: [...SCENES], initial: 'lcp' });
  switch (scene) {
    case 'cls':
      return <ClsScene picker={picker} />;
    case 'inp':
      return <InpScene picker={picker} />;
    default:
      return <LcpScene picker={picker} />;
  }
}
