import { useScenePicker } from '../../components/ScenePicker';
import { FetchScene } from './FetchScene';
import { InvoiceScene } from './InvoiceScene';
import { MetadataScene } from './MetadataScene';
import { OPENING, type SceneId } from './opening';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'fetch', label: 'The preview feature' },
  { value: 'metadata', label: 'Metadata hardening' },
  { value: 'invoices', label: 'Invoices and ids' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'metadata') return <MetadataScene key="metadata" picker={picker} />;
  if (scene === 'invoices') return <InvoiceScene key="invoices" picker={picker} />;
  return <FetchScene key="fetch" picker={picker} />;
}
