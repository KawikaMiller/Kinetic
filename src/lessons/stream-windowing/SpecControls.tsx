import { Segmented, Slider } from '../../components/ui';
import { GAP_RANGE, SIZE_RANGE, SLIDE_RANGE, type WindowControls, type WindowKind } from './windows';

const KIND_OPTIONS: { value: WindowKind; label: string }[] = [
  { value: 'tumbling', label: 'Tumbling' },
  { value: 'sliding', label: 'Sliding' },
  { value: 'session', label: 'Session' },
];
const seconds = (v: number) => `${v} s`;

/** The window type and the one to three sizes it uses: a size the type ignores is not shown. */
export function SpecControls({ value, onChange }: { value: WindowControls; onChange: (patch: Partial<WindowControls>) => void }) {
  return (
    <>
      <Segmented label="Windows" value={value.kind} onChange={(kind) => onChange({ kind })} options={KIND_OPTIONS} />
      {value.kind !== 'session' && <Slider label="Size S" value={value.size} {...SIZE_RANGE} format={seconds} onChange={(size) => onChange({ size })} />}
      {value.kind === 'sliding' && <Slider label="Slide L" value={value.slide} {...SLIDE_RANGE} format={seconds} onChange={(slide) => onChange({ slide })} />}
      {value.kind === 'session' && <Slider label="Gap G" value={value.gap} {...GAP_RANGE} format={seconds} onChange={(gap) => onChange({ gap })} />}
    </>
  );
}
